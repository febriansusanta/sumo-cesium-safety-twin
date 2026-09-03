from __future__ import annotations

from pathlib import Path

import httpx

from app.config import get_settings
from app.services.location_search_service import search_locations


def test_location_search_parses_and_caches_nominatim_results(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert "sumo-cesium-safety-twin" in request.headers["user-agent"]
        assert request.url.params["q"] == "Nanke"
        return httpx.Response(
            200,
            json=[
                {
                    "place_id": 123,
                    "display_name": "Nanke, Tainan, Taiwan",
                    "lat": "23.106",
                    "lon": "120.294",
                    "boundingbox": ["23.1055", "23.1067", "120.2939", "120.2955"],
                    "category": "place",
                    "type": "industrial",
                    "osm_type": "relation",
                    "osm_id": 456,
                }
            ],
        )

    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    transport = httpx.MockTransport(handler)
    first = search_locations(settings, " Nanke ", transport=transport)
    second = search_locations(settings, "Nanke", transport=transport)

    assert calls == 1
    assert first == second
    assert first[0].display_name == "Nanke, Tainan, Taiwan"
    assert first[0].bbox.west == 120.2939
    assert first[0].bbox_adjusted is False


def test_location_search_clips_large_results_to_safe_aoi(tmp_path: Path) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {
                    "place_id": 999,
                    "display_name": "Tainan, Taiwan",
                    "lat": "22.999",
                    "lon": "120.227",
                    "boundingbox": ["22.8", "23.4", "120.0", "120.6"],
                }
            ],
        )

    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    result = search_locations(settings, "Tainan", transport=httpx.MockTransport(handler))[0]

    assert result.bbox_adjusted is True
    assert result.bbox.approximate_area_km2() <= settings.limits.max_bbox_area_km2
    assert max(
        result.bbox.east - result.bbox.west,
        result.bbox.north - result.bbox.south,
    ) <= settings.limits.max_bbox_span_degrees


def test_location_search_expands_point_sized_results(tmp_path: Path) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {
                    "place_id": 321,
                    "display_name": "南科, Tainan, Taiwan",
                    "lat": "23.107248",
                    "lon": "120.301948",
                    "boundingbox": ["23.107198", "23.107298", "120.301898", "120.301998"],
                }
            ],
        )

    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    result = search_locations(settings, "Nanke", transport=httpx.MockTransport(handler))[0]

    assert result.bbox_adjusted is True
    assert result.bbox.approximate_area_km2() > 0.1
