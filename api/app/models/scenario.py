from __future__ import annotations

import hashlib
import json
import math
from enum import StrEnum

from pydantic import Field, model_validator

from .base import ApiModel


class BoundingBox(ApiModel):
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def validate_order(self) -> BoundingBox:
        if self.west >= self.east or self.south >= self.north:
            raise ValueError("bbox west/south must be less than east/north")
        return self

    def approximate_area_km2(self) -> float:
        mean_lat = math.radians((self.south + self.north) / 2)
        width = (self.east - self.west) * 111.32 * math.cos(mean_lat)
        height = (self.north - self.south) * 110.574
        return width * height


class LocationConfig(ApiModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")
    bbox: BoundingBox


class DemandLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DemandConfig(ApiModel):
    level: DemandLevel = DemandLevel.MEDIUM
    period: float = Field(default=2.0, ge=0.25, le=30)
    departure_begin: float = Field(default=0, ge=0)
    departure_end: float = Field(default=90, gt=0, le=3600)
    minimum_distance: float = Field(default=75, ge=0, le=5000)
    maximum_distance: float | None = Field(default=None, ge=1, le=10_000)
    fringe_factor: float = Field(default=5, ge=0, le=100)

    @model_validator(mode="after")
    def validate_distance_support(self) -> DemandConfig:
        if self.maximum_distance is not None and self.maximum_distance < self.minimum_distance:
            raise ValueError("maximumDistance must be at least minimumDistance")
        if self.departure_begin >= self.departure_end:
            raise ValueError("departureBegin must be less than departureEnd")
        return self


class CarFollowingModel(StrEnum):
    KRAUSS = "Krauss"
    IDM = "IDM"
    EIDM = "EIDM"


class VehicleConfig(ApiModel):
    car_follow_model: CarFollowingModel = CarFollowingModel.KRAUSS
    accel: float = Field(default=2.6, gt=0, le=10)
    decel: float = Field(default=4.5, gt=0, le=15)
    emergency_decel: float = Field(default=9.0, gt=0, le=20)
    apparent_decel: float = Field(default=4.5, gt=0, le=15)
    tau: float = Field(default=1.0, gt=0, le=5)
    sigma: float = Field(default=0.5, ge=0, le=1)
    min_gap: float = Field(default=2.5, gt=0, le=20)
    max_speed: float = Field(default=13.89, gt=0, le=70)
    step_length: float = Field(default=0.1, ge=0.01, le=1)
    action_step_length: float = Field(default=1.0, ge=0.01, le=5)

    @model_validator(mode="after")
    def validate_dynamics(self) -> VehicleConfig:
        if self.emergency_decel < self.decel:
            raise ValueError("emergencyDecel must be greater than or equal to decel")
        ratio = self.action_step_length / self.step_length
        if not math.isclose(ratio, round(ratio), abs_tol=1e-8):
            raise ValueError("actionStepLength must be a multiple of stepLength")
        return self


class SafetyConfig(ApiModel):
    warning_ttc: float = Field(default=3.0, gt=0, le=20)
    critical_ttc: float = Field(default=1.5, gt=0, le=20)
    ssm_range: float = Field(default=50, gt=0, le=500)
    measures: list[str] = Field(default_factory=lambda: ["TTC", "DRAC", "PET"])
    retain_conflict_paths: bool = False
    hard_braking_threshold: float = Field(default=4.5, gt=0, le=20)
    emergency_braking_threshold: float = Field(default=8.0, gt=0, le=20)

    @model_validator(mode="after")
    def validate_thresholds(self) -> SafetyConfig:
        if self.critical_ttc >= self.warning_ttc:
            raise ValueError("criticalTtc must be less than warningTtc")
        if self.emergency_braking_threshold < self.hard_braking_threshold:
            raise ValueError("emergencyBrakingThreshold must be at least hardBrakingThreshold")
        allowed = {"TTC", "DRAC", "PET"}
        if not self.measures or not set(self.measures).issubset(allowed):
            raise ValueError("measures must contain only TTC, DRAC, and PET")
        return self


class InterventionConfig(ApiModel):
    enabled: bool = False
    trigger_time: float = Field(default=45, ge=5, le=3500)
    duration: float = Field(default=1, gt=0, le=10)
    lead_vehicle_id: str = "intervention_lead"
    follower_vehicle_id: str = "intervention_follower"


class ScenarioConfig(ApiModel):
    name: str = Field(default="Baseline", min_length=1, max_length=120)
    preset_id: str = Field(default="baseline", pattern=r"^[a-z0-9][a-z0-9-]*$")
    duration: float = Field(default=120, ge=30, le=3600)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)
    demand: DemandConfig = Field(default_factory=DemandConfig)
    vehicle: VehicleConfig = Field(default_factory=VehicleConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)
    intervention: InterventionConfig = Field(default_factory=InterventionConfig)

    @model_validator(mode="after")
    def validate_timing(self) -> ScenarioConfig:
        if self.demand.departure_end > self.duration:
            raise ValueError("demand departureEnd cannot exceed scenario duration")
        if self.intervention.enabled and self.intervention.trigger_time >= self.duration:
            raise ValueError("intervention triggerTime must be before scenario duration")
        return self

    def checksum(self) -> str:
        payload = json.dumps(
            self.model_dump(mode="json", by_alias=True),
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(payload).hexdigest()
