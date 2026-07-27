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
from app.services.local_data_service import (
    discover_local_datasets,
    import_local_dataset,
    preferred_local_dataset,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import SUMO outputs from the local Data folder")
    parser.add_argument(
        "dataset_id",
        nargs="?",
        help="dataset id from --list; defaults to the best playback-ready dataset",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        help="override the local data folder, defaulting to ../Data or APP_LOCAL_DATA_DIR",
    )
    parser.add_argument("--list", action="store_true", help="list discovered local datasets")
    parser.add_argument("--replace", action="store_true", help="replace an existing imported run")
    args = parser.parse_args()

    datasets = discover_local_datasets(args.data_dir)
    if args.list:
        if not datasets:
            print("No SUMO project folders were found.")
            return 1
        for dataset in datasets:
            state = "ready" if dataset.ready_for_playback else "missing FCD"
            print(f"{dataset.id:80} {state:12} {dataset.relative_path}")
        return 0

    dataset_id = args.dataset_id
    if dataset_id is None:
        dataset_id = preferred_local_dataset(args.data_dir).id
    record = import_local_dataset(
        get_settings(),
        dataset_id,
        data_root=args.data_dir,
        replace=args.replace,
    )
    print(f"Imported run: {record.run_id}")
    print("Start the dashboard with: python scripts/dev.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
