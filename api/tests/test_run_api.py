from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as main_module
from app.config import get_settings
from app.main import app
from app.services.network_service import build_network


def test_run_queue_completes_and_serves_summary(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/tiny-network.osm.xml"
    build_network(settings, fixture)
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    scenario = {
        "duration": 30,
        "demand": {"period": 5, "departureEnd": 20, "minimumDistance": 10},
    }
    with TestClient(app) as client:
        response = client.post("/api/runs", json=scenario)
        assert response.status_code == 202
        run_id = response.json()["runId"]
        deadline = time.monotonic() + 15
        status = "queued"
        while time.monotonic() < deadline:
            status = client.get(f"/api/runs/{run_id}/status").json()["status"]
            if status in {"completed", "failed"}:
                break
            time.sleep(0.05)
        assert status == "completed"
        summary = client.get(f"/api/runs/{run_id}/summary")
        assert summary.status_code == 200
        assert summary.json()["routedVehicleCount"] > 0
        assert client.get(f"/api/runs/{run_id}/safety-events").status_code == 200
        timeseries = client.get(f"/api/runs/{run_id}/timeseries")
        assert timeseries.status_code == 200
        assert timeseries.json()[0]["name"] == "TTC"
        assert client.delete(f"/api/runs/{run_id}").status_code == 204


def test_bundled_demo_loads_and_exports_safely(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    with TestClient(app) as client:
        demos = client.get("/api/demo-runs")
        assert demos.status_code == 200
        assert {demo["id"] for demo in demos.json()} >= {
            "baseline",
            "lead-emergency-braking",
        }
        loaded = client.post("/api/demo-runs/baseline/load")
        assert loaded.status_code == 200
        run_id = loaded.json()["runId"]
        assert client.get(f"/api/runs/{run_id}/summary").status_code == 200
        archive = client.get(f"/api/runs/{run_id}/archive")
        assert archive.status_code == 200
        assert archive.headers["content-type"] == "application/zip"
