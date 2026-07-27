from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.platform import ROOT, VENV, command_output, venv_bin_dir, venv_python

STAMP = ROOT / "data" / "cache" / "bootstrap.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(
    arguments: list[str], cwd: Path = ROOT, environment: dict[str, str] | None = None
) -> None:
    print(f"+ {' '.join(arguments)}")
    subprocess.run(arguments, cwd=cwd, env=environment, check=True)


def load_stamp() -> dict[str, str]:
    if not STAMP.is_file():
        return {}
    try:
        return json.loads(STAMP.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def ensure_host_tools() -> None:
    if sys.version_info < (3, 12) or sys.version_info >= (3, 14):
        raise SystemExit("Python 3.12 or 3.13 is required to bootstrap this project")
    for command in ("node", "npm.cmd" if os.name == "nt" else "npm"):
        if shutil.which(command) is None:
            raise SystemExit(
                f"Missing required host command: {command}. See docs/platforms/."
            )


def ensure_directories() -> None:
    for relative in (
        "data/raw",
        "data/network",
        "data/demand",
        "data/runs",
        "data/cache",
    ):
        directory = ROOT / relative
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=directory, delete=True):
            pass


def ensure_environment_file() -> None:
    target = ROOT / ".env"
    if not target.exists():
        shutil.copyfile(ROOT / ".env.example", target)
        print("Created .env from .env.example")


def sync_python(previous: dict[str, str]) -> str:
    lock = ROOT / "api" / "uv.lock"
    lock_hash = digest(lock)
    if not venv_python().is_file():
        print(f"Creating project environment at {VENV}")
        venv.EnvBuilder(with_pip=True).create(VENV)
    if previous.get("pythonLock") == lock_hash:
        code, _ = command_output(
            [str(venv_python()), "-c", "import fastapi,libsumo,pyproj"]
        )
        if code == 0:
            print("Python environment is current")
            return lock_hash
    run(
        [
            str(venv_python()),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "uv==0.11.21",
        ]
    )
    uv = venv_bin_dir() / ("uv.exe" if os.name == "nt" else "uv")
    environment = os.environ.copy()
    environment["VIRTUAL_ENV"] = str(VENV)
    environment["UV_PROJECT_ENVIRONMENT"] = str(VENV)
    run(
        [str(uv), "sync", "--active", "--project", str(ROOT / "api")],
        environment=environment,
    )
    return lock_hash


def sync_node(previous: dict[str, str]) -> str:
    lock = ROOT / "web" / "package-lock.json"
    lock_hash = digest(lock)
    if (
        previous.get("nodeLock") == lock_hash
        and (ROOT / "web" / "node_modules").is_dir()
    ):
        print("Node environment is current")
        return lock_hash
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        raise SystemExit("npm is required")
    run([npm, "ci"], cwd=ROOT / "web")
    return lock_hash


def main() -> int:
    ensure_host_tools()
    ensure_directories()
    ensure_environment_file()
    previous = load_stamp()
    python_lock = sync_python(previous)
    node_lock = sync_node(previous)
    run(
        [str(venv_python()), "-m", "pytest", "-q", "tests/test_health.py"],
        cwd=ROOT / "api",
    )
    result = subprocess.run(
        [str(venv_python()), str(ROOT / "scripts" / "doctor.py")], cwd=ROOT, check=False
    )
    if result.returncode != 0:
        return result.returncode
    STAMP.parent.mkdir(parents=True, exist_ok=True)
    STAMP.write_text(
        json.dumps({"pythonLock": python_lock, "nodeLock": node_lock}, indent=2) + "\n",
        encoding="utf-8",
    )
    print("\nBootstrap complete.")
    print("Start development with: python scripts/dev.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
