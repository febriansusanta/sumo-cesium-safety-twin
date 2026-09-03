from __future__ import annotations

import json
import os
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT, Settings
from app.models.network import DrivingSide, NetworkMetadata, NetworkStatus
from app.models.run import RunMetadata, RunStatus, RunSummary, SafetySeverity, TimeSeries
from app.models.scenario import BoundingBox, DemandConfig, DemandLevel, ScenarioConfig

from .checksum_service import file_checksum, object_checksum
from .coordinate_service import CoordinateTransformer, read_network_location
from .network_registry_service import NetworkRegistry
from .network_service import export_geojson, validate_network
from .result_service import write_trajectories
from .safety_service import (
    detect_braking_events,
    parse_collisions,
    parse_ssm,
    write_events,
)


class LocalDataImportError(RuntimeError):
    pass


@dataclass(frozen=True)
class LocalDataset:
    id: str
    title: str
    relative_path: str
    source_dir: Path
    config_path: Path
    network_path: Path | None
    route_path: Path | None
    trips_path: Path | None
    fcd_path: Path | None
    ssm_path: Path | None
    collisions_path: Path | None
    tripinfo_path: Path | None
    summary_path: Path | None

    @property
    def ready_for_playback(self) -> bool:
        return self.network_path is not None and self.fcd_path is not None

    @property
    def score(self) -> int:
        return (
            (100 if self.ready_for_playback else 0)
            + (10 if self.ssm_path else 0)
            + (5 if self.collisions_path else 0)
            + (2 if self.tripinfo_path else 0)
            + (1 if self.route_path else 0)
        )

    def as_public_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "relativePath": self.relative_path,
            "readyForPlayback": self.ready_for_playback,
            "hasNetwork": self.network_path is not None,
            "hasRoutes": self.route_path is not None,
            "hasFcd": self.fcd_path is not None,
            "hasSsm": self.ssm_path is not None,
            "hasCollisions": self.collisions_path is not None,
            "hasTripinfo": self.tripinfo_path is not None,
        }


def default_local_data_root() -> Path:
    value = os.getenv("APP_LOCAL_DATA_DIR")
    if value:
        path = Path(value).expanduser()
        return (REPO_ROOT / path).resolve() if not path.is_absolute() else path.resolve()
    return (REPO_ROOT.parent / "Data").resolve()


def _first_file(files: list[Path], *patterns: str) -> Path | None:
    for pattern in patterns:
        matches = sorted(path for path in files if path.match(pattern))
        if matches:
            return matches[0]
    return None


def _slug(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or "dataset"


def _dataset_id(relative_path: Path) -> str:
    slug = _slug(relative_path.as_posix())
    suffix = object_checksum({"path": relative_path.as_posix()})[:8]
    return f"{slug[:70].strip('-')}-{suffix}"


def _title(relative_path: Path) -> str:
    return " / ".join(relative_path.parts)


def discover_local_datasets(data_root: Path | None = None) -> list[LocalDataset]:
    root = (data_root or default_local_data_root()).resolve()
    if not root.is_dir():
        return []
    datasets: list[LocalDataset] = []
    for config_path in sorted(root.rglob("*.sumocfg")):
        source_dir = config_path.parent
        files = [path for path in source_dir.iterdir() if path.is_file()]
        relative = source_dir.relative_to(root)
        datasets.append(
            LocalDataset(
                id=_dataset_id(relative),
                title=_title(relative),
                relative_path=relative.as_posix(),
                source_dir=source_dir,
                config_path=config_path,
                network_path=_first_file(files, "*.net.xml"),
                route_path=_first_file(files, "*.rou.xml", "*.routes.xml"),
                trips_path=_first_file(files, "*.trips.xml"),
                fcd_path=_first_file(files, "*fcd*.xml"),
                ssm_path=_first_file(files, "*ssm*.xml"),
                collisions_path=_first_file(files, "*collision*.xml", "*collisions*.xml"),
                tripinfo_path=_first_file(files, "*tripinfo*.xml"),
                summary_path=_first_file(files, "*summary*.xml"),
            )
        )
    return sorted(datasets, key=lambda item: (-item.score, item.relative_path.lower()))


def find_local_dataset(dataset_id: str, data_root: Path | None = None) -> LocalDataset:
    for dataset in discover_local_datasets(data_root):
        if dataset.id == dataset_id:
            return dataset
    raise LocalDataImportError(f"local dataset not found: {dataset_id}")


def preferred_local_dataset(data_root: Path | None = None) -> LocalDataset:
    for dataset in discover_local_datasets(data_root):
        if dataset.ready_for_playback:
            return dataset
    raise LocalDataImportError("no local dataset with both a SUMO network and FCD output was found")


def _config_end(path: Path) -> float | None:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return None
    end = root.find(".//end")
    if end is None:
        return None
    try:
        return float(end.attrib["value"])
    except (KeyError, ValueError):
        return None


def _count_xml(path: Path | None, tag: str) -> int:
    if path is None or not path.is_file():
        return 0
    return sum(1 for _, element in ET.iterparse(path, events=("end",)) if element.tag == tag)


def _metrics_from_records(records: list[ET.Element]) -> tuple[int, float | None, float | None]:
    completed = 0
    duration_total = 0.0
    delay_total = 0.0
    for element in records:
        if float(element.get("arrival", "-1")) < 0:
            continue
        completed += 1
        duration_total += float(element.get("duration", "0"))
        delay_total += float(element.get("timeLoss", "0"))
    if completed == 0:
        return 0, None, None
    return completed, duration_total / completed, delay_total / completed


def _trip_metrics_by_line(path: Path) -> tuple[int, float | None, float | None]:
    records: list[ET.Element] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "<tripinfo " not in line or "/>" not in line:
            continue
        fragment = line[line.find("<tripinfo ") : line.rfind("/>") + 2]
        try:
            records.append(ET.fromstring(fragment))
        except ET.ParseError:
            continue
    return _metrics_from_records(records)


def _trip_metrics(path: Path | None) -> tuple[int, float | None, float | None, bool]:
    if path is None or not path.is_file():
        return 0, None, None, False
    records: list[ET.Element] = []
    try:
        for _, element in ET.iterparse(path, events=("end",)):
            if element.tag != "tripinfo":
                continue
            records.append(element)
    except ET.ParseError:
        completed, mean_travel_time, mean_delay = _trip_metrics_by_line(path)
        return completed, mean_travel_time, mean_delay, True
    completed, mean_travel_time, mean_delay = _metrics_from_records(records)
    return completed, mean_travel_time, mean_delay, False


def _scenario_for_dataset(
    dataset: LocalDataset, duration: float, routed_count: int
) -> ScenarioConfig:
    demand_level = DemandLevel.HIGH if routed_count >= 200 else DemandLevel.MEDIUM
    name = f"Local data: {dataset.title}"
    if len(name) > 120:
        name = f"{name[:117]}..."
    return ScenarioConfig(
        name=name,
        preset_id="local-data",
        duration=max(30, min(duration, 3600)),
        seed=42,
        demand=DemandConfig(
            level=demand_level,
            departure_end=min(90, max(30, duration)),
        ),
    )


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _relative_to_data_root(path: Path, data_root: Path) -> str:
    try:
        return path.resolve().relative_to(data_root.resolve()).as_posix()
    except ValueError:
        return path.name


def _geojson_bbox(path: Path) -> BoundingBox:
    payload = json.loads(path.read_text(encoding="utf-8"))
    coordinates = _all_coordinates(payload)
    if not coordinates:
        raise LocalDataImportError("network GeoJSON contains no coordinates")
    longitudes = [item[0] for item in coordinates]
    latitudes = [item[1] for item in coordinates]
    return BoundingBox(
        west=min(longitudes),
        south=min(latitudes),
        east=max(longitudes),
        north=max(latitudes),
    )


def _all_coordinates(value: Any) -> list[tuple[float, float]]:
    if isinstance(value, list):
        if (
            len(value) >= 2
            and isinstance(value[0], int | float)
            and isinstance(value[1], int | float)
        ):
            longitude = float(value[0])
            latitude = float(value[1])
            return [(longitude, latitude)]
        return [coordinate for item in value for coordinate in _all_coordinates(item)]
    if isinstance(value, dict):
        return [coordinate for item in value.values() for coordinate in _all_coordinates(item)]
    return []


def _register_local_network(
    settings: Settings,
    dataset: LocalDataset,
    network_id: str,
    network_path: Path,
    geojson_path: Path,
    stats: dict[str, int],
    warnings: list[str],
) -> BoundingBox:
    registry = NetworkRegistry(settings)
    registered_network_path = registry.network_path(network_id)
    registered_geojson_path = registry.geojson_path(network_id)
    registered_network_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(network_path, registered_network_path)
    shutil.copyfile(geojson_path, registered_geojson_path)
    bbox = _geojson_bbox(registered_geojson_path)
    metadata = NetworkMetadata(
        network_id=network_id,
        name=dataset.title,
        bbox=bbox,
        driving_side=DrivingSide.RIGHT,
        status=NetworkStatus.READY,
        source=f"local Data/{dataset.relative_path}",
        network_checksum=file_checksum(registered_network_path),
        geojson_checksum=file_checksum(registered_geojson_path),
        edge_count=stats["edges"],
        lane_count=stats["lanes"],
        junction_count=stats["junctions"],
        cache_hit=True,
        message="Registered from imported local SUMO data.",
        warnings=warnings,
    )
    registry.write(metadata)
    _write_json(
        registry.source_reference_path(network_id),
        {
            "sourceDataset": dataset.relative_path,
            "networkChecksum": metadata.network_checksum,
            "geojsonChecksum": metadata.geojson_checksum,
            "stats": stats,
        },
    )
    return bbox


def import_local_dataset(
    settings: Settings,
    dataset_id: str | None = None,
    *,
    data_root: Path | None = None,
    replace: bool = False,
    run_id: str | None = None,
) -> RunMetadata:
    root = (data_root or default_local_data_root()).resolve()
    dataset = find_local_dataset(dataset_id, root) if dataset_id else preferred_local_dataset(root)
    if dataset.network_path is None:
        raise LocalDataImportError(f"{dataset.title} does not contain a SUMO .net.xml file")
    if dataset.fcd_path is None:
        raise LocalDataImportError(f"{dataset.title} does not contain FCD trajectories")

    safe_run_id = run_id or f"local-{dataset.id}"
    run_dir = settings.data_dir / "runs" / safe_run_id
    metadata_path = run_dir / "run.json"
    if metadata_path.is_file() and not replace:
        existing = RunMetadata.model_validate_json(metadata_path.read_text(encoding="utf-8"))
        if existing.network_id and NetworkRegistry(settings).geojson_path(
            existing.network_id
        ).is_file():
            return existing
        replace = True
    if run_dir.exists():
        if not replace:
            raise LocalDataImportError(f"run already exists: {safe_run_id}")
        shutil.rmtree(run_dir)
    run_dir.mkdir(parents=True)

    network_key = object_checksum(
        {"dataset": dataset.id, "network": file_checksum(dataset.network_path)}
    )
    network_id = f"local-{network_key[:12]}"
    network_dir = settings.data_dir / "network"
    network_dir.mkdir(parents=True, exist_ok=True)
    network_path = network_dir / f"{dataset.id}-{network_key[:12]}.net.xml"
    geojson_path = network_dir / f"{dataset.id}-{network_key[:12]}.geojson"
    network_metadata_path = network_dir / f"{dataset.id}-{network_key[:12]}.metadata.json"
    if not network_path.is_file():
        shutil.copyfile(dataset.network_path, network_path)

    warnings = [
        "Imported from local SUMO outputs; scenario controls are descriptive only for this run.",
        "Traffic demand, driver behaviour and safety outcomes are uncalibrated.",
    ]
    try:
        stats = validate_network(network_path)
    except Exception as error:
        stats = {"edges": 0, "lanes": 0, "junctions": 0}
        warnings.append(f"Network validation warning: {error}")
    if not geojson_path.is_file():
        export_geojson(network_path, geojson_path)
    _write_json(
        network_metadata_path,
        {
            "cacheKey": network_key,
            "networkChecksum": file_checksum(network_path),
            "sourceDataset": dataset.relative_path,
            "stats": stats,
            "warnings": warnings,
        },
    )
    network_bbox = _register_local_network(
        settings,
        dataset,
        network_id,
        network_path,
        geojson_path,
        stats,
        warnings,
    )

    transformer = CoordinateTransformer(read_network_location(network_path))
    trajectories = write_trajectories(
        dataset.fcd_path,
        run_dir / "trajectories.json",
        transformer.to_wgs84,
    )
    observed_duration = max(
        (sample.t for trajectory in trajectories for sample in trajectory.samples),
        default=_config_end(dataset.config_path) or 30,
    )
    duration = _config_end(dataset.config_path) or observed_duration
    routed_count = _count_xml(dataset.route_path, "vehicle")
    trip_count = _count_xml(dataset.trips_path, "trip")
    scenario = _scenario_for_dataset(dataset, duration, routed_count)
    (run_dir / "effective-scenario.json").write_text(
        scenario.model_dump_json(by_alias=True, indent=2) + "\n",
        encoding="utf-8",
    )

    parsed_safety = (
        parse_ssm(dataset.ssm_path, scenario.safety, transformer.to_wgs84)
        if dataset.ssm_path is not None
        else None
    )
    conflict_events = parsed_safety.events if parsed_safety is not None else []
    collision_events = parse_collisions(dataset.collisions_path, transformer.to_wgs84)
    braking_events = detect_braking_events(trajectories, scenario.safety, scenario.intervention)
    all_events = [*conflict_events, *collision_events, *braking_events]
    write_events(run_dir / "safety-events.json", all_events)
    timeseries = (
        parsed_safety.timeseries
        if parsed_safety is not None
        else [TimeSeries(name="TTC", unit="seconds", points=[])]
    )
    (run_dir / "timeseries.json").write_text(
        json.dumps(
            [series.model_dump(mode="json", by_alias=True) for series in timeseries],
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    completed, mean_travel_time, mean_delay, repaired_tripinfo = _trip_metrics(
        dataset.tripinfo_path
    )
    if dataset.ssm_path is None:
        warnings.append("No SSM output was found; TTC series is empty for this imported run.")
    if repaired_tripinfo:
        warnings.append(
            "Tripinfo XML was not fully well-formed; summary metrics used valid tripinfo rows."
        )
    summary = RunSummary(
        scenario_name=scenario.name,
        duration=observed_duration,
        seed=scenario.seed,
        demand_level=scenario.demand.level.value,
        network_id=network_id,
        network_name=dataset.title,
        network_checksum=file_checksum(network_path),
        network_bbox=network_bbox,
        driving_side=DrivingSide.RIGHT,
        requested_vehicle_count=trip_count or routed_count or len(trajectories),
        generated_vehicle_count=trip_count or routed_count or len(trajectories),
        routed_vehicle_count=routed_count or len(trajectories),
        discarded_vehicle_count=0,
        completed_vehicle_count=completed,
        mean_travel_time=mean_travel_time,
        mean_delay=mean_delay,
        collisions=len(collision_events),
        teleports=0,
        hard_braking_events=sum(event.category == "braking" for event in braking_events),
        emergency_braking_events=sum(
            event.severity == SafetySeverity.CRITICAL for event in braking_events
        ),
        ttc_warning_events=sum(
            event.category == "conflict" and event.severity == SafetySeverity.WARNING
            for event in conflict_events
        ),
        ttc_critical_events=sum(
            event.category == "conflict" and event.severity == SafetySeverity.CRITICAL
            for event in conflict_events
        ),
        minimum_observed_ttc=min(
            (event.minimum_ttc for event in conflict_events if event.minimum_ttc is not None),
            default=None,
        ),
        maximum_observed_drac=max(
            (event.maximum_drac for event in conflict_events if event.maximum_drac is not None),
            default=None,
        ),
        warnings=warnings,
        sumo_version="imported local SUMO output",
        scenario_checksum=scenario.checksum(),
    )
    (run_dir / "summary.json").write_text(
        summary.model_dump_json(by_alias=True, indent=2) + "\n",
        encoding="utf-8",
    )

    source_files = {
        key: path
        for key, path in {
            "configuration": dataset.config_path,
            "network": dataset.network_path,
            "routes": dataset.route_path,
            "trips": dataset.trips_path,
            "fcd": dataset.fcd_path,
            "ssm": dataset.ssm_path,
            "collisions": dataset.collisions_path,
            "tripinfo": dataset.tripinfo_path,
            "summary": dataset.summary_path,
        }.items()
        if path is not None
    }
    source_payload = {
        key: {
            "relativePath": _relative_to_data_root(path, root),
            "sha256": file_checksum(path),
        }
        for key, path in source_files.items()
    }
    _write_json(
        run_dir / "source-files.json",
        {
            "dataRootName": root.name,
            "datasetId": dataset.id,
            "datasetRelativePath": dataset.relative_path,
            "files": source_payload,
        },
    )
    generated_files = sorted(path for path in run_dir.iterdir() if path.is_file())
    _write_json(
        run_dir / "manifest.json",
        {
            "scenarioChecksum": scenario.checksum(),
            "sourceDataset": dataset.relative_path,
            "sourceFiles": source_payload,
            "files": {path.name: file_checksum(path) for path in generated_files},
        },
    )

    record = RunMetadata(
        run_id=safe_run_id,
        status=RunStatus.COMPLETED,
        scenario=scenario,
        scenario_checksum=scenario.checksum(),
        network_id=network_id,
        network_name=dataset.title,
        network_checksum=file_checksum(network_path),
        network_bbox=network_bbox,
        driving_side=DrivingSide.RIGHT,
        message="Imported from the local Data folder.",
    )
    metadata_path.write_text(
        record.model_dump_json(by_alias=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return record
