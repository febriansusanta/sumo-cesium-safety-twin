import { describe, expect, it } from "vitest";
import { LOCATION_SEARCH_SUGGESTIONS } from "../src/ui/location-suggestions";

describe("LOCATION_SEARCH_SUGGESTIONS", () => {
  it("includes local study-area suggestions with unique queries", () => {
    const queries = LOCATION_SEARCH_SUGGESTIONS.map((item) => item.query);

    expect(LOCATION_SEARCH_SUGGESTIONS.map((item) => item.label)).toContain("Nanke");
    expect(new Set(queries).size).toBe(queries.length);
  });
});
