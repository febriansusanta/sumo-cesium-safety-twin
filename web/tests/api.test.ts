import { describe, expect, it, vi } from "vitest";
import { fetchHealth, fetchNetwork, fetchTrajectories } from "../src/api";

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
