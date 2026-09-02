from __future__ import annotations

from pathlib import Path

from app.config import get_settings
from app.models.network import DrivingSide, NetworkBuildRequest, NetworkStatus
from app.models.scenario import BoundingBox
from app.services.checksum_service import file_checksum
from app.services.network_registry_service import NetworkRegistry, NetworkRegistryError
from app.services.network_service import build_network
from app.services.osm_service import OsmArtifact


def test_registry_rejects_over_limit_aoi(tmp_path: Path) -> None:
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    registry = NetworkRegistry(settings)
    request = NetworkBuildRequest(
        name="too-large",
        bbox=BoundingBox(west=120.0, south=22.0, east=121.0, north=23.0),
    )

    try:
        registry.network_id_for(request)
    except NetworkRegistryError as error:
        assert "exceeds max_bbox_area_km2" in str(error)
    else:
        raise AssertionError("large AOI was accepted")


def test_registry_records_explicit_left_hand_network(tmp_path: Path) -> None:
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    registry = NetworkRegistry(settings)
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/tiny-network.osm.xml"
    request = NetworkBuildRequest(
        name="fixture-left-hand",
        bbox=settings.location.bbox,
        driving_side=DrivingSide.LEFT,
    )
    network_id = registry.network_id_for(request)
    directory = registry.network_path(network_id).parent
    location = registry.location_for(request)

    artifact = build_network(
        settings,
        fixture,
        location=location,
        destination_dir=directory,
        output_stem="network",
        driving_side=request.driving_side,
    )
    osm = OsmArtifact(fixture, file_checksum(fixture), True, fixture.stat().st_size)
    metadata = registry.metadata_from_artifacts(network_id, request, osm, artifact)
    registry.write_request(network_id, request)
    registry.write_source_reference(network_id, request, osm, artifact)
    registry.write(metadata)

    saved = registry.get(network_id)
    assert saved is not None
    assert saved.status == NetworkStatus.READY
    assert saved.driving_side == DrivingSide.LEFT
    assert saved.network_checksum == file_checksum(registry.network_path(network_id))
    assert registry.geojson_path(network_id).is_file()
    assert "--lefthand" in (directory / "network.netconvert.log").read_text(encoding="utf-8")
