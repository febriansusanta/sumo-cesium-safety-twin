import { describe, expect, it, vi } from "vitest";
import {
  createNetwork,
  createRun,
  fetchHealth,
  fetchNetwork,
  fetchPointOverlays,
  fetchTrajectories,
  searchLocations,
} from "../src/api";

describe("fetchHealth", () => {
  it("validates a healthy response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", service: "api", version: "0.1.0" }), {
        status: 200,
      }),
    );
    await expect(fetchHealth(fetcher)).resolves.toMatchObject({ status: "ok" });
  });

  it("rejects malformed external data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "maybe" }), { status: 200 }),
    );
    await expect(fetchHealth(fetcher)).rejects.toThrow();
  });
});

describe("fetchNetwork", () => {
  it("accepts a GeoJSON feature collection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 }),
    );
    await expect(fetchNetwork(fetcher)).resolves.toMatchObject({ type: "FeatureCollection" });
  });

  it("falls back to exported static data when the backend is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const fallbackFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "/api/network") return new Response("missing", { status: 404 });
      if (url === "/static-data/network.geojson") {
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = fallbackFetch;
    try {
      await expect(fetchNetwork()).resolves.toMatchObject({ type: "FeatureCollection" });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fallbackFetch).toHaveBeenNthCalledWith(2, "/static-data/network.geojson");
  });
});

describe("network build and run submission", () => {
  it("submits an explicit AOI network build request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          networkId: "net-test",
          name: "test-aoi",
          bbox: { west: 120.1, south: 22.9, east: 120.11, north: 22.91 },
          drivingSide: "left",
          status: "queued",
          createdAt: "2026-09-02T00:00:00Z",
          updatedAt: "2026-09-02T00:00:00Z",
          source: "OpenStreetMap",
          osmChecksum: null,
          networkChecksum: null,
          geojsonChecksum: null,
          sumoVersion: null,
          edgeCount: 0,
          laneCount: 0,
          junctionCount: 0,
          cacheHit: false,
          message: "queued",
          warnings: [],
        }),
        { status: 202 },
      ),
    );
    await expect(
      createNetwork(
        {
          name: "test-aoi",
          bbox: { west: 120.1, south: 22.9, east: 120.11, north: 22.91 },
          drivingSide: "left",
        },
        fetcher,
      ),
    ).resolves.toMatchObject({ networkId: "net-test", drivingSide: "left" });
  });

  it("wraps generated run requests with the selected network id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          runId: "run-1",
          status: "queued",
          scenario: { name: "Baseline", duration: 30 },
          scenarioChecksum: "abc",
          networkId: "net-test",
          networkName: "test-aoi",
          networkChecksum: "def",
          networkBbox: { west: 120.1, south: 22.9, east: 120.11, north: 22.91 },
          drivingSide: "right",
          createdAt: "2026-09-02T00:00:00Z",
          updatedAt: "2026-09-02T00:00:00Z",
          message: null,
        }),
        { status: 202 },
      ),
    );
    await createRun({ duration: 30 }, "net-test", fetcher);
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      networkId: "net-test",
      scenario: { duration: 30 },
    });
  });
});

describe("fetchPointOverlays", () => {
  it("accepts local point overlay GeoJSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          metadata: { counts: { real: 1, sumo: 1 } },
          features: [
            {
              type: "Feature",
              properties: { featureType: "pointOverlay", overlayKind: "sumo" },
              geometry: { type: "Point", coordinates: [120.2, 23.1] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(fetchPointOverlays(fetcher)).resolves.toMatchObject({
      type: "FeatureCollection",
    });
  });
});

describe("searchLocations", () => {
  it("accepts location search results with a buildable bbox", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            placeId: "1",
            displayName: "Nanke, Tainan, Taiwan",
            longitude: 120.294,
            latitude: 23.106,
            bbox: { west: 120.2939, south: 23.1055, east: 120.2955, north: 23.1067 },
            bboxAdjusted: false,
            bboxAreaKm2: 0.03,
            category: "place",
            type: "industrial",
            osmType: "relation",
            osmId: "456",
            source: "Nominatim/OpenStreetMap",
          },
        ]),
        { status: 200 },
      ),
    );
    await expect(searchLocations("Nanke", fetcher)).resolves.toMatchObject([
      { displayName: "Nanke, Tainan, Taiwan", bboxAdjusted: false },
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/locations/search?q=Nanke&limit=5");
  });
});

describe("fetchTrajectories", () => {
  it("validates compact client trajectory data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            vehicleId: "veh_1",
            samples: [
              {
                t: 0,
                longitude: 120.2,
                latitude: 22.9,
                height: 0,
                speed: 8,
                acceleration: 0,
                angle: 90,
                edgeId: "edge",
                laneId: "edge_0",
              },
            ],
          },
        ]),
        { status: 200 },
      ),
    );
    await expect(fetchTrajectories("run-1", fetcher)).resolves.toHaveLength(1);
  });
});
