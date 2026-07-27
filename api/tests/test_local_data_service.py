from __future__ import annotations

from pathlib import Path

from app.services.local_data_service import discover_local_datasets, preferred_local_dataset


def test_local_dataset_discovery_prefers_playback_ready_outputs(tmp_path: Path) -> None:
    incomplete = tmp_path / "salun" / "project"
    incomplete.mkdir(parents=True)
    (incomplete / "project.sumocfg").write_text("<configuration/>", encoding="utf-8")
    (incomplete / "project.net.xml").write_text("<net/>", encoding="utf-8")

    ready = tmp_path / "Nanke" / "project" / "run"
    ready.mkdir(parents=True)
    (ready / "run.sumocfg").write_text("<configuration/>", encoding="utf-8")
    (ready / "nanke.net.xml").write_text("<net/>", encoding="utf-8")
    (ready / "fcd.xml").write_text("<fcd-export/>", encoding="utf-8")
    (ready / "ssm.xml").write_text("<SSMLog/>", encoding="utf-8")

    datasets = discover_local_datasets(tmp_path)
    assert [dataset.ready_for_playback for dataset in datasets] == [True, False]
    assert preferred_local_dataset(tmp_path).relative_path == "Nanke/project/run"
