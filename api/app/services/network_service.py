from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import sumolib
from scripts.platform import resolve_executable

from app.config import Settings

from .checksum_service import file_checksum, object_checksum
from .coordinate_service import CoordinateTransformer, read_network_location

BASE_NETWORK_OPTIONS = [
    "--keep-edges.by-vclass",
    "passenger",
    "--remove-edges.isolated",
    "--junctions.join",
    "--tls.guess",
    "--geometry.remove",
    "--proj.utm",
    "--write-metadata",
    "--write-license",
]


class NetworkBuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class NetworkArtifact:
    network_path: Path
    geojson_path: Path
    metadata_path: Path
    cache_hit: bool
    edge_count: int
    lane_count: int
    junction_count: int


def _sumo_version(binary: Path) -> str:
    result = subprocess.run(
        [str(binary), "--version"], check=True, capture_output=True, text=True, timeout=20
    )
    return (result.stdout or result.stderr).splitlines()[0]


def validate_network(path: Path) -> dict[str, int]:
    network = sumolib.net.readNet(str(path), withInternal=False)
    edges = [edge for edge in network.getEdges() if edge.allows("passenger")]
    if len(edges) < 2:
        raise NetworkBuildError("network has fewer than two passenger-vehicle edges")
    routable = False
    for source in edges:
        for destination in edges:
            if source == destination:
                continue
            route, _ = network.getOptimalPath(source, destination, vClass="passenger")
            if route:
                routable = True
                break
        if routable:
            break
    if not routable:
        raise NetworkBuildError("network has no usable passenger route")
    return {
        "edges": len(edges),
        "lanes": sum(len(edge.getLanes()) for edge in edges),
        "junctions": len(network.getNodes()),
    }


def export_geojson(network_path: Path, destination: Path) -> dict[str, Any]:
    network = sumolib.net.readNet(str(network_path), withInternal=False)
    transformer = CoordinateTransformer(read_network_location(network_path))
    features: list[dict[str, Any]] = []
    for edge in network.getEdges():
        if not edge.allows("passenger"):
            continue
        for lane in edge.getLanes():
            coordinates = [transformer.to_wgs84(x, y) for x, y in lane.getShape()]
            if len(coordinates) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "id": lane.getID(),
                    "properties": {
                        "featureType": "lane",
                        "edgeId": edge.getID(),
                        "laneId": lane.getID(),
                        "speed": lane.getSpeed(),
                    },
                    "geometry": {"type": "LineString", "coordinates": coordinates},
                }
            )
    for node in network.getNodes():
        longitude, latitude = transformer.to_wgs84(*node.getCoord())
        features.append(
            {
                "type": "Feature",
                "id": node.getID(),
                "properties": {"featureType": "junction", "junctionId": node.getID()},
                "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
            }
        )
    collection = {"type": "FeatureCollection", "features": features}
    destination.write_text(json.dumps(collection, separators=(",", ":")) + "\n", encoding="utf-8")
    return collection


def build_network(settings: Settings, osm_path: Path, *, force: bool = False) -> NetworkArtifact:
    netconvert = resolve_executable("netconvert", "NETCONVERT_BINARY")
    if netconvert is None:
        raise NetworkBuildError("netconvert was not found; run scripts/doctor.py")
    version = _sumo_version(netconvert)
    bbox = settings.location.bbox
    options = [
        *BASE_NETWORK_OPTIONS,
        "--keep-edges.in-geo-boundary",
        f"{bbox.west},{bbox.south},{bbox.east},{bbox.north}",
    ]
    key = object_checksum(
        {"osm": file_checksum(osm_path), "sumoVersion": version, "options": options}
    )
    output_dir = settings.data_dir / "network"
    output_dir.mkdir(parents=True, exist_ok=True)
    network_path = output_dir / f"{settings.location.name}-{key[:12]}.net.xml"
    geojson_path = output_dir / f"{settings.location.name}-{key[:12]}.geojson"
    metadata_path = output_dir / f"{settings.location.name}-{key[:12]}.metadata.json"
    log_path = output_dir / f"{settings.location.name}-{key[:12]}.netconvert.log"
    if all(path.is_file() for path in (network_path, geojson_path, metadata_path)) and not force:
        stats = validate_network(network_path)
        return NetworkArtifact(network_path, geojson_path, metadata_path, True, *stats.values())

    command = [
        str(netconvert),
        "--osm-files",
        str(osm_path),
        "--output-file",
        str(network_path),
        *options,
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=120)
    log_content = (
        f"COMMAND: {json.dumps(command)}\n\nSTDOUT:\n{completed.stdout}"
        f"\nSTDERR:\n{completed.stderr}"
    )
    log_path.write_text(
        log_content,
        encoding="utf-8",
    )
    if completed.returncode != 0 or not network_path.is_file():
        raise NetworkBuildError(f"netconvert failed; inspect {log_path}")
    stats = validate_network(network_path)
    export_geojson(network_path, geojson_path)
    metadata_path.write_text(
        json.dumps(
            {
                "cacheKey": key,
                "networkChecksum": file_checksum(network_path),
                "osmChecksum": file_checksum(osm_path),
                "sumoVersion": version,
                "command": command,
                "stats": stats,
                "warnings": [line for line in completed.stderr.splitlines() if "Warning" in line],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return NetworkArtifact(network_path, geojson_path, metadata_path, False, *stats.values())


def latest_geojson(settings: Settings) -> Path | None:
    candidates = sorted(
        (settings.data_dir / "network").glob("*.geojson"), key=lambda p: p.stat().st_mtime
    )
    return candidates[-1] if candidates else None


def latest_network(settings: Settings) -> Path | None:
    candidates = sorted(
        (settings.data_dir / "network").glob("*.net.xml"), key=lambda p: p.stat().st_mtime
    )
    return candidates[-1] if candidates else None
