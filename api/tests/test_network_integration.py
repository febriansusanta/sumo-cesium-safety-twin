from pathlib import Path

from app.config import get_settings
from app.services.coordinate_service import CoordinateTransformer, read_network_location
from app.services.network_service import build_network


def test_fixture_builds_valid_network(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/tiny-network.osm.xml"
    artifact = build_network(settings, fixture)
    assert artifact.edge_count >= 2
    assert artifact.lane_count >= 2
    assert artifact.geojson_path.is_file()
    assert "FeatureCollection" in artifact.geojson_path.read_text(encoding="utf-8")
    transformer = CoordinateTransformer(read_network_location(artifact.network_path))
    longitude, latitude = 120.218, 22.9962
    x, y = transformer.from_wgs84(longitude, latitude)
    roundtrip = transformer.to_wgs84(x, y)
    assert abs(roundtrip[0] - longitude) < 1e-8
    assert abs(roundtrip[1] - latitude) < 1e-8
