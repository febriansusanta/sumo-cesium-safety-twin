from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.models.run import (
    SafetyEvent,
    SafetySeverity,
    TimeSeries,
    TimeSeriesPoint,
    Trajectory,
)
from app.models.scenario import InterventionConfig, SafetyConfig


class SafetyParseError(RuntimeError):
    pass


CoordinateTransform = Callable[[float, float], tuple[float, float]]


ENCOUNTER_TYPES = {
    2: "following_follower",
    3: "following_leader",
    6: "merging_follower",
    7: "merging_leader",
    10: "crossing_follower",
    11: "crossing_leader",
    14: "oncoming_ego",
    15: "oncoming_foe",
}


@dataclass
class ParsedSafety:
    events: list[SafetyEvent]
    timeseries: list[TimeSeries]


def detect_braking_events(
    trajectories: list[Trajectory],
    config: SafetyConfig,
    intervention: InterventionConfig,
) -> list[SafetyEvent]:
    events: list[SafetyEvent] = []
    for trajectory in trajectories:
        active: SafetyEvent | None = None
        for sample in trajectory.samples:
            deceleration = -sample.acceleration
            if deceleration < config.hard_braking_threshold:
                active = None
                continue
            emergency = deceleration >= config.emergency_braking_threshold
            event_type = "emergency_braking" if emergency else "hard_braking"
            intervention_id = None
            if intervention.enabled and trajectory.vehicle_id == intervention.lead_vehicle_id:
                event_type = "forced_intervention"
                intervention_id = "lead-emergency-braking"
            elif intervention.enabled and trajectory.vehicle_id == intervention.follower_vehicle_id:
                event_type = "observed_response"
                intervention_id = "lead-emergency-braking"
            if active is not None and active.type == event_type:
                active.end_time = sample.t
                active.maximum_drac = max(active.maximum_drac or 0, deceleration)
                if emergency:
                    active.severity = SafetySeverity.CRITICAL
                continue
            active = SafetyEvent(
                event_id=f"brake_{len(events):05d}",
                category="braking",
                type=event_type,
                source="measured FCD acceleration",
                start_time=sample.t,
                end_time=sample.t,
                minimum_ttc=None,
                maximum_drac=deceleration,
                pet=None,
                vehicle_ids=[trajectory.vehicle_id],
                longitude=sample.longitude,
                latitude=sample.latitude,
                severity=SafetySeverity.CRITICAL if emergency else SafetySeverity.WARNING,
                intervention_id=intervention_id,
            )
            events.append(active)
    return events


def classify_ttc(value: float | None, config: SafetyConfig) -> SafetySeverity:
    if value is None or value >= config.warning_ttc:
        return SafetySeverity.NORMAL
    if value < config.critical_ttc:
        return SafetySeverity.CRITICAL
    return SafetySeverity.WARNING


def _optional_float(value: str | None) -> float | None:
    if value is None or value.upper() == "NA":
        return None
    parsed = float(value)
    return parsed if math.isfinite(parsed) else None


def _position(
    value: str | None,
    coordinate_transform: CoordinateTransform | None = None,
) -> tuple[float | None, float | None]:
    if value is None or value.upper() == "NA":
        return None, None
    parts = value.split(",")
    if len(parts) < 2:
        raise ValueError("position must contain at least two coordinates")
    x = float(parts[0])
    y = float(parts[1])
    return coordinate_transform(x, y) if coordinate_transform is not None else (x, y)


def _measure(conflict: ET.Element, tag: str) -> ET.Element | None:
    return conflict.find(tag)


def _type_and_position(
    conflict: ET.Element,
    measures: tuple[ET.Element | None, ...],
    coordinate_transform: CoordinateTransform | None = None,
) -> tuple[int, float | None, float | None]:
    for measure in measures:
        if measure is None or measure.get("type", "NA").upper() == "NA":
            continue
        longitude, latitude = _position(measure.get("position"), coordinate_transform)
        return int(measure.attrib["type"]), longitude, latitude
    type_span = conflict.find("typeSpan")
    type_code = -1
    if type_span is not None:
        codes = [int(value) for value in type_span.get("values", "").split()]
        type_code = next((code for code in codes if code not in {0, 18}), codes[0] if codes else -1)
    conflict_points = conflict.find("conflictPoint")
    if conflict_points is not None:
        for value in conflict_points.get("values", "").split():
            if value.upper() != "NA":
                longitude, latitude = _position(value, coordinate_transform)
                return type_code, longitude, latitude
    return type_code, None, None


def _event_from_conflict(
    conflict: ET.Element,
    index: int,
    config: SafetyConfig,
    coordinate_transform: CoordinateTransform | None = None,
) -> SafetyEvent:
    minimum = _measure(conflict, "minTTC")
    maximum = _measure(conflict, "maxDRAC")
    pet_element = _measure(conflict, "PET")
    minimum_ttc = _optional_float(minimum.get("value") if minimum is not None else None)
    maximum_drac = _optional_float(maximum.get("value") if maximum is not None else None)
    pet = _optional_float(pet_element.get("value") if pet_element is not None else None)
    type_code, longitude, latitude = _type_and_position(
        conflict, (minimum, maximum, pet_element), coordinate_transform
    )
    vehicles = sorted([conflict.attrib["ego"], conflict.attrib["foe"]])
    return SafetyEvent(
        event_id=f"ssm_{index:05d}",
        type=ENCOUNTER_TYPES.get(type_code, f"encounter_{type_code}"),
        start_time=float(conflict.attrib["begin"]),
        end_time=float(conflict.attrib["end"]),
        minimum_ttc=minimum_ttc,
        maximum_drac=maximum_drac,
        pet=pet,
        vehicle_ids=vehicles,
        longitude=longitude,
        latitude=latitude,
        severity=classify_ttc(minimum_ttc, config),
    )


def _timeline(conflict: ET.Element, event_id: str) -> list[TimeSeriesPoint]:
    time_span = conflict.find("timeSpan")
    ttc_span = conflict.find("TTCSpan")
    if time_span is None or ttc_span is None:
        minimum = conflict.find("minTTC")
        if minimum is None or minimum.get("time", "NA").upper() == "NA":
            return []
        value = _optional_float(minimum.get("value"))
        return [TimeSeriesPoint(t=float(minimum.attrib["time"]), value=value, event_id=event_id)]
    times = time_span.get("values", "").split()
    values = ttc_span.get("values", "").split()
    return [
        TimeSeriesPoint(t=float(time), value=_optional_float(value), event_id=event_id)
        for time, value in zip(times, values, strict=False)
    ]


def _deduplicate(events: list[SafetyEvent]) -> list[SafetyEvent]:
    merged: list[SafetyEvent] = []
    for event in sorted(events, key=lambda item: (item.vehicle_ids, item.type, item.start_time)):
        duplicate = next(
            (
                candidate
                for candidate in reversed(merged)
                if candidate.vehicle_ids == event.vehicle_ids
                and candidate.type == event.type
                and event.start_time <= candidate.end_time
            ),
            None,
        )
        if duplicate is None:
            merged.append(event)
            continue
        duplicate.end_time = max(duplicate.end_time, event.end_time)
        values = [
            value for value in (duplicate.minimum_ttc, event.minimum_ttc) if value is not None
        ]
        duplicate.minimum_ttc = min(values) if values else None
        drac = [
            value for value in (duplicate.maximum_drac, event.maximum_drac) if value is not None
        ]
        duplicate.maximum_drac = max(drac) if drac else None
        severity_order = {
            SafetySeverity.CRITICAL: 0,
            SafetySeverity.WARNING: 1,
            SafetySeverity.NORMAL: 2,
        }
        duplicate.severity = min(
            (duplicate.severity, event.severity),
            key=severity_order.__getitem__,
        )
    return merged


def parse_ssm(
    path: Path,
    config: SafetyConfig,
    coordinate_transform: CoordinateTransform | None = None,
) -> ParsedSafety:
    if not path.is_file():
        raise SafetyParseError(f"SSM output is missing: {path}")
    try:
        root = ET.parse(path).getroot()
        raw_events: list[SafetyEvent] = []
        points: list[TimeSeriesPoint] = []
        for index, conflict in enumerate(root.findall("conflict")):
            event = _event_from_conflict(conflict, index, config, coordinate_transform)
            raw_events.append(event)
            points.extend(_timeline(conflict, event.event_id))
    except (ET.ParseError, KeyError, ValueError) as error:
        raise SafetyParseError(f"invalid SSM output: {error}") from error
    events = _deduplicate(raw_events)
    event_ids = {event.event_id for event in events}
    return ParsedSafety(
        events=events,
        timeseries=[
            TimeSeries(
                name="TTC",
                unit="seconds",
                points=[point for point in points if point.event_id in event_ids],
            )
        ],
    )


def parse_collisions(
    path: Path,
    coordinate_transform: CoordinateTransform | None = None,
) -> list[SafetyEvent]:
    if not path.is_file():
        return []
    events: list[SafetyEvent] = []
    try:
        for _, element in ET.iterparse(path, events=("end",)):
            if element.tag != "collision":
                continue
            longitude, latitude = _position(
                element.get("colliderFront") or element.get("victimFront"),
                coordinate_transform,
            )
            vehicle_ids = sorted(
                value
                for value in (element.get("collider"), element.get("victim"))
                if value
            )
            time = float(element.attrib["time"])
            events.append(
                SafetyEvent(
                    event_id=f"collision_{len(events):05d}",
                    category="collision",
                    type=element.get("type", "collision"),
                    source="SUMO collision output",
                    start_time=time,
                    end_time=time,
                    minimum_ttc=None,
                    maximum_drac=None,
                    pet=None,
                    vehicle_ids=vehicle_ids,
                    longitude=longitude,
                    latitude=latitude,
                    severity=SafetySeverity.CRITICAL,
                )
            )
            element.clear()
    except (ET.ParseError, KeyError, ValueError) as error:
        raise SafetyParseError(f"invalid collision output: {error}") from error
    return events


def write_safety_results(
    source: Path,
    output_dir: Path,
    config: SafetyConfig,
    coordinate_transform: CoordinateTransform | None = None,
) -> ParsedSafety:
    parsed = parse_ssm(source, config, coordinate_transform)
    (output_dir / "safety-events.json").write_text(
        json.dumps(
            [event.model_dump(mode="json", by_alias=True) for event in parsed.events],
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    (output_dir / "timeseries.json").write_text(
        json.dumps(
            [series.model_dump(mode="json", by_alias=True) for series in parsed.timeseries],
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return parsed


def write_events(path: Path, events: list[SafetyEvent]) -> None:
    path.write_text(
        json.dumps(
            [event.model_dump(mode="json", by_alias=True) for event in events],
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
