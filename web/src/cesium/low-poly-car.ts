interface MeshPart {
  material: number;
  positions: number[];
  indices: number[];
}

interface AccessorRange {
  min: [number, number, number];
  max: [number, number, number];
}

const ARRAY_BUFFER_TARGET = 34_962;
const ELEMENT_ARRAY_BUFFER_TARGET = 34_963;
const FLOAT_COMPONENT = 5_126;
const UNSIGNED_SHORT_COMPONENT = 5_123;
const TRIANGLES_MODE = 4;

let cachedModelUri: string | undefined;

export function lowPolyCarModelUri(): string {
  cachedModelUri ??= buildLowPolyCarModelUri();
  return cachedModelUri;
}

function buildLowPolyCarModelUri(): string {
  const parts = carParts();
  const bufferViews: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const primitives: Array<Record<string, unknown>> = [];
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;

  function append(bytes: Uint8Array, target: number): number {
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding > 0) {
      chunks.push(new Uint8Array(padding));
      byteOffset += padding;
    }
    const start = byteOffset;
    chunks.push(bytes);
    byteOffset += bytes.byteLength;
    bufferViews.push({
      buffer: 0,
      byteOffset: start,
      byteLength: bytes.byteLength,
      target,
    });
    return bufferViews.length - 1;
  }

  for (const part of parts) {
    const positionBytes = float32Bytes(part.positions);
    const positionView = append(positionBytes, ARRAY_BUFFER_TARGET);
    const positionRange = accessorRange(part.positions);
    const positionAccessor = accessors.push({
      bufferView: positionView,
      componentType: FLOAT_COMPONENT,
      count: part.positions.length / 3,
      type: "VEC3",
      min: positionRange.min,
      max: positionRange.max,
    }) - 1;

    const indexBytes = uint16Bytes(part.indices);
    const indexView = append(indexBytes, ELEMENT_ARRAY_BUFFER_TARGET);
    const indexAccessor = accessors.push({
      bufferView: indexView,
      componentType: UNSIGNED_SHORT_COMPONENT,
      count: part.indices.length,
      type: "SCALAR",
    }) - 1;

    primitives.push({
      attributes: { POSITION: positionAccessor },
      indices: indexAccessor,
      material: part.material,
      mode: TRIANGLES_MODE,
    });
  }

  const finalPadding = (4 - (byteOffset % 4)) % 4;
  if (finalPadding > 0) {
    chunks.push(new Uint8Array(finalPadding));
    byteOffset += finalPadding;
  }

  const binary = concatBytes(chunks, byteOffset);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "SUMO-Cesium Safety Twin low-poly car generator",
    },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "low-poly-car", mesh: 0 }],
    meshes: [{ name: "low-poly-car", primitives }],
    materials: [
      material("cyan paint", [0.07, 0.68, 0.82, 1]),
      material("paint shadow", [0.04, 0.36, 0.48, 1]),
      material("glass", [0.06, 0.18, 0.25, 1]),
      material("tires", [0.02, 0.03, 0.04, 1]),
      material("lights", [1, 0.94, 0.62, 1]),
    ],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${bytesToBase64(binary)}`,
        byteLength: binary.byteLength,
      },
    ],
    bufferViews,
    accessors,
  };
  return `data:model/gltf+json;base64,${bytesToBase64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function carParts(): MeshPart[] {
  const paint = part(0);
  addBox(paint, -0.9, 0.9, 0.14, 0.68, -2.2, 2.18);
  addBox(paint, -0.68, 0.68, 0.7, 0.86, 0.45, 2.05);

  const shadowPaint = part(1);
  addBox(shadowPaint, -0.7, 0.7, 0.69, 0.82, -2.05, -1.08);
  addBox(shadowPaint, -0.78, 0.78, 0.58, 0.72, 2.0, 2.28);

  const glass = part(2);
  addCabin(glass, -0.62, 0.62, -0.75, 0.72, 0.68, 1.34, 0.38, 0.48);

  const tires = part(3);
  for (const z of [-1.35, 1.35]) {
    addBox(tires, -1.08, -0.76, 0.02, 0.45, z - 0.34, z + 0.34);
    addBox(tires, 0.76, 1.08, 0.02, 0.45, z - 0.34, z + 0.34);
  }

  const lights = part(4);
  addBox(lights, -0.48, -0.18, 0.35, 0.55, 2.21, 2.34);
  addBox(lights, 0.18, 0.48, 0.35, 0.55, 2.21, 2.34);

  return [paint, shadowPaint, glass, tires, lights];
}

function part(material: number): MeshPart {
  return { material, positions: [], indices: [] };
}

function material(name: string, baseColorFactor: [number, number, number, number]): Record<string, unknown> {
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor,
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
    extensions: { KHR_materials_unlit: {} },
  };
}

function addBox(
  mesh: MeshPart,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): void {
  const p000: [number, number, number] = [minX, minY, minZ];
  const p001: [number, number, number] = [minX, minY, maxZ];
  const p010: [number, number, number] = [minX, maxY, minZ];
  const p011: [number, number, number] = [minX, maxY, maxZ];
  const p100: [number, number, number] = [maxX, minY, minZ];
  const p101: [number, number, number] = [maxX, minY, maxZ];
  const p110: [number, number, number] = [maxX, maxY, minZ];
  const p111: [number, number, number] = [maxX, maxY, maxZ];

  addQuad(mesh, p001, p101, p111, p011);
  addQuad(mesh, p100, p000, p010, p110);
  addQuad(mesh, p000, p001, p011, p010);
  addQuad(mesh, p101, p100, p110, p111);
  addQuad(mesh, p010, p011, p111, p110);
  addQuad(mesh, p000, p100, p101, p001);
}

function addCabin(
  mesh: MeshPart,
  bottomMinX: number,
  bottomMaxX: number,
  minZ: number,
  maxZ: number,
  bottomY: number,
  topY: number,
  topHalfWidth: number,
  topInsetZ: number,
): void {
  const bottomFrontLeft: [number, number, number] = [bottomMinX, bottomY, maxZ];
  const bottomFrontRight: [number, number, number] = [bottomMaxX, bottomY, maxZ];
  const bottomRearLeft: [number, number, number] = [bottomMinX, bottomY, minZ];
  const bottomRearRight: [number, number, number] = [bottomMaxX, bottomY, minZ];
  const topFrontLeft: [number, number, number] = [-topHalfWidth, topY, maxZ - topInsetZ];
  const topFrontRight: [number, number, number] = [topHalfWidth, topY, maxZ - topInsetZ];
  const topRearLeft: [number, number, number] = [-topHalfWidth, topY, minZ + topInsetZ];
  const topRearRight: [number, number, number] = [topHalfWidth, topY, minZ + topInsetZ];

  addQuad(mesh, bottomFrontLeft, bottomFrontRight, topFrontRight, topFrontLeft);
  addQuad(mesh, bottomRearRight, bottomRearLeft, topRearLeft, topRearRight);
  addQuad(mesh, bottomRearLeft, bottomFrontLeft, topFrontLeft, topRearLeft);
  addQuad(mesh, bottomFrontRight, bottomRearRight, topRearRight, topFrontRight);
  addQuad(mesh, topRearLeft, topFrontLeft, topFrontRight, topRearRight);
}

function addQuad(
  mesh: MeshPart,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
): void {
  const start = mesh.positions.length / 3;
  mesh.positions.push(...a, ...b, ...c, ...d);
  mesh.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function accessorRange(positions: number[]): AccessorRange {
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  return { min, max };
}

function float32Bytes(values: number[]): Uint8Array {
  const array = new Float32Array(values);
  return new Uint8Array(array.buffer);
}

function uint16Bytes(values: number[]): Uint8Array {
  const array = new Uint16Array(values);
  return new Uint8Array(array.buffer);
}

function concatBytes(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
