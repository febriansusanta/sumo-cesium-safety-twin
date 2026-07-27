from __future__ import annotations

import argparse
import sys
from pathlib import Path

if sys.version_info < (3, 12):  # noqa: UP036
    raise SystemExit("Python 3.12 or 3.13 is required. Run this with the project .venv.")

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.config import get_settings
from app.services.archive_service import create_run_archive


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a completed run archive")
    parser.add_argument("run_id")
    parser.add_argument("--output", type=Path, help="destination ZIP path")
    args = parser.parse_args()

    settings = get_settings()
    run_dir = settings.data_dir / "runs" / args.run_id
    if not run_dir.is_dir():
        raise SystemExit(f"Run not found: {args.run_id}")
    if not (run_dir / "summary.json").is_file():
        raise SystemExit(f"Run is not complete: {args.run_id}")
    destination = args.output or settings.data_dir / "cache/archives" / f"{args.run_id}.zip"
    archive = create_run_archive(run_dir, destination)
    print(f"Exported archive: {archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
