from pathlib import Path

import httpx

from app.config import get_settings
from app.services.osm_service import download_osm


def test_download_is_cached(tmp_path: Path) -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=b'<?xml version="1.0"?><osm version="0.6"></osm>')

    settings = get_settings().model_copy(update={"data_dir": tmp_path})
    transport = httpx.MockTransport(handler)
    first = download_osm(settings, transport=transport)
    second = download_osm(settings, transport=transport)
    assert first.cache_hit is False
    assert second.cache_hit is True
    assert calls == 1
    assert first.checksum == second.checksum
