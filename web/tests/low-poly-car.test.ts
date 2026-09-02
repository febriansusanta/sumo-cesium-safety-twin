import { describe, expect, it } from "vitest";
import { lowPolyCarModelUri } from "../src/cesium/low-poly-car";

describe("low-poly car model", () => {
  it("generates a self-contained glTF data URI", () => {
    const uri = lowPolyCarModelUri();
    expect(uri).toMatch(/^data:model\/gltf\+json;base64,/);

    const payload = uri.split(",", 2)[1];
    expect(payload).toBeDefined();
    const gltf = JSON.parse(Buffer.from(payload!, "base64").toString("utf8")) as {
      extensionsUsed?: string[];
      buffers?: Array<{ uri?: string }>;
      meshes?: Array<{ primitives?: unknown[] }>;
      materials?: unknown[];
    };

    expect(gltf.extensionsUsed).toContain("KHR_materials_unlit");
    expect(gltf.buffers?.[0]?.uri).toMatch(/^data:application\/octet-stream;base64,/);
    expect(gltf.meshes?.[0]?.primitives?.length).toBeGreaterThan(3);
    expect(gltf.materials?.length).toBeGreaterThanOrEqual(5);
  });
});
