from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from app.services.archive_service import ArchiveError, create_run_archive, import_run_archive


def test_archive_is_deterministic_and_round_trips(tmp_path: Path) -> None:
    source = tmp_path / "run"
    source.mkdir()
    for name in ("effective-scenario.json", "summary.json", "manifest.json"):
        (source / name).write_text(f'{{"file":"{name}"}}', encoding="utf-8")
    first = create_run_archive(source, tmp_path / "first.zip")
    second = create_run_archive(source, tmp_path / "second.zip")
    assert first.read_bytes() == second.read_bytes()
    destination = tmp_path / "loaded"
    import_run_archive(first, destination)
    assert (destination / "summary.json").is_file()


def test_archive_rejects_path_traversal(tmp_path: Path) -> None:
    archive = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("../outside.txt", "no")
    with pytest.raises(ArchiveError, match="unsafe"):
        import_run_archive(archive, tmp_path / "loaded")
    assert not (tmp_path / "outside.txt").exists()
