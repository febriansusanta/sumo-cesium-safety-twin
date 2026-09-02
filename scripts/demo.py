from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.config import REPO_ROOT, get_settings
from app.models.network import NetworkBuildRequest
from app.models.scenario import ScenarioConfig
from app.services.archive_service import create_run_archive
from app.services.checksum_service import file_checksum
from app.services.network_registry_service import NetworkRegistry
from app.services.network_service import build_network
from app.services.osm_service import download_osm
from app.services.preset_service import load_presets
from app.services.simulation_service import execute_run


def main() -> int:
    settings = get_settings()
    registry = NetworkRegistry(settings)
    metadata = registry.latest_ready() or registry.register_legacy_latest()
    if metadata is None:
        request = NetworkBuildRequest(name=settings.location.name, bbox=settings.location.bbox)
        network_id = registry.network_id_for(request)
        location = registry.location_for(request)
        directory = registry.network_path(network_id).parent
        registry.write_request(network_id, request)
        osm = download_osm(
            settings,
            location=location,
            destination_dir=directory,
            filename_stem="source",
        )
        artifact = build_network(
            settings,
            osm.path,
            location=location,
            destination_dir=directory,
            output_stem="network",
        )
        metadata = registry.metadata_from_artifacts(network_id, request, osm, artifact)
        registry.write_source_reference(network_id, request, osm, artifact)
        registry.write(metadata)
    network = registry.network_path(metadata.network_id)
    presets = {
        item["id"]: item for item in load_presets(REPO_ROOT / "scenarios/presets")
    }
    archive_dir = REPO_ROOT / "demo/archives"
    archive_dir.mkdir(parents=True, exist_ok=True)
    build_root = Path(
        tempfile.mkdtemp(prefix="demo-build-", dir=settings.data_dir / "cache")
    )
    index: list[dict[str, str]] = []
    try:
        for preset_id, title in (
            ("baseline", "Baseline demo"),
            ("lead-emergency-braking", "Lead emergency-braking demo"),
        ):
            scenario = ScenarioConfig.model_validate(presets[preset_id]["scenario"])
            run_dir = build_root / preset_id
            execute_run(run_dir, network, scenario)
            filename = f"{preset_id}.zip"
            archive = create_run_archive(run_dir, archive_dir / filename)
            index.append(
                {
                    "id": preset_id,
                    "title": title,
                    "file": filename,
                    "sha256": file_checksum(archive),
                    "disclaimer": "Synthetic and uncalibrated; not for operational decisions.",
                }
            )
            print(f"Prepared {title}: {archive.name}")
    finally:
        shutil.rmtree(build_root, ignore_errors=True)
    (archive_dir / "index.json").write_text(
        json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
