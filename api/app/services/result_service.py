from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from collections import defaultdict
from collections.abc import Callable
from pathlib import Path

from app.models.run import Trajectory, TrajectorySample


class ResultParseError(RuntimeError):
    pass


CoordinateTransform = Callable[[float, float], tuple[float, float]]


def parse_fcd(
    path: Path, coordinate_transform: CoordinateTransform | None = None
) -> list[Trajectory]:
    if not path.is_file():
        raise ResultParseError(f"FCD output is missing: {path}")
    samples: dict[str, list[TrajectorySample]] = defaultdict(list)
    previous_speed: dict[str, tuple[float, float]] = {}
    try:
        for _, element in ET.iterparse(path, events=("end",)):
            if element.tag != "timestep":
                continue
            time = float(element.attrib["time"])
            for vehicle in element.findall("vehicle"):
                vehicle_id = vehicle.attrib["id"]
                lane_id = vehicle.attrib.get("lane", "")
                edge_id = lane_id.rsplit("_", 1)[0] if "_" in lane_id else lane_id
                x = float(vehicle.attrib["x"])
                y = float(vehicle.attrib["y"])
                longitude, latitude = (
                    coordinate_transform(x, y) if coordinate_transform is not None else (x, y)
                )
                speed = float(vehicle.attrib.get("speed", 0))
                if "acceleration" in vehicle.attrib:
                    acceleration = float(vehicle.attrib["acceleration"])
                else:
                    previous = previous_speed.get(vehicle_id)
                    if previous is None or time <= previous[0]:
                        acceleration = 0.0
                    else:
                        acceleration = (speed - previous[1]) / (time - previous[0])
                previous_speed[vehicle_id] = (time, speed)
                samples[vehicle.attrib["id"]].append(
                    TrajectorySample(
                        t=time,
                        longitude=longitude,
                        latitude=latitude,
                        height=float(vehicle.attrib.get("z", 0)),
                        speed=speed,
                        acceleration=acceleration,
                        angle=float(vehicle.attrib.get("angle", 0)),
                        edge_id=edge_id,
                        lane_id=lane_id,
                    )
                )
            element.clear()
    except (ET.ParseError, KeyError, ValueError) as error:
        raise ResultParseError(f"invalid FCD output: {error}") from error
    return [
        Trajectory(vehicle_id=vehicle_id, samples=samples[vehicle_id])
        for vehicle_id in sorted(samples)
    ]


def write_trajectories(
    source: Path,
    destination: Path,
    coordinate_transform: CoordinateTransform | None = None,
) -> list[Trajectory]:
    trajectories = parse_fcd(source, coordinate_transform)
    payload = [record.model_dump(mode="json", by_alias=True) for record in trajectories]
    destination.write_text(
        json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    return trajectories
