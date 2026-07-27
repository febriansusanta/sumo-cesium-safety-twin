from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree

from pyproj import CRS, Transformer


@dataclass(frozen=True)
class NetworkLocation:
    net_offset: tuple[float, float]
    conv_boundary: tuple[float, float, float, float]
    orig_boundary: tuple[float, float, float, float]
    projection: str


def _numbers(value: str, expected: int) -> tuple[float, ...]:
    values = tuple(float(item) for item in value.split(","))
    if len(values) != expected:
        raise ValueError(f"expected {expected} comma-separated numbers")
    return values


def read_network_location(path: Path) -> NetworkLocation:
    root = ElementTree.parse(path).getroot()
    location = root.find("location")
    if location is None:
        raise ValueError("SUMO network contains no projection location metadata")
    projection = location.get("projParameter", "")
    if not projection or projection == "-":
        raise ValueError("SUMO network contains no usable projection definition")
    offset = _numbers(location.get("netOffset", "0,0"), 2)
    conv = _numbers(location.get("convBoundary", ""), 4)
    orig = _numbers(location.get("origBoundary", ""), 4)
    return NetworkLocation(
        net_offset=(offset[0], offset[1]),
        conv_boundary=(conv[0], conv[1], conv[2], conv[3]),
        orig_boundary=(orig[0], orig[1], orig[2], orig[3]),
        projection=projection,
    )


class CoordinateTransformer:
    def __init__(self, location: NetworkLocation) -> None:
        self.location = location
        projected = CRS.from_proj4(location.projection)
        self._to_geo = Transformer.from_crs(projected, CRS.from_epsg(4326), always_xy=True)
        self._to_local = Transformer.from_crs(CRS.from_epsg(4326), projected, always_xy=True)

    def to_wgs84(self, x: float, y: float) -> tuple[float, float]:
        projected_x = x - self.location.net_offset[0]
        projected_y = y - self.location.net_offset[1]
        longitude, latitude = self._to_geo.transform(projected_x, projected_y)
        return longitude, latitude

    def from_wgs84(self, longitude: float, latitude: float) -> tuple[float, float]:
        projected_x, projected_y = self._to_local.transform(longitude, latitude)
        return (
            projected_x + self.location.net_offset[0],
            projected_y + self.location.net_offset[1],
        )
