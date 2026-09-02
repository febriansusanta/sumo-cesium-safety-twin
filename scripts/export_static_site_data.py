from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

if sys.version_info < (3, 12):  # noqa: UP036
    raise SystemExit("Python 3.12 or 3.13 is required. Run this with the project .venv.")

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.config import get_settings
from app.services.network_registry_service import NetworkRegistry, NetworkRegistryError
from app.services.point_overlay_service import PointOverlayError, load_point_overlays

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = ROOT / "web" / "public" / "static-data"
RUN_FILES = (
    "run.json",
    "summary.json",
    "trajectories.json",
    "safety-events.json",
    "timeseries.json",
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export a completed local run as static JSON for GitHub Pages"
    )
    parser.add_argument(
        "--run-id",
        help="completed run id to export; defaults to newest completed run",
    )
    parser.add_argument(
        "--network",
        type=Path,
        help="network GeoJSON to export; defaults to newest",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=STATIC_ROOT,
        help="static-data output directory",
    )
    args = parser.parse_args()

    settings = get_settings()
    run_id = args.run_id or _latest_completed_run_id(settings.data_dir / "runs")
    if run_id is None:
        raise SystemExit("No completed run was found in data/runs")

    run_dir = settings.data_dir / "runs" / run_id
    missing = [name for name in RUN_FILES if not (run_dir / name).is_file()]
    if missing:
        raise SystemExit(f"Run {run_id} is missing required files: {', '.join(missing)}")
    run_payload = _read_json(run_dir / "run.json")

    output = args.output.resolve()
    _replace_static_root(output)

    network_path = (
        args.network
        or _network_geojson_for_run(settings, run_payload)
        or _latest_registered_network_geojson(settings)
        or _latest_network_geojson(settings.data_dir / "network")
    )
    if network_path is None:
        raise SystemExit("No network GeoJSON was found in data/networks or data/network")

    shutil.copyfile(network_path, output / "network.geojson")
    _write_json(
        output / "health.json",
        {"status": "ok", "service": "static-pages", "version": "0.1.0"},
    )
    _write_json(output / "presets.json", _load_static_presets())
    _write_json(output / "demo-runs.json", _load_demo_index())
    _write_json(output / "local-datasets.json", [])
    _write_json(output / "point-overlays.geojson", _load_point_overlays(settings))

    runs_dir = output / "runs" / run_id
    runs_dir.mkdir(parents=True, exist_ok=True)
    for filename in RUN_FILES:
        shutil.copyfile(run_dir / filename, runs_dir / filename)

    _write_json(output / "runs.json", [run_payload])
    _write_json(
        output / "index.json",
        {
            "title": "SUMO-Cesium Safety Twin static data",
            "mode": "read-only-github-pages",
            "runId": run_id,
            "network": network_path.name,
            "note": (
                "This export is for playback only. SUMO simulation and local imports "
                "require the FastAPI backend."
            ),
        },
    )
    print(f"Exported static site data for run {run_id} to {output}")
    return 0


def _replace_static_root(output: Path) -> None:
    repo_root = ROOT.resolve()
    if output == repo_root or repo_root not in output.parents:
        raise SystemExit(f"Refusing to replace output outside the repository: {output}")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)


def _latest_completed_run_id(runs_dir: Path) -> str | None:
    candidates: list[tuple[float, str]] = []
    for run_path in runs_dir.glob("*/run.json"):
        payload = _read_json(run_path)
        if payload.get("status") == "completed":
            candidates.append(
                (run_path.stat().st_mtime, str(payload.get("runId", run_path.parent.name)))
            )
    if not candidates:
        return None
    return sorted(candidates)[-1][1]


def _latest_network_geojson(network_dir: Path) -> Path | None:
    candidates = [
        path
        for path in network_dir.glob("*.geojson")
        if not path.name.endswith(".buildings.geojson")
    ]
    if not candidates:
        return None
    return sorted(candidates, key=lambda path: path.stat().st_mtime)[-1]


def _network_geojson_for_run(settings: Any, run_payload: dict[str, Any]) -> Path | None:
    network_id = run_payload.get("networkId")
    if not isinstance(network_id, str) or not network_id:
        return None
    try:
        path = NetworkRegistry(settings).geojson_path(network_id)
    except NetworkRegistryError:
        return None
    return path if path.is_file() else None


def _latest_registered_network_geojson(settings: Any) -> Path | None:
    registry = NetworkRegistry(settings)
    metadata = registry.latest_ready()
    if metadata is None:
        return None
    path = registry.geojson_path(metadata.network_id)
    return path if path.is_file() else None


def _load_static_presets() -> list[dict[str, Any]]:
    presets: list[dict[str, Any]] = []
    for path in sorted((ROOT / "scenarios" / "presets").glob("*.yaml")):
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
        scenario = payload.get("scenario", {})
        presets.append(
            {
                "id": scenario.get("presetId", path.stem),
                "name": scenario.get("name", path.stem),
                "description": payload.get("description", ""),
                "scenario": scenario,
                "limitations": payload.get("limitations", []),
            }
        )
    return presets


def _load_demo_index() -> list[dict[str, Any]]:
    index_path = ROOT / "demo" / "archives" / "index.json"
    if not index_path.is_file():
        return []
    return _read_json(index_path)


def _load_point_overlays(settings: Any) -> dict[str, Any]:
    try:
        return load_point_overlays(settings)
    except PointOverlayError:
        return {
            "type": "FeatureCollection",
            "metadata": {
                "counts": {"real": 0, "sumo": 0},
                "note": "No local point overlay shapefiles were exported.",
            },
            "features": [],
        }


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
