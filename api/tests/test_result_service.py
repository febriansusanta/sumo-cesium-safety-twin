from __future__ import annotations

from pathlib import Path

import pytest

from app.services.result_service import ResultParseError, parse_fcd


def test_fcd_parser_preserves_geo_samples_and_ids(tmp_path: Path) -> None:
    path = tmp_path / "fcd.xml"
    path.write_text(
        """<fcd-export><timestep time="1.20"><vehicle id="veh_2" x="120.2" y="22.9"
        speed="8.2" acceleration="-0.4" angle="92" lane="edge_a_0"/></timestep></fcd-export>""",
        encoding="utf-8",
    )
    trajectories = parse_fcd(path)
    assert trajectories[0].vehicle_id == "veh_2"
    assert trajectories[0].samples[0].edge_id == "edge_a"
    assert trajectories[0].samples[0].longitude == 120.2


def test_fcd_parser_transforms_local_coordinates_and_derives_acceleration(
    tmp_path: Path,
) -> None:
    path = tmp_path / "fcd.xml"
    path.write_text(
        """<fcd-export>
        <timestep time="1">
          <vehicle id="veh" x="10" y="20" z="3" speed="2" lane="edge_0"/>
        </timestep>
        <timestep time="3">
          <vehicle id="veh" x="12" y="24" z="3" speed="8" lane="edge_0"/>
        </timestep>
        </fcd-export>""",
        encoding="utf-8",
    )
    trajectories = parse_fcd(path, lambda x, y: (x + 100, y + 200))
    samples = trajectories[0].samples
    assert samples[0].longitude == 110
    assert samples[0].latitude == 220
    assert samples[0].height == 3
    assert samples[0].acceleration == 0
    assert samples[1].acceleration == 3


def test_invalid_fcd_has_a_clear_error(tmp_path: Path) -> None:
    path = tmp_path / "broken.xml"
    path.write_text("<fcd-export><timestep>", encoding="utf-8")
    with pytest.raises(ResultParseError, match="invalid FCD"):
        parse_fcd(path)
