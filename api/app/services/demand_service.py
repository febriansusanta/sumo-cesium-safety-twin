from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import sumolib

from app.models.scenario import ScenarioConfig

from .checksum_service import file_checksum, object_checksum


class DemandGenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class DemandArtifact:
    trips_path: Path
    routes_path: Path
    vehicle_types_path: Path
    metadata_path: Path
    requested_count: int
    generated_count: int
    routed_count: int
    discarded_count: int
    checksum: str


def _random_trips_path() -> Path:
    import sumo

    path = Path(sumo.__file__).resolve().parent / "tools" / "randomTrips.py"
    if not path.is_file():
        raise DemandGenerationError("randomTrips.py is unavailable; run scripts/doctor.py")
    return path


def _write_vehicle_type(path: Path, scenario: ScenarioConfig) -> None:
    vehicle = scenario.vehicle
    root = ET.Element("additional")
    ET.SubElement(
        root,
        "vType",
        {
            "id": "passenger",
            "vClass": "passenger",
            "carFollowModel": vehicle.car_follow_model.value,
            "accel": str(vehicle.accel),
            "decel": str(vehicle.decel),
            "emergencyDecel": str(vehicle.emergency_decel),
            "apparentDecel": str(vehicle.apparent_decel),
            "tau": str(vehicle.tau),
            "sigma": str(vehicle.sigma),
            "minGap": str(vehicle.min_gap),
            "maxSpeed": str(vehicle.max_speed),
            "actionStepLength": str(vehicle.action_step_length),
        },
    )
    ET.indent(root)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def semantic_route_checksum(path: Path) -> str:
    """Hash routed XML content while excluding generated comments and timestamps."""
    root = ET.parse(path).getroot()
    return hashlib.sha256(ET.tostring(root, encoding="utf-8")).hexdigest()


def _add_intervention_pair(routes: Path, network_path: Path, scenario: ScenarioConfig) -> None:
    if not scenario.intervention.enabled:
        return
    network = sumolib.net.readNet(str(network_path), withInternal=False)
    lengths = {edge.getID(): edge.getLength() for edge in network.getEdges()}
    tree = ET.parse(routes)
    root = tree.getroot()
    candidates: list[tuple[float, list[str]]] = []
    for vehicle in root.findall("vehicle"):
        route = vehicle.find("route")
        if route is None:
            continue
        edges = route.get("edges", "").split()
        if any(edge.startswith(":") for edge in edges):
            continue
        candidates.append((sum(lengths.get(edge, 0) for edge in edges), edges))
    if not candidates:
        raise DemandGenerationError("no suitable passenger route exists for intervention pair")
    _, selected_edges = max(candidates, key=lambda item: (item[0], item[1]))
    intervention = scenario.intervention
    for vehicle_id, depart in (
        (intervention.lead_vehicle_id, 0.5),
        (intervention.follower_vehicle_id, 1.5),
    ):
        vehicle = ET.SubElement(
            root,
            "vehicle",
            {
                "id": vehicle_id,
                "type": "passenger",
                "depart": f"{depart:.2f}",
                "departLane": "best",
            },
        )
        ET.SubElement(vehicle, "route", {"edges": " ".join(selected_edges)})
    vehicles = list(root.findall("vehicle"))
    for vehicle in vehicles:
        root.remove(vehicle)
    for vehicle in sorted(
        vehicles, key=lambda item: (float(item.attrib["depart"]), item.attrib["id"])
    ):
        root.append(vehicle)
    ET.indent(root)
    tree.write(routes, encoding="utf-8", xml_declaration=True)


def generate_demand(
    network_path: Path, scenario: ScenarioConfig, output_dir: Path
) -> DemandArtifact:
    output_dir.mkdir(parents=True, exist_ok=True)
    trips = output_dir / "trips.xml"
    routes = output_dir / "routes.xml"
    vtypes = output_dir / "vehicle-types.xml"
    metadata = output_dir / "demand.metadata.json"
    log_path = output_dir / "randomTrips.log"
    _write_vehicle_type(vtypes, scenario)
    demand = scenario.demand
    command = [
        sys.executable,
        str(_random_trips_path()),
        "--net-file",
        str(network_path),
        "--output-trip-file",
        str(trips),
        "--route-file",
        str(routes),
        "--additional-file",
        str(vtypes),
        "--begin",
        str(demand.departure_begin),
        "--end",
        str(demand.departure_end),
        "--period",
        str(demand.period),
        "--seed",
        str(scenario.seed),
        "--min-distance",
        str(demand.minimum_distance),
        "--fringe-factor",
        str(demand.fringe_factor),
        "--edge-permission",
        "passenger",
        "--trip-attributes",
        'type="passenger" departLane="best"',
        "--prefix",
        "veh_",
        "--validate",
        "--remove-loops",
    ]
    if demand.maximum_distance is not None:
        command.extend(["--max-distance", str(demand.maximum_distance)])
    result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=120)
    log_path.write_text(
        f"COMMAND: {json.dumps(command)}\n\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}",
        encoding="utf-8",
    )
    if result.returncode != 0 or not routes.is_file():
        raise DemandGenerationError(f"randomTrips failed; inspect {log_path}")
    _add_intervention_pair(routes, network_path, scenario)
    controlled_count = 2 if scenario.intervention.enabled else 0
    requested = (
        math.ceil((demand.departure_end - demand.departure_begin) / demand.period)
        + controlled_count
    )
    generated = len(ET.parse(trips).getroot().findall("trip")) + controlled_count
    routed = len(ET.parse(routes).getroot().findall("vehicle"))
    if routed == 0:
        raise DemandGenerationError("demand generation produced no routed vehicles")
    discarded = max(generated - routed, 0)
    checksum = object_checksum(
        {
            "network": file_checksum(network_path),
            "scenario": scenario.checksum(),
            "routes": semantic_route_checksum(routes),
        }
    )
    payload = {
        "requested": requested,
        "generated": generated,
        "routed": routed,
        "discarded": discarded,
        "checksum": checksum,
        "command": command,
    }
    metadata.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return DemandArtifact(
        trips, routes, vtypes, metadata, requested, generated, routed, discarded, checksum
    )
