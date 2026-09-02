from __future__ import annotations

import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models.network import (
    DrivingSide,
    NetworkBuildRequest,
    NetworkMetadata,
    NetworkStatus,
)
from app.models.scenario import LocationConfig

from .checksum_service import file_checksum, object_checksum
from .network_service import (
    NetworkArtifact,
    export_geojson,
    latest_geojson,
    latest_network,
    validate_network,
)
from .osm_service import OsmArtifact

UTC = timezone.utc  # noqa: UP017
LEGACY_NETWORK_ID = "legacy-latest"


class NetworkRegistryError(RuntimeError):
    pass


def _slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug[:80].strip("-") or "custom-aoi"


class NetworkRegistry:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.data_dir / "networks"
        self.root.mkdir(parents=True, exist_ok=True)

    def _directory(self, network_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,159}", network_id):
            raise NetworkRegistryError(f"invalid network id: {network_id}")
        path = (self.root / network_id).resolve()
        try:
            path.relative_to(self.root.resolve())
        except ValueError as error:
            raise NetworkRegistryError("network id resolves outside the registry") from error
        return path

    def metadata_path(self, network_id: str) -> Path:
        return self._directory(network_id) / "network.metadata.json"

    def request_path(self, network_id: str) -> Path:
        return self._directory(network_id) / "source-request.json"

    def source_reference_path(self, network_id: str) -> Path:
        return self._directory(network_id) / "source-reference.json"

    def network_path(self, network_id: str) -> Path:
        return self._directory(network_id) / "network.net.xml"

    def geojson_path(self, network_id: str) -> Path:
        return self._directory(network_id) / "network.geojson"

    def validate_request(self, request: NetworkBuildRequest) -> None:
        bbox = request.bbox
        area = bbox.approximate_area_km2()
        if area > self.settings.limits.max_bbox_area_km2:
            raise NetworkRegistryError(
                f"AOI area {area:.3f} km2 exceeds max_bbox_area_km2 "
                f"({self.settings.limits.max_bbox_area_km2})"
            )
        span = max(bbox.east - bbox.west, bbox.north - bbox.south)
        if span > self.settings.limits.max_bbox_span_degrees:
            raise NetworkRegistryError(
                f"AOI span {span:.6f} degrees exceeds max_bbox_span_degrees "
                f"({self.settings.limits.max_bbox_span_degrees})"
            )

    def network_id_for(self, request: NetworkBuildRequest) -> str:
        self.validate_request(request)
        payload = {
            "bbox": request.bbox.model_dump(mode="json", by_alias=True),
            "drivingSide": request.driving_side.value,
            "osmUrl": self.settings.osm_url,
            "networkPipelineVersion": 1,
        }
        return f"net-{object_checksum(payload)[:16]}"

    def location_for(self, request: NetworkBuildRequest) -> LocationConfig:
        return LocationConfig(name=_slug(request.name), bbox=request.bbox)

    def write_request(self, network_id: str, request: NetworkBuildRequest) -> None:
        directory = self._directory(network_id)
        directory.mkdir(parents=True, exist_ok=True)
        self.request_path(network_id).write_text(
            request.model_dump_json(by_alias=True, indent=2) + "\n",
            encoding="utf-8",
        )

    def read_request(self, network_id: str) -> NetworkBuildRequest:
        path = self.request_path(network_id)
        if not path.is_file():
            raise NetworkRegistryError(f"network request is missing for {network_id}")
        return NetworkBuildRequest.model_validate_json(path.read_text(encoding="utf-8"))

    def write(self, metadata: NetworkMetadata) -> None:
        metadata.updated_at = datetime.now(UTC)
        directory = self._directory(metadata.network_id)
        directory.mkdir(parents=True, exist_ok=True)
        temporary = self.metadata_path(metadata.network_id).with_suffix(".tmp")
        temporary.write_text(
            metadata.model_dump_json(by_alias=True, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(self.metadata_path(metadata.network_id))

    def get(self, network_id: str) -> NetworkMetadata | None:
        path = self.metadata_path(network_id)
        if not path.is_file():
            return None
        return NetworkMetadata.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self) -> list[NetworkMetadata]:
        records: list[NetworkMetadata] = []
        for path in self.root.glob("*/network.metadata.json"):
            try:
                records.append(NetworkMetadata.model_validate_json(path.read_text(encoding="utf-8")))
            except Exception:
                continue
        return sorted(records, key=lambda record: record.updated_at, reverse=True)

    def latest_ready(self) -> NetworkMetadata | None:
        ready = [
            record
            for record in self.list()
            if record.status == NetworkStatus.READY
            and self.network_path(record.network_id).is_file()
        ]
        return ready[0] if ready else None

    def delete(self, network_id: str) -> bool:
        record = self.get(network_id)
        if record is None:
            return False
        shutil.rmtree(self._directory(network_id))
        return True

    def metadata_from_artifacts(
        self,
        network_id: str,
        request: NetworkBuildRequest,
        osm: OsmArtifact,
        artifact: NetworkArtifact,
    ) -> NetworkMetadata:
        payload: dict[str, Any] = {}
        if artifact.metadata_path.is_file():
            payload = json.loads(artifact.metadata_path.read_text(encoding="utf-8"))
        return NetworkMetadata(
            network_id=network_id,
            name=request.name,
            bbox=request.bbox,
            driving_side=request.driving_side,
            status=NetworkStatus.READY,
            source=self.settings.osm_url,
            osm_checksum=osm.checksum,
            network_checksum=file_checksum(artifact.network_path),
            geojson_checksum=file_checksum(artifact.geojson_path),
            sumo_version=payload.get("sumoVersion"),
            edge_count=artifact.edge_count,
            lane_count=artifact.lane_count,
            junction_count=artifact.junction_count,
            cache_hit=osm.cache_hit and artifact.cache_hit,
            message="Network ready.",
            warnings=list(payload.get("warnings", [])),
        )

    def write_source_reference(
        self,
        network_id: str,
        request: NetworkBuildRequest,
        osm: OsmArtifact,
        artifact: NetworkArtifact,
    ) -> None:
        payload = {
            "request": request.model_dump(mode="json", by_alias=True),
            "osm": {
                "checksum": osm.checksum,
                "bytes": osm.bytes_downloaded,
                "cacheHit": osm.cache_hit,
            },
            "network": {
                "checksum": file_checksum(artifact.network_path),
                "geojsonChecksum": file_checksum(artifact.geojson_path),
                "cacheHit": artifact.cache_hit,
                "edges": artifact.edge_count,
                "lanes": artifact.lane_count,
                "junctions": artifact.junction_count,
            },
        }
        self.source_reference_path(network_id).write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def register_legacy_latest(self) -> NetworkMetadata | None:
        legacy_network = latest_network(self.settings)
        if legacy_network is None or not legacy_network.is_file():
            return None
        directory = self._directory(LEGACY_NETWORK_ID)
        directory.mkdir(parents=True, exist_ok=True)
        destination_network = self.network_path(LEGACY_NETWORK_ID)
        destination_geojson = self.geojson_path(LEGACY_NETWORK_ID)
        source_geojson = latest_geojson(self.settings)
        network_checksum = file_checksum(legacy_network)
        existing = self.get(LEGACY_NETWORK_ID)
        if (
            existing is not None
            and existing.status == NetworkStatus.READY
            and destination_network.is_file()
            and existing.network_checksum == network_checksum
        ):
            return existing
        shutil.copyfile(legacy_network, destination_network)
        if source_geojson is not None and source_geojson.is_file():
            shutil.copyfile(source_geojson, destination_geojson)
        else:
            export_geojson(destination_network, destination_geojson)
        try:
            stats = validate_network(destination_network)
            warnings: list[str] = []
        except Exception as error:
            stats = {"edges": 0, "lanes": 0, "junctions": 0}
            warnings = [f"Legacy network validation warning: {error}"]
        metadata = NetworkMetadata(
            network_id=LEGACY_NETWORK_ID,
            name=self.settings.location.name,
            bbox=self.settings.location.bbox,
            driving_side=DrivingSide.RIGHT,
            status=NetworkStatus.READY,
            source="legacy data/network cache",
            network_checksum=network_checksum,
            geojson_checksum=file_checksum(destination_geojson),
            edge_count=stats["edges"],
            lane_count=stats["lanes"],
            junction_count=stats["junctions"],
            cache_hit=True,
            message="Registered from the existing data/network cache.",
            warnings=warnings,
        )
        self.write(metadata)
        return metadata
