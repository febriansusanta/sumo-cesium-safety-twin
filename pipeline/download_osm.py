from __future__ import annotations

from app.config import get_settings
from app.services.osm_service import download_osm


def main() -> int:
    artifact = download_osm(get_settings())
    print(artifact.path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
