from __future__ import annotations

import argparse
from pathlib import Path

from app.config import REPO_ROOT, get_settings
from app.models.scenario import ScenarioConfig
from app.services.demand_service import generate_demand
from app.services.network_service import build_network, latest_network
from app.services.osm_service import download_osm
from app.services.preset_service import load_presets
from app.services.simulation_service import execute_run


def main() -> int:
    parser = argparse.ArgumentParser(description="SUMO-Cesium pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    network = subparsers.add_parser(
        "network", help="download OSM and build the SUMO network"
    )
    network.add_argument("--force-download", action="store_true")
    network.add_argument("--force-build", action="store_true")
    demand = subparsers.add_parser(
        "demand", help="generate deterministic baseline demand"
    )
    demand.add_argument("--output", default="data/demand/baseline")
    run = subparsers.add_parser("run", help="execute a baseline simulation")
    run.add_argument("--output", default="data/runs/cli-baseline")
    run.add_argument("--preset", default="baseline")
    args = parser.parse_args()
    if args.command == "network":
        settings = get_settings()
        osm = download_osm(settings, force=args.force_download)
        artifact = build_network(settings, osm.path, force=args.force_build)
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
        settings = get_settings()
        network_path = latest_network(settings)
        if network_path is None:
            parser.error("network has not been prepared; run the network command first")
        artifact = generate_demand(
            network_path, ScenarioConfig(), Path(args.output).resolve()
        )
        print(
            f"Demand: {artifact.routed_count}/{artifact.requested_count} routed; "
            f"checksum {artifact.checksum}"
        )
    elif args.command == "run":
        settings = get_settings()
        network_path = latest_network(settings)
        if network_path is None:
            parser.error("network has not been prepared; run the network command first")
        available = load_presets(REPO_ROOT / "scenarios/presets")
        selected = next((item for item in available if item["id"] == args.preset), None)
        if selected is None:
            parser.error(f"unknown preset: {args.preset}")
        scenario = ScenarioConfig.model_validate(selected["scenario"])
        summary = execute_run(Path(args.output).resolve(), network_path, scenario)
        print(summary.model_dump_json(by_alias=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
