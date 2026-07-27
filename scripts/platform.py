from __future__ import annotations

import importlib.util
import json
import os
import shutil
import struct
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / ".venv"

Status = Literal["pass", "warning", "failure"]
UTC = timezone.utc  # noqa: UP017


@dataclass(frozen=True)
class Check:
    name: str
    status: Status
    detail: str
    path: str | None = None


def executable_name(name: str) -> str:
    return f"{name}.exe" if os.name == "nt" else name


def venv_bin_dir() -> Path:
    return VENV / ("Scripts" if os.name == "nt" else "bin")


def venv_python() -> Path:
    return venv_bin_dir() / executable_name("python")


def _candidate_sumo_roots() -> list[Path]:
    roots: list[Path] = []
    if value := os.getenv("SUMO_HOME"):
        roots.append(Path(value).expanduser())
    if os.name == "nt":
        for variable in ("ProgramFiles", "ProgramFiles(x86)"):
            if base := os.getenv(variable):
                roots.append(Path(base) / "Eclipse" / "Sumo")
    elif sys.platform == "darwin":
        roots.extend(
            [Path("/opt/homebrew/opt/sumo/share/sumo"), Path("/usr/local/share/sumo")]
        )
    else:
        roots.extend([Path("/usr/share/sumo"), Path("/usr/local/share/sumo")])
    return roots


def resolve_executable(name: str, environment_variable: str) -> Path | None:
    if explicit := os.getenv(environment_variable):
        path = Path(explicit).expanduser().resolve()
        return path if path.is_file() else None
    filename = executable_name(name)
    if sumo_home := os.getenv("SUMO_HOME"):
        candidate = Path(sumo_home).expanduser() / "bin" / filename
        if candidate.is_file():
            return candidate.resolve()
    project_candidate = venv_bin_dir() / filename
    if project_candidate.is_file():
        return project_candidate.resolve()
    if discovered := shutil.which(name):
        return Path(discovered).resolve()
    for root in _candidate_sumo_roots():
        candidate = root / "bin" / filename
        if candidate.is_file():
            return candidate.resolve()
    return None


def resolve_random_trips() -> Path | None:
    if tools := os.getenv("SUMO_TOOLS_DIR"):
        candidate = Path(tools).expanduser() / "randomTrips.py"
        if candidate.is_file():
            return candidate.resolve()
    for root in _candidate_sumo_roots():
        candidate = root / "tools" / "randomTrips.py"
        if candidate.is_file():
            return candidate.resolve()
    package_candidate = VENV / ("Lib/site-packages" if os.name == "nt" else "lib")
    if os.name == "nt":
        path = package_candidate / "sumo" / "tools" / "randomTrips.py"
        if path.is_file():
            return path.resolve()
    else:
        for path in package_candidate.glob(
            "python*/site-packages/sumo/tools/randomTrips.py"
        ):
            return path.resolve()
    return None


def command_output(arguments: list[str], cwd: Path | None = None) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            arguments,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 1, str(error)
    output = "\n".join(
        part.strip() for part in (completed.stdout, completed.stderr) if part.strip()
    )
    return completed.returncode, output


def first_line(value: str) -> str:
    return value.splitlines()[0] if value else "unknown"


def python_importable(module: str, python: Path | None = None) -> bool:
    if python is None:
        return importlib.util.find_spec(module) is not None
    code = (
        "import importlib.util; "
        f"raise SystemExit(0 if importlib.util.find_spec('{module}') else 1)"
    )
    return command_output([str(python), "-c", code])[0] == 0


def discover_environment() -> tuple[list[Check], dict[str, object]]:
    checks: list[Check] = []
    python = (
        venv_python() if venv_python().is_file() else Path(sys.executable).resolve()
    )
    checks.append(
        Check(
            "operating system",
            "pass",
            f"{sys.platform} ({struct.calcsize('P') * 8}-bit)",
        )
    )
    checks.append(Check("Python", "pass", sys.version.split()[0], str(python)))

    versions: dict[str, str | None] = {"python": sys.version.split()[0]}
    paths: dict[str, str | None] = {"python": str(python)}
    for name, arguments, essential in (
        ("node", ["node", "--version"], True),
        ("npm", ["npm.cmd" if os.name == "nt" else "npm", "--version"], True),
        ("git", ["git", "--version"], False),
    ):
        executable = shutil.which(arguments[0])
        if not executable:
            checks.append(
                Check(name, "failure" if essential else "warning", "not found")
            )
            versions[name] = None
            paths[name] = None
            continue
        code, output = command_output([executable, *arguments[1:]])
        status: Status = (
            "pass" if code == 0 else ("failure" if essential else "warning")
        )
        checks.append(Check(name, status, first_line(output), executable))
        versions[name] = first_line(output)
        paths[name] = executable

    resolved: dict[str, Path | None] = {}
    for name, variable in (
        ("sumo", "SUMO_BINARY"),
        ("netconvert", "NETCONVERT_BINARY"),
        ("duarouter", "DUAROUTER_BINARY"),
    ):
        path = resolve_executable(name, variable)
        resolved[name] = path
        if path is None:
            checks.append(
                Check(
                    name, "failure", "not found; run bootstrap or install Eclipse SUMO"
                )
            )
            versions[name] = None
            paths[name] = None
            continue
        code, output = command_output([str(path), "--version"])
        checks.append(
            Check(
                name, "pass" if code == 0 else "failure", first_line(output), str(path)
            )
        )
        versions[name] = first_line(output)
        paths[name] = str(path)

    random_trips = resolve_random_trips()
    checks.append(
        Check(
            "randomTrips.py",
            "pass" if random_trips else "failure",
            "available" if random_trips else "not found; check SUMO_TOOLS_DIR",
            str(random_trips) if random_trips else None,
        )
    )
    paths["randomTrips"] = str(random_trips) if random_trips else None

    for module in ("libsumo", "traci", "pyproj"):
        available = python_importable(module, python)
        checks.append(
            Check(
                module,
                "pass" if available else "failure",
                "importable" if available else "not importable",
            )
        )
        versions[module] = None

    same_installation = all(
        path is not None and (VENV in path.parents or bool(os.getenv("SUMO_HOME")))
        for path in (*resolved.values(), random_trips)
    )
    checks.append(
        Check(
            "SUMO tool consistency",
            "pass" if same_installation else "warning",
            "resolved from one configured installation"
            if same_installation
            else "verify tool versions and origins",
        )
    )

    package_lock = ROOT / "web" / "package-lock.json"
    checks.append(
        Check(
            "Node lock file",
            "pass" if package_lock.is_file() else "failure",
            "web/package-lock.json present"
            if package_lock.is_file()
            else "run npm install in web",
            str(package_lock) if package_lock.is_file() else None,
        )
    )
    mode = (
        "libsumo"
        if python_importable("libsumo", python)
        else ("traci" if python_importable("traci", python) else "subprocess")
    )
    report: dict[str, object] = {
        "platform": sys.platform,
        "architecture": f"{struct.calcsize('P') * 8}-bit",
        "shell": os.getenv("SHELL") or os.getenv("COMSPEC") or "unknown",
        "sumoHome": os.getenv("SUMO_HOME") or None,
        "simulationMode": mode,
        "versions": versions,
        "paths": paths,
        "cesiumVersion": _package_version("cesium"),
        "timestamp": datetime.now(UTC).isoformat(),
    }
    return checks, report


def _package_version(name: str) -> str | None:
    package_file = ROOT / "web" / "package.json"
    if not package_file.is_file():
        return None
    package = json.loads(package_file.read_text(encoding="utf-8"))
    return package.get("dependencies", {}).get(name)


def write_environment_report(report: dict[str, object]) -> Path:
    destination = ROOT / "data" / "environment.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return destination


def serialise_checks(checks: list[Check]) -> list[dict[str, object]]:
    return [asdict(check) for check in checks]
