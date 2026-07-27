from __future__ import annotations

import shutil
import zipfile
from pathlib import Path, PurePosixPath


class ArchiveError(RuntimeError):
    pass


def create_run_archive(run_dir: Path, destination: Path) -> Path:
    if not run_dir.is_dir():
        raise ArchiveError("run directory does not exist")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    with zipfile.ZipFile(
        temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for path in sorted(run_dir.iterdir(), key=lambda item: item.name):
            if not path.is_file() or path.is_symlink():
                continue
            info = zipfile.ZipInfo(path.name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)
    temporary.replace(destination)
    return destination


def import_run_archive(source: Path, destination: Path, max_bytes: int = 100 * 1024 * 1024) -> None:
    if not source.is_file():
        raise ArchiveError("archive does not exist")
    if destination.exists():
        raise ArchiveError("destination run already exists")
    destination.mkdir(parents=True)
    total = 0
    try:
        with zipfile.ZipFile(source) as archive:
            for member in archive.infolist():
                name = PurePosixPath(member.filename)
                if member.is_dir():
                    continue
                if name.is_absolute() or ".." in name.parts or len(name.parts) != 1:
                    raise ArchiveError(f"unsafe archive member: {member.filename}")
                total += member.file_size
                if total > max_bytes:
                    raise ArchiveError("archive exceeds the uncompressed size limit")
                target = destination / name.name
                with archive.open(member) as source_file, target.open("wb") as target_file:
                    shutil.copyfileobj(source_file, target_file)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise
    for required in ("effective-scenario.json", "summary.json", "manifest.json"):
        if not (destination / required).is_file():
            shutil.rmtree(destination, ignore_errors=True)
            raise ArchiveError(f"archive is missing {required}")
