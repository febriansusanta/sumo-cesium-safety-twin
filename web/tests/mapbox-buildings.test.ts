import { describe, expect, it } from "vitest";
import {
  buildMapboxBuildingTileUrl,
  buildingHeightsFromProperties,
  tileCoverageForBounds,
} from "../src/cesium/mapbox-buildings";

describe("Mapbox building utilities", () => {
  it("builds a Mapbox Streets vector tile URL with an encoded token", () => {
    const url = buildMapboxBuildingTileUrl({ z: 16, x: 54669, y: 28612 }, "token with space");
    expect(url).toContain("/v4/mapbox.mapbox-streets-v8/16/54669/28612.vector.pbf");
    expect(url).toContain("access_token=token%20with%20space");
  });

  it("keeps small network bounds at detailed building-tile zoom", () => {
    const tiles = tileCoverageForBounds({
      west: 120.294,
      south: 23.105,
      east: 120.296,
      north: 23.107,
    });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => tile.z === 16)).toBe(true);
  });

  it("uses Mapbox height attributes with sensible limits", () => {
    expect(
      buildingHeightsFromProperties({ height: "24m", min_height: 6 }),
    ).toEqual({ baseHeight: 6, extrudedHeight: 24 });
    expect(buildingHeightsFromProperties({ height: 1 })).toEqual({
      baseHeight: 0,
      extrudedHeight: 3,
    });
  });
});
