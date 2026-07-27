from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
import shutil
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from app.config import Settings
from app.models.run import RunMetadata, RunStatus
from app.models.scenario import ScenarioConfig
from app.services.network_service import latest_network
from app.services.simulation_service import execute_run

Runner = Callable[[Path, Path, ScenarioConfig], object]
UTC = timezone.utc  # noqa: UP017


class RunConflictError(RuntimeError):
    pass


class RunManager:
    def __init__(self, settings: Settings, runner: Runner = execute_run) -> None:
        self.runs_dir = settings.data_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.network = latest_network(settings)
        self.runner = runner
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None
        self._active: str | None = None

    def _path(self, run_id: str) -> Path:
        return self.runs_dir / run_id

    def _metadata_path(self, run_id: str) -> Path:
        return self._path(run_id) / "run.json"

    def _write(self, metadata: RunMetadata) -> None:
        metadata.updated_at = datetime.now(UTC)
        path = self._metadata_path(metadata.run_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(
            metadata.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8"
        )
        temporary.replace(path)

    def get(self, run_id: str) -> RunMetadata | None:
        path = self._metadata_path(run_id)
        if not path.is_file():
            return None
        return RunMetadata.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self) -> list[RunMetadata]:
        records = [
            record
            for path in self.runs_dir.iterdir()
            if path.is_dir() and (record := self.get(path.name)) is not None
        ]
        return sorted(records, key=lambda record: record.created_at, reverse=True)

    async def start(self) -> None:
        for record in self.list():
            if record.status in {
                RunStatus.QUEUED,
                RunStatus.PREPARING,
                RunStatus.RUNNING,
                RunStatus.PROCESSING,
            }:
                record.status = RunStatus.FAILED
                record.message = (
                    "Run was interrupted by an API restart; submit it again to recover."
                )
                self._write(record)
        self._worker = asyncio.create_task(self._work())

    async def stop(self) -> None:
        if self._worker is None:
            return
        self._worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._worker

    def create(self, scenario: ScenarioConfig) -> RunMetadata:
        now = datetime.now(UTC)
        run_id = f"{now:%Y%m%dT%H%M%SZ}-{secrets.token_hex(3)}"
        metadata = RunMetadata(
            run_id=run_id,
            status=RunStatus.QUEUED,
            scenario=scenario,
            scenario_checksum=scenario.checksum(),
        )
        self._write(metadata)
        self.queue.put_nowait(run_id)
        return metadata

    def delete(self, run_id: str) -> bool:
        record = self.get(run_id)
        if record is None:
            return False
        if run_id == self._active or record.status in {
            RunStatus.PREPARING,
            RunStatus.RUNNING,
            RunStatus.PROCESSING,
        }:
            raise RunConflictError("an active run cannot be deleted")
        shutil.rmtree(self._path(run_id))
        return True

    async def _work(self) -> None:
        while True:
            run_id = await self.queue.get()
            record = self.get(run_id)
            if record is None:
                self.queue.task_done()
                continue
            self._active = run_id
            try:
                if self.network is None or not self.network.is_file():
                    raise RuntimeError("network has not been prepared")
                record.status = RunStatus.PREPARING
                record.message = None
                self._write(record)
                record.status = RunStatus.RUNNING
                self._write(record)
                await asyncio.to_thread(
                    self.runner, self._path(run_id), self.network, record.scenario
                )
                record.status = RunStatus.PROCESSING
                self._write(record)
                if not (self._path(run_id) / "summary.json").is_file():
                    raise RuntimeError("simulation produced no summary")
                record.status = RunStatus.COMPLETED
                self._write(record)
            except Exception as error:
                record.status = RunStatus.FAILED
                record.message = str(error)
                self._write(record)
            finally:
                self._active = None
                self.queue.task_done()


def load_summary(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
