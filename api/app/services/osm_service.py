from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.config import Settings
from app.models.scenario import LocationConfig

from .checksum_service import file_checksum, object_checksum


class OsmDownloadError(RuntimeError):
    pass


@dataclass(frozen=True)
class OsmArtifact:
    path: Path
    checksum: str
    cache_hit: bool
    bytes_downloaded: int


def _cache_key(settings: Settings, location: LocationConfig) -> str:
    return object_checksum(
        {
            "source": settings.osm_url,
            "location": location.model_dump(mode="json", by_alias=True),
        }
    )


def download_osm(
    settings: Settings,
    *,
    location: LocationConfig | None = None,
    destination_dir: Path | None = None,
    filename_stem: str | None = None,
    force: bool = False,
    transport: httpx.BaseTransport | None = None,
) -> OsmArtifact:
    location = location or settings.location
    raw_dir = destination_dir or settings.data_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(settings, location)
    stem = filename_stem or f"{location.name}-{key[:12]}"
    path = raw_dir / f"{stem}.osm.xml"
    metadata_path = path.with_suffix(".metadata.json")
    if path.is_file() and metadata_path.is_file() and not force:
        return OsmArtifact(path, file_checksum(path), True, path.stat().st_size)

    bbox = location.bbox
    params = {"bbox": f"{bbox.west},{bbox.south},{bbox.east},{bbox.north}"}
    headers = {"User-Agent": "sumo-cesium-safety-twin/0.1 (+local research prototype)"}
    last_error = "unknown error"
    for attempt in range(3):
        try:
            with (
                httpx.Client(transport=transport, timeout=60, follow_redirects=True) as client,
                client.stream("GET", settings.osm_url, params=params, headers=headers) as response,
            ):
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > settings.limits.max_download_bytes:
                        raise OsmDownloadError("OSM response exceeded configured size guard")
            if b"<osm" not in content[:500]:
                raise OsmDownloadError("OSM endpoint returned an unexpected document")
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(content)
            temporary.replace(path)
            checksum = file_checksum(path)
            metadata_path.write_text(
                json.dumps(
                    {
                        "bbox": bbox.model_dump(by_alias=True),
                        "cacheKey": key,
                        "checksum": checksum,
                        "source": settings.osm_url,
                        "attribution": "OpenStreetMap contributors, ODbL 1.0",
                        "bytes": len(content),
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            return OsmArtifact(path, checksum, False, len(content))
        except (httpx.HTTPError, OSError, OsmDownloadError) as error:
            last_error = str(error)
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    raise OsmDownloadError(f"OSM download failed after 3 attempts: {last_error}")
