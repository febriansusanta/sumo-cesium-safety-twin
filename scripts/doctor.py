from __future__ import annotations

import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.platform import discover_environment, write_environment_report

SYMBOLS = {"pass": "PASS", "warning": "WARN", "failure": "FAIL"}


def main() -> int:
    checks, report = discover_environment()
    print("SUMO-Cesium environment doctor")
    print("=" * 33)
    for check in checks:
        location = f" [{check.path}]" if check.path else ""
        print(f"{SYMBOLS[check.status]:4} {check.name}: {check.detail}{location}")
    destination = write_environment_report(report)
    print(f"\nEnvironment report: {destination}")
    failures = [check for check in checks if check.status == "failure"]
    if failures:
        print("\nEssential dependencies are missing.")
        if sys.platform == "win32":
            print(
                "Run `python scripts/bootstrap.py` for the project-local fallback, "
                "or see docs/platforms/windows.md."
            )
        else:
            print(
                f"See docs/platforms/{'macos' if sys.platform == 'darwin' else 'linux'}.md."
            )
        return 1
    print(f"\nReady. Active simulation mode: {report['simulationMode']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
