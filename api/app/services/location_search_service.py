from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import httpx

from app.config import Settings
from app.models.location_search import LocationSearchResult
from app.models.scenario import BoundingBox

from .checksum_service import object_checksum

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_SEARCH_LIMIT = 5
MAX_SEARCH_LIMIT = 10
DEFAULT_AOI_HALF_SIDE_KM = 0.4
MIN_SEARCH_AOI_AREA_KM2 = 0.01


class LocationSearchError(RuntimeError):
    pass


class LocationSearchQueryError(LocationSearchError):
    pass


def _cache_dir(settings: Settings) -> Path:
    path = settings.data_dir / "cache" / "location-search"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _search_url() -> str:
    return os.getenv("APP_GEOCODER_URL", NOMINATIM_SEARCH_URL)


def _user_agent(settings: Settings) -> str:
    return os.getenv(
        "APP_GEOCODER_USER_AGENT",
        f"sumo-cesium-safety-twin/{settings.project.version} (+local research prototype)",
    )


def _normalized_query(query: str) -> str:
    normalized = " ".join(query.strip().split())
    if len(normalized) < 2:
        raise LocationSearchQueryError("Search query must contain at least 2 characters")
    if len(normalized) > 120:
        raise LocationSearchQueryError("Search query must be 120 characters or fewer")
    return normalized


def _cache_key(query: str, limit: int, search_url: str) -> str:
    return object_checksum(
        {
            "query": query.lower(),
            "limit": limit,
            "searchUrl": search_url,
            "aoiSizingVersion": 2,
        }
    )


def _float(value: Any, field: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise LocationSearchError(f"location result has invalid {field}") from error


def _bbox_from_nominatim(raw: dict[str, Any]) -> BoundingBox:
    values = raw.get("boundingbox")
    if not isinstance(values, list) or len(values) != 4:
        longitude = _float(raw.get("lon"), "longitude")
        latitude = _float(raw.get("lat"), "latitude")
        return _centered_bbox(longitude, latitude, DEFAULT_AOI_HALF_SIDE_KM)
    south, north, west, east = (_float(item, "boundingbox") for item in values)
    return BoundingBox(west=west, south=south, east=east, north=north)


def _centered_bbox(longitude: float, latitude: float, half_side_km: float) -> BoundingBox:
    latitude_delta = half_side_km / 110.574
    longitude_delta = half_side_km / (
        111.320 * max(0.2, math.cos(math.radians(latitude)))
    )
    return BoundingBox(
        west=max(-180, longitude - longitude_delta),
        south=max(-90, latitude - latitude_delta),
        east=min(180, longitude + longitude_delta),
        north=min(90, latitude + latitude_delta),
    )


def _safe_aoi_bbox(
    settings: Settings,
    bbox: BoundingBox,
    longitude: float,
    latitude: float,
) -> tuple[BoundingBox, bool]:
    if (
        MIN_SEARCH_AOI_AREA_KM2
        <= bbox.approximate_area_km2()
        <= settings.limits.max_bbox_area_km2
        and max(bbox.east - bbox.west, bbox.north - bbox.south)
        <= settings.limits.max_bbox_span_degrees
    ):
        return bbox, False

    max_half_side = math.sqrt(settings.limits.max_bbox_area_km2) / 2.5
    half_side = min(DEFAULT_AOI_HALF_SIDE_KM, max_half_side)
    return _centered_bbox(longitude, latitude, half_side), True


def _parse_result(settings: Settings, raw: dict[str, Any]) -> LocationSearchResult:
    longitude = _float(raw.get("lon"), "longitude")
    latitude = _float(raw.get("lat"), "latitude")
    bbox, adjusted = _safe_aoi_bbox(
        settings,
        _bbox_from_nominatim(raw),
        longitude,
        latitude,
    )
    display_name = str(raw.get("display_name", "")).strip()
    if not display_name:
        display_name = f"{latitude:.6f}, {longitude:.6f}"
    return LocationSearchResult(
        place_id=str(raw.get("place_id", raw.get("osm_id", display_name))),
        display_name=display_name,
        longitude=longitude,
        latitude=latitude,
        bbox=bbox,
        bbox_adjusted=adjusted,
        bbox_area_km2=bbox.approximate_area_km2(),
        category=str(raw["category"]) if raw.get("category") is not None else None,
        type=str(raw["type"]) if raw.get("type") is not None else None,
        osm_type=str(raw["osm_type"]) if raw.get("osm_type") is not None else None,
        osm_id=str(raw["osm_id"]) if raw.get("osm_id") is not None else None,
    )


def _read_cache(path: Path) -> list[LocationSearchResult] | None:
    if not path.is_file():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [LocationSearchResult.model_validate(item) for item in payload]


def _write_cache(path: Path, results: list[LocationSearchResult]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(
            [item.model_dump(mode="json", by_alias=True) for item in results],
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def search_locations(
    settings: Settings,
    query: str,
    *,
    limit: int = DEFAULT_SEARCH_LIMIT,
    transport: httpx.BaseTransport | None = None,
) -> list[LocationSearchResult]:
    normalized_query = _normalized_query(query)
    bounded_limit = max(1, min(limit, MAX_SEARCH_LIMIT))
    search_url = _search_url()
    key = _cache_key(normalized_query, bounded_limit, search_url)
    cache_path = _cache_dir(settings) / f"{key[:16]}.json"
    cached = _read_cache(cache_path)
    if cached is not None:
        return cached

    params = {
        "q": normalized_query,
        "format": "jsonv2",
        "addressdetails": "1",
        "limit": str(bounded_limit),
        "dedupe": "1",
    }
    headers = {
        "Accept": "application/json",
        "Accept-Language": "zh-TW,en;q=0.8",
        "User-Agent": _user_agent(settings),
    }
    try:
        with httpx.Client(transport=transport, timeout=12, follow_redirects=True) as client:
            response = client.get(search_url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, json.JSONDecodeError) as error:
        raise LocationSearchError(f"Location search failed: {error}") from error

    if not isinstance(payload, list):
        raise LocationSearchError("Location search returned an unexpected payload")

    results = [
        _parse_result(settings, item)
        for item in payload
        if isinstance(item, dict) and item.get("lat") is not None and item.get("lon") is not None
    ]
    _write_cache(cache_path, results)
    return results
