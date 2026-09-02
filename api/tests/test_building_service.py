from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as main_module
from app.config import get_settings
from app.main import app
from app.services.building_service import load_or_create_buildings
from app.services.network_service import latest_geojson


def _write_network_geojson(path: Path) -> None:
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "lane-1",
                "properties": {"featureType": "lane"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[120.294, 23.105], [120.295, 23.106]],
                },
            }
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_context_buildings_are_generated_from_network_bounds(tmp_path: Path) -> None:
    network_dir = tmp_path / "network"
    network_dir.mkdir()
    _write_network_geojson(network_dir / "test-network.geojson")
    settings = get_settings().model_copy(update={"data_dir": tmp_path})

    buildings = load_or_create_buildings(settings)

    assert buildings["type"] == "FeatureCollection"
    assert buildings["metadata"]["source"] == "generated-context"
    assert len(buildings["features"]) > 0
    first = buildings["features"][0]
    assert first["geometry"]["type"] == "Polygon"
    assert first["properties"]["height"] > 0


def test_latest_geojson_ignores_building_cache(tmp_path: Path) -> None:
    network_dir = tmp_path / "network"
    network_dir.mkdir()
    road_path = network_dir / "test-network.geojson"
    building_path = network_dir / "test-network.buildings.geojson"
    _write_network_geojson(road_path)
    _write_network_geojson(building_path)
    settings = get_settings().model_copy(update={"data_dir": tmp_path})

    assert latest_geojson(settings) == road_path


def test_buildings_endpoint_serves_geojson(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    network_dir = tmp_path / "network"
    network_dir.mkdir()
    _write_network_geojson(network_dir / "test-network.geojson")
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)

    with TestClient(app) as client:
        response = client.get("/api/buildings")

    assert response.status_code == 200
    assert response.json()["type"] == "FeatureCollection"
    assert len(response.json()["features"]) > 0
