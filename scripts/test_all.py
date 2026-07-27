from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.platform import ROOT, venv_python


def run(arguments: list[str], cwd: Path = ROOT) -> None:
    print(f"+ {' '.join(arguments)}")
    subprocess.run(arguments, cwd=cwd, check=True)


def main() -> int:
    if not venv_python().is_file():
        raise SystemExit("Run `python scripts/bootstrap.py` first")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        raise SystemExit("npm is missing")
    run(
        [
            str(venv_python()),
            "-m",
            "ruff",
            "check",
            "app",
            "tests",
            "../pipeline",
            "../scripts",
        ],
        ROOT / "api",
    )
    run([str(venv_python()), "-m", "pytest", "-q"], ROOT / "api")
    run([npm, "run", "lint"], ROOT / "web")
    run([npm, "test"], ROOT / "web")
    run([npm, "run", "build"], ROOT / "web")
    print("All available checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
