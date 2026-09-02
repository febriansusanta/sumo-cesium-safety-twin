import { describe, expect, it } from "vitest";
import { BASEMAPS, DEFAULT_BASEMAP_ID, basemapShowsBuildings } from "../src/cesium/viewer";

describe("basemap building mode", () => {
  it("keeps buildings off by default and enables them only for the 3D option", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("nlsc");
    expect(basemapShowsBuildings(DEFAULT_BASEMAP_ID)).toBe(false);
    expect(BASEMAPS.some((basemap) => basemap.id === "nlsc-buildings")).toBe(true);
    expect(basemapShowsBuildings("nlsc-buildings")).toBe(true);
  });
});
