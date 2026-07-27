from __future__ import annotations

from app.config import get_settings
from app.services.network_service import build_network
from app.services.osm_service import download_osm


def main() -> int:
    settings = get_settings()
    osm = download_osm(settings)
    print(build_network(settings, osm.path).network_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
