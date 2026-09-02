from __future__ import annotations

import json
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import REPO_ROOT, get_settings, public_config
from .jobs import RunConflictError, RunManager, load_summary
from .models.run import RunMetadata
from .models.scenario import ScenarioConfig
from .services.archive_service import ArchiveError, create_run_archive, import_run_archive
from .services.building_service import BuildingLayerError, load_or_create_buildings
from .services.local_data_service import (
    LocalDataImportError,
    discover_local_datasets,
    import_local_dataset,
)
from .services.network_service import latest_geojson, latest_network
from .services.preset_service import load_presets


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
        force=True,
    )


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    manager = RunManager(settings)
    await manager.start()
    application.state.run_manager = manager
    logging.getLogger(__name__).info("API startup complete")
    yield
    await manager.stop()


app = FastAPI(
    title="SUMO–Cesium Traffic-Safety Digital Twin API",
    version="0.1.0",
    description="Synthetic and uncalibrated local traffic-safety demonstrator.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api", "version": "0.1.0"}


@app.get("/api/config", tags=["system"])
def config() -> dict[str, object]:
    return public_config(get_settings())


@app.get("/api/environment", tags=["system"])
def environment() -> dict[str, object]:
    path = get_settings().data_dir / "environment.json"
    if not path.is_file():
        return {"status": "unknown", "simulationMode": "unknown", "versions": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        "status": "ready",
        "platform": payload.get("platform"),
        "architecture": payload.get("architecture"),
        "simulationMode": payload.get("simulationMode"),
        "versions": payload.get("versions", {}),
        "cesiumVersion": payload.get("cesiumVersion"),
        "timestamp": payload.get("timestamp"),
    }


@app.get("/api/network", tags=["network"])
def network() -> dict[str, object]:
    path = latest_geojson(get_settings())
    if path is None:
        raise HTTPException(status_code=404, detail="Network has not been prepared")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/buildings", tags=["network"])
def buildings() -> dict[str, object]:
    try:
        return load_or_create_buildings(get_settings())
    except BuildingLayerError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


def _manager(request: Request) -> RunManager:
    return request.app.state.run_manager


@app.get("/api/scenarios/presets", tags=["scenarios"])
def presets() -> list[dict[str, object]]:
    return load_presets(REPO_ROOT / "scenarios/presets")


@app.get("/api/local-datasets", tags=["runs"])
def local_datasets() -> list[dict[str, object]]:
    return [dataset.as_public_dict() for dataset in discover_local_datasets()]


@app.post("/api/local-datasets/{dataset_id}/import", response_model=RunMetadata, tags=["runs"])
def import_local_data(dataset_id: str, request: Request) -> RunMetadata:
    try:
        record = import_local_dataset(get_settings(), dataset_id)
        _manager(request).network = latest_network(get_settings())
    except LocalDataImportError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return record


@app.post("/api/scenarios/validate", tags=["scenarios"])
def validate_scenario(scenario: ScenarioConfig) -> dict[str, object]:
    warnings: list[str] = []
    if abs(scenario.vehicle.apparent_decel - scenario.vehicle.decel) > 2:
        warnings.append("apparentDecel differs substantially from decel")
    if scenario.demand.period < 1:
        warnings.append("The selected synthetic demand may heavily congest this compact network")
    return {
        "normalized": scenario.model_dump(mode="json", by_alias=True),
        "errors": [],
        "warnings": warnings,
        "checksum": scenario.checksum(),
        "disclaimer": get_settings().project.disclaimer,
    }


@app.post(
    "/api/runs", response_model=RunMetadata, status_code=status.HTTP_202_ACCEPTED, tags=["runs"]
)
def create_run(scenario: ScenarioConfig, request: Request) -> RunMetadata:
    return _manager(request).create(scenario)


@app.get("/api/runs", response_model=list[RunMetadata], tags=["runs"])
def list_runs(request: Request) -> list[RunMetadata]:
    return _manager(request).list()


@app.get("/api/runs/compare", tags=["runs"])
def compare_runs(
    request: Request,
    run_ids: Annotated[list[str], Query(alias="runIds")],
) -> dict[str, object]:
    if len(run_ids) != 2:
        raise HTTPException(status_code=422, detail="Exactly two runIds are required")
    summaries: list[dict[str, object]] = []
    for run_id in run_ids:
        _find_run(request, run_id)
        summary = load_summary(_manager(request).runs_dir / run_id / "summary.json")
        if summary is None:
            raise HTTPException(status_code=409, detail=f"Summary unavailable for {run_id}")
        summaries.append(summary)
    numeric_fields = (
        "completedVehicleCount",
        "meanTravelTime",
        "meanDelay",
        "hardBrakingEvents",
        "emergencyBrakingEvents",
        "ttcWarningEvents",
        "ttcCriticalEvents",
        "minimumObservedTtc",
        "maximumObservedDrac",
        "collisions",
        "teleports",
    )
    delta = {
        field: float(summaries[1][field]) - float(summaries[0][field])
        for field in numeric_fields
        if summaries[0].get(field) is not None and summaries[1].get(field) is not None
    }
    return {"runIds": run_ids, "summaries": summaries, "deltaSecondMinusFirst": delta}


def _find_run(request: Request, run_id: str) -> RunMetadata:
    record = _manager(request).get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return record


@app.get("/api/runs/{run_id}", response_model=RunMetadata, tags=["runs"])
@app.get("/api/runs/{run_id}/status", response_model=RunMetadata, tags=["runs"])
def get_run(run_id: str, request: Request) -> RunMetadata:
    return _find_run(request, run_id)


@app.get("/api/runs/{run_id}/summary", tags=["runs"])
def get_summary(run_id: str, request: Request) -> dict[str, object]:
    _find_run(request, run_id)
    summary = load_summary(_manager(request).runs_dir / run_id / "summary.json")
    if summary is None:
        raise HTTPException(status_code=409, detail="Run summary is not available")
    return summary


@app.get("/api/runs/{run_id}/trajectories", tags=["runs"])
def get_trajectories(run_id: str, request: Request) -> list[dict[str, object]]:
    _find_run(request, run_id)
    path = _manager(request).runs_dir / run_id / "trajectories.json"
    if not path.is_file():
        raise HTTPException(status_code=409, detail="Run trajectories are not available")
    return json.loads(path.read_text(encoding="utf-8"))


def _run_json(request: Request, run_id: str, filename: str) -> object:
    _find_run(request, run_id)
    path = _manager(request).runs_dir / run_id / filename
    if not path.is_file():
        raise HTTPException(status_code=409, detail=f"Run {filename} is not available")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/runs/{run_id}/safety-events", tags=["runs"])
def get_safety_events(run_id: str, request: Request) -> object:
    return _run_json(request, run_id, "safety-events.json")


@app.get("/api/runs/{run_id}/timeseries", tags=["runs"])
def get_timeseries(run_id: str, request: Request) -> object:
    return _run_json(request, run_id, "timeseries.json")


@app.get("/api/runs/{run_id}/archive", response_class=FileResponse, tags=["runs"])
def get_archive(run_id: str, request: Request) -> FileResponse:
    record = _find_run(request, run_id)
    if record.status.value != "completed":
        raise HTTPException(status_code=409, detail="Only completed runs can be archived")
    destination = get_settings().data_dir / "cache/archives" / f"{run_id}.zip"
    create_run_archive(_manager(request).runs_dir / run_id, destination)
    return FileResponse(destination, filename=f"{run_id}.zip", media_type="application/zip")


def _demo_index() -> list[dict[str, str]]:
    path = REPO_ROOT / "demo/archives/index.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []


@app.get("/api/demo-runs", tags=["runs"])
def demo_runs() -> list[dict[str, str]]:
    return _demo_index()


@app.post("/api/demo-runs/{demo_id}/load", response_model=RunMetadata, tags=["runs"])
def load_demo(demo_id: str, request: Request) -> RunMetadata:
    entry = next((item for item in _demo_index() if item["id"] == demo_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Demo run not found")
    run_id = f"demo-{demo_id}"
    existing = _manager(request).get(run_id)
    if existing is not None:
        return existing
    destination = _manager(request).runs_dir / run_id
    try:
        import_run_archive(REPO_ROOT / "demo/archives" / entry["file"], destination)
        scenario = ScenarioConfig.model_validate_json(
            (destination / "effective-scenario.json").read_text(encoding="utf-8")
        )
        record = RunMetadata(
            run_id=run_id,
            status="completed",
            scenario=scenario,
            scenario_checksum=scenario.checksum(),
            message="Loaded from a bundled reproducible demo archive.",
        )
        _manager(request)._write(record)
    except ArchiveError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return record


@app.delete("/api/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["runs"])
def delete_run(run_id: str, request: Request) -> Response:
    try:
        deleted = _manager(request).delete(run_id)
    except RunConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
