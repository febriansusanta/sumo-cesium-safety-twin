from __future__ import annotations

import os
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings


class PointOverlayError(RuntimeError):
    pass


Coord = tuple[float, float]


@dataclass(frozen=True)
class DbfField:
    name: str
    kind: str
    length: int
    decimals: int


def load_point_overlays(settings: Settings) -> dict[str, Any]:
    root = _point_data_root()
    if not root.is_dir():
        raise PointOverlayError("Local point data folder was not found")

    features: list[dict[str, Any]] = []
    source_files: list[str] = []
    counts = {"real": 0, "sumo": 0}
    for stem, kind in (("real_point", "real"), ("sumo_point", "sumo")):
        shapefile = root / f"{stem}.shp"
        if not shapefile.is_file():
            continue
        point_features = _read_point_shapefile(shapefile, kind)
        features.extend(point_features)
        source_files.append(shapefile.name)
        counts[kind] += len(point_features)

    if not features:
        raise PointOverlayError("No point shapefiles were found in the local point data folder")

    return {
        "type": "FeatureCollection",
        "metadata": {
            "sourceDir": root.name,
            "sourceFiles": source_files,
            "counts": counts,
            "note": (
                "real_point.shp is shown as observed point data and sumo_point.shp is "
                "shown as SUMO-derived safety point data. These overlays are map context; "
                "they do not replace trajectory playback."
            ),
        },
        "features": features,
    }


def _point_data_root() -> Path:
    value = os.getenv("APP_POINT_DATA_DIR")
    if value:
        path = Path(value).expanduser()
        return (REPO_ROOT / path).resolve() if not path.is_absolute() else path.resolve()
    return (REPO_ROOT.parent / "Data" / "sumo").resolve()


def _read_point_shapefile(path: Path, kind: str) -> list[dict[str, Any]]:
    dbf_path = path.with_suffix(".dbf")
    if not dbf_path.is_file():
        raise PointOverlayError(f"{path.name} is missing its .dbf attribute table")

    points = _read_points(path)
    records = _read_dbf_records(dbf_path)
    features: list[dict[str, Any]] = []
    for index, coordinate in enumerate(points):
        if coordinate is None:
            continue
        attributes = records[index] if index < len(records) else {}
        if attributes is None:
            continue
        features.append(_point_feature(path.stem, kind, index, coordinate, attributes))
    return features


def _read_points(path: Path) -> list[Coord | None]:
    data = path.read_bytes()
    if len(data) < 100:
        raise PointOverlayError(f"{path.name} is not a valid shapefile")
    header_shape_type = struct.unpack("<i", data[32:36])[0]
    if header_shape_type not in {1, 11, 21}:
        raise PointOverlayError(f"{path.name} is not a point shapefile")

    points: list[Coord | None] = []
    offset = 100
    while offset + 8 <= len(data):
        content_length_words = struct.unpack(">i", data[offset + 4 : offset + 8])[0]
        content_length = content_length_words * 2
        content = data[offset + 8 : offset + 8 + content_length]
        offset += 8 + content_length
        if len(content) < 4:
            continue
        record_shape_type = struct.unpack("<i", content[:4])[0]
        if record_shape_type == 0:
            points.append(None)
            continue
        if record_shape_type not in {1, 11, 21} or len(content) < 20:
            points.append(None)
            continue
        longitude, latitude = struct.unpack("<2d", content[4:20])
        points.append((longitude, latitude))
    return points


def _read_dbf_records(path: Path) -> list[dict[str, Any] | None]:
    data = path.read_bytes()
    if len(data) < 33:
        raise PointOverlayError(f"{path.name} is not a valid DBF file")
    encoding = _dbf_encoding(path)
    record_count = struct.unpack("<I", data[4:8])[0]
    header_length = struct.unpack("<H", data[8:10])[0]
    record_length = struct.unpack("<H", data[10:12])[0]
    fields = _dbf_fields(data, encoding)

    records: list[dict[str, Any] | None] = []
    offset = header_length
    for _index in range(record_count):
        record = data[offset : offset + record_length]
        offset += record_length
        if not record or record[0:1] == b"*":
            records.append(None)
            continue
        values: dict[str, Any] = {}
        field_offset = 1
        for field in fields:
            raw_value = record[field_offset : field_offset + field.length]
            field_offset += field.length
            parsed = _parse_dbf_value(raw_value, field, encoding)
            if parsed not in {None, ""}:
                values[field.name] = parsed
        records.append(values)
    return records


def _dbf_fields(data: bytes, encoding: str) -> list[DbfField]:
    fields: list[DbfField] = []
    seen: dict[str, int] = {}
    offset = 32
    while offset + 32 <= len(data) and data[offset] != 13:
        raw_name = data[offset : offset + 11].split(b"\0", 1)[0]
        fallback_name = f"field_{len(fields) + 1}"
        name = _unique_name(_decode_dbf_text(raw_name, encoding) or fallback_name, seen)
        fields.append(
            DbfField(
                name=name,
                kind=chr(data[offset + 11]),
                length=data[offset + 16],
                decimals=data[offset + 17],
            )
        )
        offset += 32
    return fields


def _point_feature(
    stem: str,
    kind: str,
    index: int,
    coordinate: Coord,
    attributes: dict[str, Any],
) -> dict[str, Any]:
    longitude, latitude = coordinate
    properties = {
        "featureType": "pointOverlay",
        "overlayKind": kind,
        "sourceFile": f"{stem}.shp",
        "recordIndex": index + 1,
        **attributes,
    }
    if kind == "sumo":
        properties.update(_sumo_point_properties(attributes))
    else:
        properties["severity"] = "observed"
    return {
        "type": "Feature",
        "id": f"{kind}-{index + 1}",
        "properties": properties,
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
    }


def _sumo_point_properties(attributes: dict[str, Any]) -> dict[str, Any]:
    min_ttc = _number_or_none(attributes.get("min_ttc_s"))
    maximum_drac = _number_or_none(attributes.get("max_drac_m"))
    pet = _number_or_none(attributes.get("pet_s"))
    event_time = _number_or_none(attributes.get("event_time"))
    return {
        "eventTime": event_time,
        "minimumTtc": min_ttc,
        "maximumDrac": maximum_drac,
        "pet": pet,
        "severity": _ttc_severity(min_ttc),
    }


def _ttc_severity(value: float | None) -> str:
    if value is None:
        return "normal"
    if value <= 1.5:
        return "critical"
    if value <= 3.0:
        return "warning"
    return "normal"


def _parse_dbf_value(raw_value: bytes, field: DbfField, encoding: str) -> Any:
    text = _decode_dbf_text(raw_value, encoding).strip()
    if not text:
        return None
    if field.kind in {"N", "F", "B"}:
        try:
            if field.decimals > 0 or "." in text or "e" in text.lower():
                return float(text)
            return int(text)
        except ValueError:
            return text
    if field.kind == "L":
        return text.upper() in {"Y", "T"}
    if field.kind == "D" and len(text) == 8:
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return text


def _decode_dbf_text(value: bytes, encoding: str) -> str:
    cleaned = value.split(b"\0", 1)[0].strip()
    if not cleaned:
        return ""
    for candidate in (encoding, "utf-8", "cp950", "big5", "latin1"):
        try:
            return cleaned.decode(candidate)
        except UnicodeDecodeError:
            continue
    return cleaned.decode("utf-8", errors="replace")


def _dbf_encoding(path: Path) -> str:
    cpg_path = path.with_suffix(".cpg")
    if not cpg_path.is_file():
        return "utf-8"
    encoding = cpg_path.read_text(encoding="utf-8", errors="replace").strip()
    return encoding or "utf-8"


def _unique_name(name: str, seen: dict[str, int]) -> str:
    count = seen.get(name, 0)
    seen[name] = count + 1
    return name if count == 0 else f"{name}_{count + 1}"


def _number_or_none(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
