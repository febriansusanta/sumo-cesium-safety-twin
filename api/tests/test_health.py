from fastapi.testclient import TestClient

from app.main import app


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
