import { describe, expect, it, vi } from "vitest";
import {
  fetchHealth,
  fetchNetwork,
  fetchPointOverlays,
  fetchTrajectories,
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
