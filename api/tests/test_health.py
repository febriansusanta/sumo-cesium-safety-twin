from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app
from app.models.location_search import LocationSearchResult
from app.models.scenario import BoundingBox


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_config_is_token_free() -> None:
    with TestClient(app) as client:
        response = client.get("/api/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["capabilities"]["cesiumIonRequired"] is False
    assert payload["defaults"]["seed"] == 42


def test_environment_does_not_expose_paths() -> None:
    with TestClient(app) as client:
        response = client.get("/api/environment")
    assert response.status_code == 200
    assert "paths" not in response.json()


def test_safety_presets_are_available() -> None:
    with TestClient(app) as client:
        response = client.get("/api/scenarios/presets")
    assert response.status_code == 200
    presets = {item["id"]: item for item in response.json()}
    assert set(presets) == {
        "baseline",
        "high-demand",
        "lead-emergency-braking",
        "reduced-reaction-margin",
    }
    assert presets["reduced-reaction-margin"]["scenario"]["vehicle"]["tau"] == 0.7


def test_location_search_endpoint_returns_aoi_bbox(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def fake_search(*_args, **_kwargs) -> list[LocationSearchResult]:  # type: ignore[no-untyped-def]
        return [
            LocationSearchResult(
                place_id="1",
                display_name="Nanke, Tainan, Taiwan",
                longitude=120.294,
                latitude=23.106,
                bbox=BoundingBox(
                    west=120.2939,
                    south=23.1055,
                    east=120.2955,
                    north=23.1067,
                ),
                bbox_area_km2=0.03,
            )
        ]

    monkeypatch.setattr(main_module, "search_locations", fake_search)
    with TestClient(app) as client:
        response = client.get("/api/locations/search", params={"q": "Nanke"})
    assert response.status_code == 200
    assert response.json()[0]["bbox"]["west"] == 120.2939
