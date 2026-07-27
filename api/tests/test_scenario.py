import pytest
from pydantic import ValidationError

from app.models.scenario import BoundingBox, DemandConfig, ScenarioConfig, VehicleConfig


def test_baseline_checksum_is_stable() -> None:
    assert ScenarioConfig().checksum() == ScenarioConfig().checksum()


def test_bbox_area_is_compact() -> None:
    bbox = BoundingBox(west=120.2168, south=22.9954, east=120.2200, north=22.9970)
    assert 0.05 < bbox.approximate_area_km2() < 0.07


def test_emergency_decel_must_cover_normal_decel() -> None:
    with pytest.raises(ValidationError):
        VehicleConfig(decel=5, emergency_decel=4)


def test_supported_maximum_distance_is_validated() -> None:
    assert DemandConfig(minimum_distance=10, maximum_distance=20).maximum_distance == 20
    with pytest.raises(ValidationError):
        DemandConfig(minimum_distance=20, maximum_distance=10)
