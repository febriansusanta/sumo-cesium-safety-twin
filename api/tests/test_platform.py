from pathlib import Path

from scripts import platform as project_platform


def test_explicit_sumo_path_takes_precedence(monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    executable = tmp_path / project_platform.executable_name("sumo")
    executable.touch()
    monkeypatch.setenv("SUMO_BINARY", str(executable))
    assert project_platform.resolve_executable("sumo", "SUMO_BINARY") == executable.resolve()


def test_missing_explicit_path_is_rejected(monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("NETCONVERT_BINARY", str(tmp_path / "missing"))
    assert project_platform.resolve_executable("netconvert", "NETCONVERT_BINARY") is None
