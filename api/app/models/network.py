from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import Field

from .base import ApiModel
from .scenario import BoundingBox

UTC = timezone.utc  # noqa: UP017


class DrivingSide(StrEnum):
    RIGHT = "right"
    LEFT = "left"


class NetworkStatus(StrEnum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    BUILDING = "building"
    READY = "ready"
    FAILED = "failed"


class NetworkBuildRequest(ApiModel):
    name: str = Field(default="custom-aoi", min_length=1, max_length=80)
    bbox: BoundingBox
    driving_side: DrivingSide = DrivingSide.RIGHT
    force_refresh: bool = False


class NetworkMetadata(ApiModel):
    network_id: str
    name: str
    bbox: BoundingBox
    driving_side: DrivingSide
    status: NetworkStatus
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str = "OpenStreetMap"
    osm_checksum: str | None = None
    network_checksum: str | None = None
    geojson_checksum: str | None = None
    sumo_version: str | None = None
    edge_count: int = 0
    lane_count: int = 0
    junction_count: int = 0
    cache_hit: bool = False
    message: str | None = None
    warnings: list[str] = Field(default_factory=list)
