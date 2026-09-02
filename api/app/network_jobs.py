from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime, timezone

from app.config import Settings
from app.models.network import DrivingSide, NetworkBuildRequest, NetworkMetadata, NetworkStatus
from app.services.network_registry_service import NetworkRegistry
from app.services.network_service import build_network
from app.services.osm_service import download_osm

UTC = timezone.utc  # noqa: UP017


class NetworkBuildConflictError(RuntimeError):
    pass


class NetworkBuildManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.registry = NetworkRegistry(settings)
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None
        self._active: str | None = None

    async def start(self) -> None:
        for record in self.registry.list():
            if record.status in {
                NetworkStatus.QUEUED,
                NetworkStatus.DOWNLOADING,
                NetworkStatus.BUILDING,
            }:
                record.status = NetworkStatus.FAILED
                record.message = (
                    "Network build was interrupted by an API restart; submit it again."
                )
                self.registry.write(record)
        self._worker = asyncio.create_task(self._work())

    async def stop(self) -> None:
        if self._worker is None:
            return
        self._worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._worker

    def create(self, request: NetworkBuildRequest) -> NetworkMetadata:
        network_id = self.registry.network_id_for(request)
        existing = self.registry.get(network_id)
        if (
            existing is not None
            and existing.status == NetworkStatus.READY
            and not request.force_refresh
        ):
            existing.cache_hit = True
            existing.message = "Ready network reused from the AOI cache."
            self.registry.write(existing)
            return existing
        if (
            existing is not None
            and existing.status
            in {NetworkStatus.QUEUED, NetworkStatus.DOWNLOADING, NetworkStatus.BUILDING}
            and not request.force_refresh
        ):
            return existing

        metadata = NetworkMetadata(
            network_id=network_id,
            name=request.name,
            bbox=request.bbox,
            driving_side=request.driving_side,
            status=NetworkStatus.QUEUED,
            source=self.settings.osm_url,
            message="Network build queued.",
        )
        self.registry.write_request(network_id, request)
        self.registry.write(metadata)
        self.queue.put_nowait(network_id)
        return metadata

    def get(self, network_id: str) -> NetworkMetadata | None:
        return self.registry.get(network_id)

    def list(self) -> list[NetworkMetadata]:
        return self.registry.list()

    def delete(self, network_id: str) -> bool:
        if network_id == self._active:
            raise NetworkBuildConflictError("an active network build cannot be deleted")
        return self.registry.delete(network_id)

    async def _work(self) -> None:
        while True:
            network_id = await self.queue.get()
            record = self.registry.get(network_id)
            request: NetworkBuildRequest | None = None
            try:
                if record is None:
                    continue
                self._active = network_id
                request = self.registry.read_request(network_id)
                location = self.registry.location_for(request)
                directory = self.registry.network_path(network_id).parent

                record.status = NetworkStatus.DOWNLOADING
                record.message = "Downloading OSM source for the selected AOI."
                record.updated_at = datetime.now(UTC)
                self.registry.write(record)
                osm = await asyncio.to_thread(
                    download_osm,
                    self.settings,
                    location=location,
                    destination_dir=directory,
                    filename_stem="source",
                    force=request.force_refresh,
                )

                record.status = NetworkStatus.BUILDING
                record.osm_checksum = osm.checksum
                record.message = "Converting OSM roads into a SUMO network."
                record.updated_at = datetime.now(UTC)
                self.registry.write(record)
                artifact = await asyncio.to_thread(
                    build_network,
                    self.settings,
                    osm.path,
                    location=location,
                    destination_dir=directory,
                    output_stem="network",
                    driving_side=request.driving_side,
                    force=request.force_refresh,
                )

                completed = self.registry.metadata_from_artifacts(
                    network_id, request, osm, artifact
                )
                self.registry.write_source_reference(network_id, request, osm, artifact)
                self.registry.write(completed)
            except Exception as error:
                failed = record or NetworkMetadata(
                    network_id=network_id,
                    name=network_id,
                    bbox=self.settings.location.bbox,
                    driving_side=request.driving_side if request else DrivingSide.RIGHT,
                    status=NetworkStatus.FAILED,
                )
                failed.status = NetworkStatus.FAILED
                failed.message = str(error)
                self.registry.write(failed)
            finally:
                self._active = None
                self.queue.task_done()
