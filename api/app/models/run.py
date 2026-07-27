from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import Field

from .base import ApiModel
from .scenario import ScenarioConfig

UTC = timezone.utc  # noqa: UP017


class RunStatus(StrEnum):
    QUEUED = "queued"
    PREPARING = "preparing"
    RUNNING = "running"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class RunMetadata(ApiModel):
    run_id: str
    status: RunStatus
    scenario: ScenarioConfig
    scenario_checksum: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    message: str | None = None


class RunSummary(ApiModel):
    scenario_name: str
    duration: float
    seed: int
    demand_level: str
    requested_vehicle_count: int
    generated_vehicle_count: int
    routed_vehicle_count: int
    discarded_vehicle_count: int
    completed_vehicle_count: int
    mean_travel_time: float | None
    mean_delay: float | None
    collisions: int
    teleports: int
    hard_braking_events: int
    emergency_braking_events: int
    ttc_warning_events: int
    ttc_critical_events: int
    minimum_observed_ttc: float | None
    maximum_observed_drac: float | None
    warnings: list[str]
    sumo_version: str
    scenario_checksum: str


class TrajectorySample(ApiModel):
    t: float
    longitude: float
    latitude: float
    height: float = 0
    speed: float
    acceleration: float
    angle: float
    edge_id: str
    lane_id: str


class Trajectory(ApiModel):
    vehicle_id: str
    samples: list[TrajectorySample]


class SafetySeverity(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"


class SafetyEvent(ApiModel):
    event_id: str
    category: str = "conflict"
    type: str
    source: str = "SUMO SSM device"
    start_time: float
    end_time: float
    minimum_ttc: float | None
    maximum_drac: float | None
    pet: float | None
    vehicle_ids: list[str]
    longitude: float | None
    latitude: float | None
    severity: SafetySeverity
    intervention_id: str | None = None


class TimeSeriesPoint(ApiModel):
    t: float
    value: float | None
    event_id: str | None = None


class TimeSeries(ApiModel):
    name: str
    unit: str
    points: list[TimeSeriesPoint]
