import { describe, expect, it } from "vitest";
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  MAPBOX_3D_BUILDINGS_BASEMAP_ID,
  basemapUsesMapboxBuildings,
} from "../src/cesium/viewer";

describe("basemap building mode", () => {
  it("keeps buildings off by default and enables them only for the Mapbox 3D option", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("nlsc");
    expect(basemapUsesMapboxBuildings(DEFAULT_BASEMAP_ID)).toBe(false);
    expect(BASEMAPS.some((basemap) => basemap.id === "nlsc-buildings")).toBe(false);
    expect(BASEMAPS.some((basemap) => basemap.id === MAPBOX_3D_BUILDINGS_BASEMAP_ID)).toBe(true);
    expect(basemapUsesMapboxBuildings(MAPBOX_3D_BUILDINGS_BASEMAP_ID)).toBe(true);
  });
});
