from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import libsumo

from app.models.run import RunSummary, SafetySeverity
from app.models.scenario import ScenarioConfig

from .checksum_service import file_checksum
from .demand_service import DemandArtifact, generate_demand
from .result_service import write_trajectories
from .safety_service import detect_braking_events, write_events, write_safety_results


def _write_config(
    path: Path, network_path: Path, demand: DemandArtifact, scenario: ScenarioConfig
) -> None:
    root = ET.Element("configuration")
    inputs = ET.SubElement(root, "input")
    ET.SubElement(inputs, "net-file", value=str(network_path.resolve()))
    ET.SubElement(inputs, "route-files", value=str(demand.routes_path.resolve()))
    time = ET.SubElement(root, "time")
    ET.SubElement(time, "begin", value="0")
    ET.SubElement(time, "end", value=str(scenario.duration))
    ET.SubElement(time, "step-length", value=str(scenario.vehicle.step_length))
    ET.indent(root)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def _count_xml(path: Path, tag: str) -> int:
    if not path.is_file() or path.stat().st_size == 0:
        return 0
    return len(ET.parse(path).getroot().findall(f".//{tag}"))


def _trip_metrics(path: Path) -> tuple[int, float | None, float | None]:
    if not path.is_file():
        return 0, None, None
    records = ET.parse(path).getroot().findall("tripinfo")
    completed = [record for record in records if float(record.get("arrival", "-1")) >= 0]
    if not completed:
        return 0, None, None
    durations = [float(record.get("duration", "0")) for record in completed]
    delays = [float(record.get("timeLoss", "0")) for record in completed]
    return len(completed), sum(durations) / len(durations), sum(delays) / len(delays)


def _sumo_version() -> str:
    version = libsumo.getVersion()
    return str(version[1] if isinstance(version, tuple) else version)


def _resolve_intervention(config_path: Path, scenario: ScenarioConfig) -> float | None:
    if not scenario.intervention.enabled:
        return None
    intervention = scenario.intervention
    command = [
        "sumo",
        "-c",
        str(config_path.resolve()),
        "--seed",
        str(scenario.seed),
        "--step-method.ballistic",
        "true",
        "--no-step-log",
        "true",
    ]
    started = False
    try:
        libsumo.start(command)
        started = True
        while libsumo.simulation.getTime() < scenario.duration:
            libsumo.simulationStep()
            now = libsumo.simulation.getTime()
            if now < intervention.trigger_time:
                continue
            active = set(libsumo.vehicle.getIDList())
            if not {intervention.lead_vehicle_id, intervention.follower_vehicle_id} <= active:
                continue
            leader, _ = libsumo.vehicle.getLeader(intervention.follower_vehicle_id, 50)
            if leader != intervention.lead_vehicle_id:
                continue
            lane_id = libsumo.vehicle.getLaneID(intervention.lead_vehicle_id)
            position = libsumo.vehicle.getLanePosition(intervention.lead_vehicle_id)
            if (
                lane_id.startswith(":")
                or position <= 10
                or libsumo.lane.getLength(lane_id) - position <= 10
            ):
                continue
            return now
    finally:
        if started:
            libsumo.close()
    raise RuntimeError("no valid lead/follower intervention trigger was found in preparation")


def execute_run(run_dir: Path, network_path: Path, scenario: ScenarioConfig) -> RunSummary:
    run_dir.mkdir(parents=True, exist_ok=True)
    scenario_path = run_dir / "effective-scenario.json"
    scenario_path.write_text(
        scenario.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8"
    )
    demand = generate_demand(network_path, scenario, run_dir)
    config_path = run_dir / "simulation.sumocfg"
    _write_config(config_path, network_path, demand, scenario)
    resolved_trigger = _resolve_intervention(config_path, scenario)
    tripinfo = run_dir / "tripinfo.xml"
    fcd = run_dir / "fcd.xml"
    collisions = run_dir / "collisions.xml"
    statistics = run_dir / "statistics.xml"
    ssm = run_dir / "ssm.xml"
    log_path = run_dir / "sumo.log"
    command = [
        "sumo",
        "-c",
        str(config_path.resolve()),
        "--seed",
        str(scenario.seed),
        "--step-method.ballistic",
        "true",
        "--tripinfo-output",
        str(tripinfo.resolve()),
        "--tripinfo-output.write-unfinished",
        "true",
        "--fcd-output",
        str(fcd.resolve()),
        "--fcd-output.geo",
        "true",
        "--fcd-output.acceleration",
        "true",
        "--collision-output",
        str(collisions.resolve()),
        "--statistic-output",
        str(statistics.resolve()),
        "--log",
        str(log_path.resolve()),
        "--device.ssm.probability",
        "1",
        "--device.ssm.measures",
        " ".join(scenario.safety.measures),
        "--device.ssm.thresholds",
        " ".join(
            str(
                {
                    "TTC": scenario.safety.warning_ttc,
                    "DRAC": scenario.safety.hard_braking_threshold,
                    "PET": scenario.safety.warning_ttc,
                }[measure]
            )
            for measure in scenario.safety.measures
        ),
        "--device.ssm.trajectories",
        "true",
        "--device.ssm.range",
        str(scenario.safety.ssm_range),
        "--device.ssm.file",
        str(ssm.resolve()),
        "--device.ssm.geo",
        "true",
        "--device.ssm.write-positions",
        "true",
        "--device.ssm.write-na",
        "true",
        "--no-step-log",
        "true",
    ]
    started = False
    intervention_applied = False
    try:
        libsumo.start(command)
        started = True
        while libsumo.simulation.getTime() < scenario.duration:
            if libsumo.simulation.getMinExpectedNumber() == 0:
                break
            libsumo.simulationStep()
            if (
                resolved_trigger is not None
                and not intervention_applied
                and libsumo.simulation.getTime() >= resolved_trigger
                and scenario.intervention.lead_vehicle_id in libsumo.vehicle.getIDList()
            ):
                libsumo.vehicle.setAcceleration(
                    scenario.intervention.lead_vehicle_id,
                    -scenario.vehicle.emergency_decel,
                    scenario.intervention.duration,
                )
                intervention_applied = True
    finally:
        if started:
            libsumo.close()
    trajectories = write_trajectories(fcd, run_dir / "trajectories.json")
    safety = write_safety_results(ssm, run_dir, scenario.safety)
    braking = detect_braking_events(trajectories, scenario.safety, scenario.intervention)
    safety.events.extend(braking)
    write_events(run_dir / "safety-events.json", safety.events)
    if scenario.intervention.enabled:
        if not intervention_applied or resolved_trigger is None:
            raise RuntimeError("prepared intervention was not applied during the measured run")
        window_end = resolved_trigger + 5

        def observed_minimum(vehicle_id: str) -> float | None:
            values = [
                sample.acceleration
                for trajectory in trajectories
                if trajectory.vehicle_id == vehicle_id
                for sample in trajectory.samples
                if resolved_trigger <= sample.t <= window_end
            ]
            return min(values, default=None)

        (run_dir / "intervention.json").write_text(
            json.dumps(
                {
                    "id": "lead-emergency-braking",
                    "requestedTriggerTime": scenario.intervention.trigger_time,
                    "resolvedTriggerTime": resolved_trigger,
                    "leadVehicleId": scenario.intervention.lead_vehicle_id,
                    "followerVehicleId": scenario.intervention.follower_vehicle_id,
                    "commandedAcceleration": -scenario.vehicle.emergency_decel,
                    "commandDuration": scenario.intervention.duration,
                    "safetyChecksRetained": True,
                    "observedLeadMinimumAcceleration": observed_minimum(
                        scenario.intervention.lead_vehicle_id
                    ),
                    "observedFollowerMinimumAcceleration": observed_minimum(
                        scenario.intervention.follower_vehicle_id
                    ),
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
    completed, mean_travel_time, mean_delay = _trip_metrics(tripinfo)
    warnings = (
        [
            line.strip()
            for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            if "Warning:" in line
        ]
        if log_path.is_file()
        else []
    )
    summary = RunSummary(
        scenario_name=scenario.name,
        duration=scenario.duration,
        seed=scenario.seed,
        demand_level=scenario.demand.level.value,
        requested_vehicle_count=demand.requested_count,
        generated_vehicle_count=demand.generated_count,
        routed_vehicle_count=demand.routed_count,
        discarded_vehicle_count=demand.discarded_count,
        completed_vehicle_count=completed,
        mean_travel_time=mean_travel_time,
        mean_delay=mean_delay,
        collisions=_count_xml(collisions, "collision"),
        teleports=sum("teleport" in warning.lower() for warning in warnings),
        hard_braking_events=sum(event.type == "hard_braking" for event in braking),
        emergency_braking_events=sum(
            event.severity == SafetySeverity.CRITICAL for event in braking
        ),
        ttc_warning_events=sum(
            event.category == "conflict" and event.severity == SafetySeverity.WARNING
            for event in safety.events
        ),
        ttc_critical_events=sum(
            event.category == "conflict" and event.severity == SafetySeverity.CRITICAL
            for event in safety.events
        ),
        minimum_observed_ttc=min(
            (event.minimum_ttc for event in safety.events if event.minimum_ttc is not None),
            default=None,
        ),
        maximum_observed_drac=max(
            (event.maximum_drac for event in safety.events if event.maximum_drac is not None),
            default=None,
        ),
        warnings=warnings,
        sumo_version=_sumo_version(),
        scenario_checksum=scenario.checksum(),
    )
    summary_path = run_dir / "summary.json"
    summary_path.write_text(
        summary.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8"
    )
    files = sorted(path for path in run_dir.iterdir() if path.is_file() and path.name != "run.json")
    manifest: dict[str, Any] = {
        "scenarioChecksum": scenario.checksum(),
        "software": {
            "sumo": summary.sumo_version,
            "python": sys.version.split()[0],
        },
        "files": {path.name: file_checksum(path) for path in files},
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return summary
