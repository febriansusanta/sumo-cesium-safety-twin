from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field

from .models.base import ApiModel
from .models.scenario import LocationConfig, ScenarioConfig

REPO_ROOT = Path(__file__).resolve().parents[2]


class LimitsConfig(ApiModel):
    max_bbox_area_km2: float = Field(gt=0, le=100)
    max_bbox_span_degrees: float = Field(gt=0, le=1)
    max_download_bytes: int = Field(gt=0)


class ProjectConfig(ApiModel):
    name: str
    version: str
    disclaimer: str


class Settings(ApiModel):
    project: ProjectConfig
    location: LocationConfig
    limits: LimitsConfig
    osm_url: str
    data_dir: Path
    config_file: Path
    log_level: str = "INFO"


def _override_bbox(raw: dict[str, Any]) -> None:
    bbox = raw["location"]["bbox"]
    for key in ("west", "south", "east", "north"):
        value = os.getenv(f"APP_BBOX_{key.upper()}")
        if value is not None:
            bbox[key] = float(value)


@lru_cache
def get_settings() -> Settings:
    config_file = _rooted_path(os.getenv("APP_CONFIG_FILE"), REPO_ROOT / "config/default.yaml")
    with config_file.open(encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    _override_bbox(raw)
    raw["osm_url"] = os.getenv("APP_OSM_URL", raw["osm_url"])
    raw["data_dir"] = _rooted_path(os.getenv("APP_DATA_DIR"), REPO_ROOT / "data")
    raw["config_file"] = config_file
    raw["log_level"] = os.getenv("APP_LOG_LEVEL", "INFO")
    settings = Settings.model_validate(raw)
    bbox = settings.location.bbox
    if bbox.approximate_area_km2() > settings.limits.max_bbox_area_km2:
        raise ValueError("configured bounding box exceeds max_bbox_area_km2")
    if max(bbox.east - bbox.west, bbox.north - bbox.south) > settings.limits.max_bbox_span_degrees:
        raise ValueError("configured bounding box exceeds max_bbox_span_degrees")
    return settings


def _rooted_path(value: str | None, default: Path) -> Path:
    path = Path(value).expanduser() if value else default
    return (REPO_ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def public_config(settings: Settings) -> dict[str, Any]:
    baseline = ScenarioConfig()
    return {
        "project": settings.project.model_dump(by_alias=True),
        "location": settings.location.model_dump(by_alias=True),
        "defaults": baseline.model_dump(mode="json", by_alias=True),
        "limits": settings.limits.model_dump(by_alias=True),
        "capabilities": {
            "offlinePlayback": True,
            "localDataImport": True,
            "cesiumIonRequired": False,
            "sumoVersion": "1.27.1",
            "pythonVersion": "3.13.14",
            "nodeVersion": "24.18.0",
            "cesiumVersion": "1.143.0",
        },
    }
