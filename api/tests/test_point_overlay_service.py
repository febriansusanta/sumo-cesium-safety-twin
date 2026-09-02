from __future__ import annotations

import struct
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services.point_overlay_service import load_point_overlays

FieldSpec = tuple[str, str, int, int]


def _write_point_shapefile(
    stem: Path,
    points: list[tuple[float, float]],
    fields: list[FieldSpec],
    records: list[dict[str, Any]],
) -> None:
    stem.with_suffix(".cpg").write_text("UTF-8", encoding="utf-8")
    _write_shp(stem.with_suffix(".shp"), points)
    _write_dbf(stem.with_suffix(".dbf"), fields, records)


def _write_shp(path: Path, points: list[tuple[float, float]]) -> None:
    records = bytearray()
    for index, (longitude, latitude) in enumerate(points, start=1):
        content = struct.pack("<idd", 1, longitude, latitude)
        records.extend(struct.pack(">ii", index, len(content) // 2))
        records.extend(content)
    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    file_length = (100 + len(records)) // 2
    header = bytearray(100)
    struct.pack_into(">i", header, 0, 9994)
    struct.pack_into(">i", header, 24, file_length)
    struct.pack_into("<ii", header, 28, 1000, 1)
    struct.pack_into(
        "<4d",
        header,
        36,
        min(longitudes),
        min(latitudes),
        max(longitudes),
        max(latitudes),
    )
    path.write_bytes(bytes(header + records))


def _write_dbf(path: Path, fields: list[FieldSpec], records: list[dict[str, Any]]) -> None:
    header_length = 32 + len(fields) * 32 + 1
    record_length = 1 + sum(field[2] for field in fields)
    header = bytearray(header_length)
    header[0] = 3
    header[1:4] = bytes([126, 9, 2])
    struct.pack_into("<IHH", header, 4, len(records), header_length, record_length)
    offset = 32
    for name, kind, length, decimals in fields:
        encoded_name = name.encode("utf-8")[:11]
        header[offset : offset + len(encoded_name)] = encoded_name
        header[offset + 11] = ord(kind)
        header[offset + 16] = length
        header[offset + 17] = decimals
        offset += 32
    header[header_length - 1] = 13

    body = bytearray()
    for record in records:
        row = bytearray(b" " * record_length)
        field_offset = 1
        for name, kind, length, decimals in fields:
            value = record.get(name, "")
            if kind in {"N", "F"}:
                text = f"{float(value):>{length}.{decimals}f}" if value != "" else ""
                encoded = text.encode("ascii")
                row[field_offset : field_offset + len(encoded)] = encoded[:length]
            else:
                encoded = str(value).encode("utf-8")[:length]
                row[field_offset : field_offset + len(encoded)] = encoded
            field_offset += length
        body.extend(row)
    path.write_bytes(bytes(header + body + b"\x1a"))


def test_point_overlays_read_real_and_sumo_shapefiles(
    tmp_path: Path, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _write_point_shapefile(
        tmp_path / "real_point",
        [(120.1, 23.1)],
        [("事故類", "C", 20, 0)],
        [{"事故類": "crash"}],
    )
    _write_point_shapefile(
        tmp_path / "sumo_point",
        [(120.2, 23.2)],
        [("event_time", "F", 19, 3), ("min_ttc_s", "F", 19, 3), ("ego", "C", 20, 0)],
        [{"event_time": 12.5, "min_ttc_s": 1.2, "ego": "veh_1"}],
    )
    monkeypatch.setenv("APP_POINT_DATA_DIR", str(tmp_path))

    overlays = load_point_overlays(get_settings())

    assert overlays["metadata"]["counts"] == {"real": 1, "sumo": 1}
    real = next(
        feature
        for feature in overlays["features"]
        if feature["properties"]["overlayKind"] == "real"
    )
    sumo = next(
        feature
        for feature in overlays["features"]
        if feature["properties"]["overlayKind"] == "sumo"
    )
    assert real["properties"]["事故類"] == "crash"
    assert sumo["properties"]["severity"] == "critical"
    assert sumo["properties"]["minimumTtc"] == 1.2


def test_point_overlay_endpoint_serves_geojson(
    tmp_path: Path, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _write_point_shapefile(
        tmp_path / "sumo_point",
        [(120.2, 23.2)],
        [("event_time", "F", 19, 3), ("min_ttc_s", "F", 19, 3)],
        [{"event_time": 12.5, "min_ttc_s": 2.2}],
    )
    monkeypatch.setenv("APP_POINT_DATA_DIR", str(tmp_path))

    with TestClient(app) as client:
        response = client.get("/api/point-overlays")

    assert response.status_code == 200
    assert response.json()["type"] == "FeatureCollection"
    assert response.json()["metadata"]["counts"]["sumo"] == 1
