from __future__ import annotations

import json
import math
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings

from .checksum_service import file_checksum, object_checksum
from .network_service import latest_geojson


class BuildingLayerError(RuntimeError):
    pass


Coord = tuple[float, float]
Bounds = tuple[float, float, float, float]


def load_or_create_buildings(settings: Settings) -> dict[str, Any]:
    network_geojson = latest_geojson(settings)
    if network_geojson is None:
        raise BuildingLayerError("Network has not been prepared")

    output_path = _building_geojson_path(network_geojson)
    if output_path.is_file():
        return json.loads(output_path.read_text(encoding="utf-8"))

    network = json.loads(network_geojson.read_text(encoding="utf-8"))
    network_bounds = _bounds_for_collection(network)
    osm_buildings = _buildings_from_osm_candidates(
        _osm_candidates(settings, network_geojson), network_bounds
    )
    collection = (
        _feature_collection(osm_buildings, "osm")
        if osm_buildings
        else _context_buildings(network, network_bounds)
    )
    output_path.write_text(json.dumps(collection, separators=(",", ":")) + "\n", encoding="utf-8")
    _building_metadata_path(network_geojson).write_text(
        json.dumps(
            {
                "cacheKey": object_checksum(
                    {
                        "network": file_checksum(network_geojson),
                        "buildingCount": len(collection["features"]),
                        "source": collection["metadata"]["source"],
                    }
                ),
                "networkGeojson": network_geojson.name,
                "buildingGeojson": output_path.name,
                "source": collection["metadata"]["source"],
                "featureCount": len(collection["features"]),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return collection


def _building_geojson_path(network_geojson: Path) -> Path:
    return network_geojson.with_name(f"{network_geojson.stem}.buildings.geojson")


def _building_metadata_path(network_geojson: Path) -> Path:
    return network_geojson.with_name(f"{network_geojson.stem}.buildings.metadata.json")


def _feature_collection(features: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "metadata": {
            "source": source,
            "note": (
                "OSM building footprints are used when available; otherwise buildings are "
                "generated only as visual context and are not surveyed data."
            ),
        },
        "features": features,
    }


def _osm_candidates(settings: Settings, network_geojson: Path) -> list[Path]:
    candidates: list[Path] = []
    candidates.extend(sorted((settings.data_dir / "raw").glob("*.osm*")))

    metadata_path = network_geojson.with_name(f"{network_geojson.stem}.metadata.json")
    if metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        source_dataset = metadata.get("sourceDataset")
        if isinstance(source_dataset, str):
            local_root = _local_data_root()
            source_dir = (local_root / source_dataset).resolve()
            search_roots = [source_dir, source_dir.parent, source_dir.parent.parent]
            for root in search_roots:
                if root.is_dir():
                    candidates.extend(sorted(root.glob("map.osm")))
                    candidates.extend(sorted(root.glob("OpenStreetMap*/map.osm")))

    unique: list[Path] = []
    seen: set[Path] = set()
    for path in candidates:
        resolved = path.resolve()
        if resolved.is_file() and resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)
    return unique


def _local_data_root() -> Path:
    value = os.getenv("APP_LOCAL_DATA_DIR")
    if value:
        path = Path(value).expanduser()
        return (REPO_ROOT / path).resolve() if not path.is_absolute() else path.resolve()
    return (REPO_ROOT.parent / "Data").resolve()


def _buildings_from_osm_candidates(
    candidates: list[Path], network_bounds: Bounds
) -> list[dict[str, Any]]:
    for path in candidates:
        buildings = _parse_osm_buildings(path, network_bounds)
        if buildings:
            return buildings
    return []


def _parse_osm_buildings(path: Path, network_bounds: Bounds) -> list[dict[str, Any]]:
    nodes: dict[str, Coord] = {}
    buildings: list[dict[str, Any]] = []
    padded_bounds = _pad_bounds(network_bounds, 0.002)
    for _event, element in ET.iterparse(path, events=("end",)):
        tag_name = _local_name(element.tag)
        if tag_name == "node":
            node_id = element.attrib.get("id")
            latitude = _float_or_none(element.attrib.get("lat"))
            longitude = _float_or_none(element.attrib.get("lon"))
            if (
                node_id
                and latitude is not None
                and longitude is not None
                and _inside_bounds((longitude, latitude), padded_bounds)
            ):
                nodes[node_id] = (longitude, latitude)
        elif tag_name == "way":
            tags = {
                item.attrib.get("k", ""): item.attrib.get("v", "")
                for item in element
                if _local_name(item.tag) == "tag"
            }
            if "building" in tags:
                refs = [
                    item.attrib.get("ref", "")
                    for item in element
                    if _local_name(item.tag) == "nd"
                ]
                coordinates = [nodes[ref] for ref in refs if ref in nodes]
                if len(coordinates) >= 4 and coordinates[0] == coordinates[-1]:
                    buildings.append(
                        _building_feature(f"osm-{element.attrib.get('id')}", coordinates, tags)
                    )
        element.clear()
    return buildings


def _building_feature(
    building_id: str, coordinates: list[Coord], tags: dict[str, str]
) -> dict[str, Any]:
    height = _height_from_tags(tags, len(building_id))
    levels = max(1, round(height / 3.2))
    return {
        "type": "Feature",
        "id": building_id,
        "properties": {
            "featureType": "building",
            "buildingId": building_id,
            "height": height,
            "levels": levels,
            "source": "osm",
        },
        "geometry": {"type": "Polygon", "coordinates": [[list(coord) for coord in coordinates]]},
    }


def _context_buildings(network: dict[str, Any], bounds: Bounds) -> dict[str, Any]:
    linework = _linework(network)
    center_lon = (bounds[0] + bounds[2]) / 2
    center_lat = (bounds[1] + bounds[3]) / 2
    meters_per_lon, meters_per_lat = _meters_per_degree(center_lat)
    road_segments = [
        [
            ((lon_a - center_lon) * meters_per_lon, (lat_a - center_lat) * meters_per_lat),
            ((lon_b - center_lon) * meters_per_lon, (lat_b - center_lat) * meters_per_lat),
        ]
        for line in linework
        for (lon_a, lat_a), (lon_b, lat_b) in zip(line, line[1:], strict=False)
    ]
    min_x = (bounds[0] - center_lon) * meters_per_lon - 90
    max_x = (bounds[2] - center_lon) * meters_per_lon + 90
    min_y = (bounds[1] - center_lat) * meters_per_lat - 90
    max_y = (bounds[3] - center_lat) * meters_per_lat + 90

    features: list[dict[str, Any]] = []
    spacing_x = 42.0
    spacing_y = 38.0
    start_x = math.floor(min_x / spacing_x) * spacing_x
    start_y = math.floor(min_y / spacing_y) * spacing_y
    x_index = 0
    x = start_x
    while x <= max_x and len(features) < 90:
        y_index = 0
        y = start_y
        while y <= max_y and len(features) < 90:
            signature = abs((x_index + 3) * 73 + (y_index + 5) * 37)
            if signature % 5 != 0 and _distance_to_roads((x, y), road_segments) > 22:
                width = 17 + signature % 13
                depth = 14 + (signature // 3) % 12
                height = 8 + (signature % 7) * 3
                features.append(
                    _context_building_feature(
                        len(features),
                        x,
                        y,
                        width,
                        depth,
                        height,
                        center_lon,
                        center_lat,
                        meters_per_lon,
                        meters_per_lat,
                    )
                )
            y_index += 1
            y += spacing_y
        x_index += 1
        x += spacing_x
    return _feature_collection(features, "generated-context")


def _context_building_feature(
    index: int,
    center_x: float,
    center_y: float,
    width: float,
    depth: float,
    height: float,
    center_lon: float,
    center_lat: float,
    meters_per_lon: float,
    meters_per_lat: float,
) -> dict[str, Any]:
    half_width = width / 2
    half_depth = depth / 2
    ring_meters = [
        (center_x - half_width, center_y - half_depth),
        (center_x + half_width, center_y - half_depth),
        (center_x + half_width, center_y + half_depth),
        (center_x - half_width, center_y + half_depth),
        (center_x - half_width, center_y - half_depth),
    ]
    ring = [
        [center_lon + x / meters_per_lon, center_lat + y / meters_per_lat]
        for x, y in ring_meters
    ]
    building_id = f"context-building-{index:03d}"
    return {
        "type": "Feature",
        "id": building_id,
        "properties": {
            "featureType": "building",
            "buildingId": building_id,
            "height": height,
            "levels": max(1, round(height / 3.2)),
            "source": "generated-context",
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def _linework(collection: dict[str, Any]) -> list[list[Coord]]:
    lines: list[list[Coord]] = []
    for feature in collection.get("features", []):
        geometry = feature.get("geometry", {})
        if geometry.get("type") == "LineString":
            line = [
                (float(lon), float(lat))
                for lon, lat, *_rest in geometry.get("coordinates", [])
            ]
            if len(line) >= 2:
                lines.append(line)
    return lines


def _bounds_for_collection(collection: dict[str, Any]) -> Bounds:
    coordinates = list(_all_coordinates(collection))
    if not coordinates:
        raise BuildingLayerError("Network GeoJSON contains no coordinates")
    longitudes = [coordinate[0] for coordinate in coordinates]
    latitudes = [coordinate[1] for coordinate in coordinates]
    return min(longitudes), min(latitudes), max(longitudes), max(latitudes)


def _all_coordinates(value: Any) -> list[Coord]:
    if isinstance(value, dict):
        return [coord for item in value.values() for coord in _all_coordinates(item)]
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, int | float) for item in value[:2]):
            return [(float(value[0]), float(value[1]))]
        return [coord for item in value for coord in _all_coordinates(item)]
    return []


def _meters_per_degree(latitude: float) -> tuple[float, float]:
    meters_per_lat = 111_320.0
    meters_per_lon = meters_per_lat * max(0.1, math.cos(math.radians(latitude)))
    return meters_per_lon, meters_per_lat


def _distance_to_roads(
    point: tuple[float, float], segments: list[list[tuple[float, float]]]
) -> float:
    if not segments:
        return math.inf
    return min(_distance_to_segment(point, segment[0], segment[1]) for segment in segments)


def _distance_to_segment(
    point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]
) -> float:
    px, py = point
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)
    amount = max(0.0, min(1.0, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
    closest_x = sx + amount * dx
    closest_y = sy + amount * dy
    return math.hypot(px - closest_x, py - closest_y)


def _height_from_tags(tags: dict[str, str], fallback_index: int) -> float:
    explicit_height = _float_or_none(tags.get("height", "").replace("m", "").strip())
    if explicit_height is not None and 1 <= explicit_height <= 250:
        return explicit_height
    levels = _float_or_none(tags.get("building:levels"))
    if levels is not None and 1 <= levels <= 80:
        return levels * 3.2
    return 9 + fallback_index % 6 * 3


def _inside_bounds(coordinate: Coord, bounds: Bounds) -> bool:
    return bounds[0] <= coordinate[0] <= bounds[2] and bounds[1] <= coordinate[1] <= bounds[3]


def _pad_bounds(bounds: Bounds, amount: float) -> Bounds:
    return bounds[0] - amount, bounds[1] - amount, bounds[2] + amount, bounds[3] + amount


def _float_or_none(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
