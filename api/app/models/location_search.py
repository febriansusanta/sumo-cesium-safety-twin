from __future__ import annotations

from pydantic import Field

from .base import ApiModel
from .scenario import BoundingBox


class LocationSearchResult(ApiModel):
    place_id: str
    display_name: str
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    bbox: BoundingBox
    bbox_adjusted: bool = False
    bbox_area_km2: float = Field(ge=0)
    category: str | None = None
    type: str | None = None
    osm_type: str | None = None
    osm_id: str | None = None
    source: str = "Nominatim/OpenStreetMap"
