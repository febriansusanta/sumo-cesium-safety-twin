from __future__ import annotations

from pathlib import Path

from app.models.run import SafetySeverity, Trajectory, TrajectorySample
from app.models.scenario import InterventionConfig, SafetyConfig
from app.services.safety_service import (
    classify_ttc,
    detect_braking_events,
    parse_collisions,
    parse_ssm,
)


def test_ttc_classification_boundaries_are_strict() -> None:
    config = SafetyConfig(warning_ttc=3, critical_ttc=1.5)
    assert classify_ttc(None, config) == SafetySeverity.NORMAL
    assert classify_ttc(3, config) == SafetySeverity.NORMAL
    assert classify_ttc(1.5, config) == SafetySeverity.WARNING
    assert classify_ttc(1.49, config) == SafetySeverity.CRITICAL


def test_ssm_parser_deduplicates_reciprocal_conflicts_and_preserves_na(tmp_path: Path) -> None:
    path = tmp_path / "ssm.xml"
    path.write_text(
        """<SSMLog>
        <conflict begin="1" end="3" ego="a" foe="b">
          <timeSpan values="1 2"/><typeSpan values="2 2"/>
          <conflictPoint values="120.2,22.9 120.2,22.9"/>
          <TTCSpan values="2.5 NA"/><minTTC time="1" position="120.2,22.9" type="2" value="2.5"/>
          <maxDRAC time="1" position="120.2,22.9" type="2" value="2"/>
          <PET time="NA" position="NA" type="NA" value="NA"/>
        </conflict>
        <conflict begin="2" end="4" ego="b" foe="a">
          <timeSpan values="2"/><typeSpan values="2"/><conflictPoint values="120.2,22.9"/>
          <TTCSpan values="1.2"/><minTTC time="2" position="120.2,22.9" type="2" value="1.2"/>
          <maxDRAC time="2" position="120.2,22.9" type="2" value="5"/>
          <PET time="NA" position="NA" type="NA" value="NA"/>
        </conflict></SSMLog>""",
        encoding="utf-8",
    )
    parsed = parse_ssm(path, SafetyConfig())
    assert len(parsed.events) == 1
    assert parsed.events[0].minimum_ttc == 1.2
    assert parsed.events[0].maximum_drac == 5
    assert parsed.events[0].pet is None
    assert parsed.events[0].severity == SafetySeverity.CRITICAL


def test_ssm_parser_accepts_3d_local_positions_with_transform(tmp_path: Path) -> None:
    path = tmp_path / "ssm.xml"
    path.write_text(
        """<SSMLog><conflict begin="1" end="2" ego="a" foe="b">
          <minTTC time="1" position="10,20,3" type="2" value="1.0"/>
        </conflict></SSMLog>""",
        encoding="utf-8",
    )
    parsed = parse_ssm(path, SafetyConfig(), lambda x, y: (x + 100, y + 200))
    assert parsed.events[0].longitude == 110
    assert parsed.events[0].latitude == 220


def test_collision_parser_creates_critical_events(tmp_path: Path) -> None:
    path = tmp_path / "collisions.xml"
    path.write_text(
        """<collisions>
        <collision time="9" type="junction" collider="b" victim="a"
        colliderFront="10,20,3"/>
        </collisions>""",
        encoding="utf-8",
    )
    events = parse_collisions(path, lambda x, y: (x + 100, y + 200))
    assert events[0].category == "collision"
    assert events[0].severity == SafetySeverity.CRITICAL
    assert events[0].vehicle_ids == ["a", "b"]
    assert events[0].longitude == 110


def test_braking_events_use_measured_acceleration_and_intervention_tags() -> None:
    trajectory = Trajectory(
        vehicle_id="intervention_lead",
        samples=[
            TrajectorySample(
                t=20,
                longitude=120.2,
                latitude=22.9,
                speed=10,
                acceleration=-9,
                angle=0,
                edge_id="e",
                lane_id="e_0",
            )
        ],
    )
    events = detect_braking_events([trajectory], SafetyConfig(), InterventionConfig(enabled=True))
    assert events[0].type == "forced_intervention"
    assert events[0].severity == SafetySeverity.CRITICAL
    assert events[0].source == "measured FCD acceleration"
