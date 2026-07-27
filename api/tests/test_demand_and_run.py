from __future__ import annotations

from pathlib import Path

from app.config import get_settings
from app.models.scenario import DemandConfig, ScenarioConfig
from app.services.demand_service import generate_demand
from app.services.network_service import build_network
from app.services.simulation_service import execute_run


def _fixture_network(tmp_path: Path) -> Path:
    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/tiny-network.osm.xml"
    return build_network(settings, fixture).network_path


def test_same_seed_produces_equivalent_demand_checksum(tmp_path: Path) -> None:
    network = _fixture_network(tmp_path)
    scenario = ScenarioConfig(
        duration=30,
        demand=DemandConfig(period=5, departure_end=20, minimum_distance=10),
    )
    first = generate_demand(network, scenario, tmp_path / "demand-a")
    second = generate_demand(network, scenario, tmp_path / "demand-b")
    assert first.routed_count > 0
    assert first.checksum == second.checksum


def test_short_libsumo_run_writes_auditable_results(tmp_path: Path) -> None:
    network = _fixture_network(tmp_path)
    scenario = ScenarioConfig(
        duration=30,
        demand=DemandConfig(period=5, departure_end=20, minimum_distance=10),
    )
    run_dir = tmp_path / "run"
    summary = execute_run(run_dir, network, scenario)
    assert summary.routed_vehicle_count > 0
    assert summary.sumo_version.endswith("1.27.1")
    for name in (
        "effective-scenario.json",
        "routes.xml",
        "fcd.xml",
        "summary.json",
        "trajectories.json",
        "ssm.xml",
        "safety-events.json",
        "timeseries.json",
        "manifest.json",
        "sumo.log",
    ):
        assert (run_dir / name).is_file()
