from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.platform import ROOT

TARGETS = {
    "temporary": [ROOT / "data/cache"],
    "demand": [ROOT / "data/demand"],
    "network": [ROOT / "data/network", ROOT / "data/networks", ROOT / "data/raw"],
    "runs": [ROOT / "data/runs"],
}


def safe_clear(directory: Path) -> None:
    resolved = directory.resolve()
    data_root = (ROOT / "data").resolve()
    if data_root not in resolved.parents:
        raise RuntimeError(f"Refusing to clear path outside data directory: {resolved}")
    if not directory.exists():
        return
    for child in directory.iterdir():
        if child.name == ".gitkeep":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove generated project data")
    parser.add_argument("target", choices=[*TARGETS, "all"])
    parser.add_argument(
        "--yes", action="store_true", help="confirm destructive deletion"
    )
    args = parser.parse_args()
    if not args.yes:
        raise SystemExit("Refusing to delete generated data without --yes")
    selected = TARGETS.values() if args.target == "all" else [TARGETS[args.target]]
    for directories in selected:
        for directory in directories:
            safe_clear(directory)
            print(f"Cleared {directory.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
