from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.config import REPO_ROOT, get_settings
from app.models.network import DrivingSide, NetworkBuildRequest, NetworkMetadata, NetworkStatus
from app.models.scenario import BoundingBox, ScenarioConfig
from app.services.checksum_service import file_checksum
from app.services.demand_service import generate_demand
from app.services.network_registry_service import NetworkRegistry
from app.services.network_service import build_network
from app.services.osm_service import download_osm
from app.services.preset_service import load_presets
from app.services.simulation_service import execute_run


def _network_request(args: argparse.Namespace) -> NetworkBuildRequest:
    settings = get_settings()
    bbox_values = [args.west, args.south, args.east, args.north]
    if any(value is not None for value in bbox_values) and any(
        value is None for value in bbox_values
    ):
        raise ValueError("--west, --south, --east and --north must be provided together")
    bbox = (
        BoundingBox(west=args.west, south=args.south, east=args.east, north=args.north)
        if all(value is not None for value in bbox_values)
        else settings.location.bbox
    )
    return NetworkBuildRequest(
        name=args.name or settings.location.name,
        bbox=bbox,
        driving_side=DrivingSide(args.driving_side),
        force_refresh=args.force_download or args.force_build,
    )


def _resolve_network(network_id: str | None) -> tuple[Path, NetworkMetadata] | None:
    registry = NetworkRegistry(get_settings())
    metadata = registry.get(network_id) if network_id else registry.latest_ready()
    if metadata is None and network_id is None:
        metadata = registry.register_legacy_latest()
    if metadata is None or metadata.status != NetworkStatus.READY:
        return None
    return registry.network_path(metadata.network_id), metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="SUMO-Cesium pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    network = subparsers.add_parser(
        "network", help="download OSM and build the SUMO network"
    )
    network.add_argument("--name")
    network.add_argument("--west", type=float)
    network.add_argument("--south", type=float)
    network.add_argument("--east", type=float)
    network.add_argument("--north", type=float)
    network.add_argument("--driving-side", choices=["right", "left"], default="right")
    network.add_argument("--force-download", action="store_true")
    network.add_argument("--force-build", action="store_true")
    demand = subparsers.add_parser(
        "demand", help="generate deterministic baseline demand"
    )
    demand.add_argument("--output", default="data/demand/baseline")
    demand.add_argument("--network-id")
    run = subparsers.add_parser("run", help="execute a baseline simulation")
    run.add_argument("--output", default="data/runs/cli-baseline")
    run.add_argument("--preset", default="baseline")
    run.add_argument("--network-id")
    args = parser.parse_args()
    if args.command == "network":
        settings = get_settings()
        request = _network_request(args)
        registry = NetworkRegistry(settings)
        network_id = registry.network_id_for(request)
        location = registry.location_for(request)
        directory = registry.network_path(network_id).parent
        registry.write_request(network_id, request)
        osm = download_osm(
            settings,
            location=location,
            destination_dir=directory,
            filename_stem="source",
            force=args.force_download,
        )
        artifact = build_network(
            settings,
            osm.path,
            location=location,
            destination_dir=directory,
            output_stem="network",
            driving_side=request.driving_side,
            force=args.force_build,
        )
        metadata = registry.metadata_from_artifacts(network_id, request, osm, artifact)
        registry.write_source_reference(network_id, request, osm, artifact)
        registry.write(metadata)
        print(f"Network ID: {network_id}")
        print(f"OSM: {osm.path} ({'cache' if osm.cache_hit else 'downloaded'})")
        print(
            f"Network: {artifact.network_path} ({'cache' if artifact.cache_hit else 'built'})"
        )
        print(
            f"Validated: {artifact.edge_count} passenger edges, {artifact.lane_count} lanes, "
            f"{artifact.junction_count} junctions"
        )
        print(f"GeoJSON: {artifact.geojson_path}")
    elif args.command == "demand":
        resolved_network = _resolve_network(args.network_id)
        if resolved_network is None:
            parser.error("network has not been prepared; run the network command first")
        network_path, _ = resolved_network
        artifact = generate_demand(
            network_path, ScenarioConfig(), Path(args.output).resolve()
        )
        print(
            f"Demand: {artifact.routed_count}/{artifact.requested_count} routed; "
            f"checksum {artifact.checksum}"
        )
    elif args.command == "run":
        resolved_network = _resolve_network(args.network_id)
        if resolved_network is None:
            parser.error("network has not been prepared; run the network command first")
        network_path, network_metadata = resolved_network
        available = load_presets(REPO_ROOT / "scenarios/presets")
        selected = next((item for item in available if item["id"] == args.preset), None)
        if selected is None:
            parser.error(f"unknown preset: {args.preset}")
        scenario = ScenarioConfig.model_validate(selected["scenario"])
        summary = execute_run(Path(args.output).resolve(), network_path, scenario)
        summary_payload = summary.model_dump(mode="json", by_alias=True)
        summary_payload.update(
            {
                "networkId": network_metadata.network_id,
                "networkName": network_metadata.name,
                "networkChecksum": network_metadata.network_checksum
                or file_checksum(network_path),
                "networkBbox": network_metadata.bbox.model_dump(
                    mode="json", by_alias=True
                ),
                "drivingSide": network_metadata.driving_side.value,
            }
        )
        (Path(args.output).resolve() / "summary.json").write_text(
            json.dumps(summary_payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(summary_payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
