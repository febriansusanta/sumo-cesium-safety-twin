import { describe, expect, it } from "vitest";
import type { Trajectory } from "../src/api";
import { positionAt } from "../src/cesium/vehicles";

function fixtures(count: number): Trajectory[] {
  return Array.from({ length: count }, (_, vehicle) => ({
    vehicleId: `veh_${vehicle}`,
    samples: Array.from({ length: 20 }, (_, index) => ({
      t: index,
      longitude: 120.218 + index * 0.000001,
      latitude: 22.996 + vehicle * 0.0000001,
      height: 0,
      speed: 8,
      acceleration: 0,
      angle: 90,
      edgeId: "edge",
      laneId: "edge_0",
    })),
  }));
}

describe("vehicle interpolation performance", () => {
  for (const count of [100, 500, 1_000]) {
    it(`interpolates a frame containing ${count} vehicles`, () => {
      const trajectories = fixtures(count);
      const started = performance.now();
      const positions = trajectories.map((trajectory) => positionAt(trajectory, 10.5));
      const elapsed = performance.now() - started;
      console.info(`vehicle-frame ${count}: ${elapsed.toFixed(3)} ms`);
      expect(positions.every(Boolean)).toBe(true);
      expect(elapsed).toBeLessThan(1_000);
    });
  }
});
