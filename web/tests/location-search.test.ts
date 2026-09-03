import { describe, expect, it } from "vitest";
import {
  locationPrimaryLabel,
  locationSecondaryLabel,
  shouldSearchAutocomplete,
} from "../src/ui/location-search";
import type { LocationSearchResult } from "../src/api";

const result: LocationSearchResult = {
  placeId: "123",
  displayName: "Universitas Gadjah Mada, Caturtunggal, Sleman, Daerah Istimewa Yogyakarta, Indonesia",
  longitude: 110.377,
  latitude: -7.771,
  bbox: {
    west: 110.373,
    south: -7.775,
    east: 110.381,
    north: -7.767,
  },
  bboxAdjusted: true,
  bboxAreaKm2: 0.64,
  category: "amenity",
  type: "university",
  osmType: "relation",
  osmId: "456",
  source: "Nominatim/OpenStreetMap",
};

describe("location autocomplete helpers", () => {
  it("starts autocomplete after a short meaningful query", () => {
    expect(shouldSearchAutocomplete("U")).toBe(false);
    expect(shouldSearchAutocomplete("UG")).toBe(true);
    expect(shouldSearchAutocomplete("UGM")).toBe(true);
  });

  it("formats primary and secondary suggestion labels", () => {
    expect(locationPrimaryLabel(result)).toBe("Universitas Gadjah Mada");
    expect(locationSecondaryLabel(result)).toContain("Caturtunggal");
    expect(locationSecondaryLabel(result)).toContain("safe AOI");
  });
});
