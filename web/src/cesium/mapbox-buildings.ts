import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  type Entity,
  PolygonHierarchy,
  type Viewer,
} from "cesium";
import { VectorTile } from "@mapbox/vector-tile";
import type { Feature, Geometry, Position } from "geojson";
import { PbfReader } from "pbf";
import type { NetworkGeoJson } from "../api";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapboxTileId {
  z: number;
  x: number;
  y: number;
}

export interface MapboxBuildingLayer {
  entities: Entity[];
  featureCount: number;
  tileCount: number;
  bounds: Bounds;
}

const BUILDING_LAYER_NAME = "building";
const TILE_ZOOM_CANDIDATES = [16, 15, 14] as const;
const MAX_TILE_REQUESTS = 24;
const MAX_BUILDING_ENTITIES = 900;
const NETWORK_PADDING_DEGREES = 0.0025;
const MIN_MERCATOR_LATITUDE = -85.05112878;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const DEFAULT_BUILDING_HEIGHT = 10;
const MIN_RENDER_HEIGHT = 3;
const MAX_RENDER_HEIGHT = 180;
const BUILDING_FILL = Color.fromCssColorString("#e6e0d4").withAlpha(0.88);
const BUILDING_OUTLINE = Color.fromCssColorString("#b8c6c2").withAlpha(0.65);

export function buildMapboxBuildingTileUrl(tile: MapboxTileId, token: string): string {
  return `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${tile.z}/${tile.x}/${tile.y}.vector.pbf?access_token=${encodeURIComponent(token)}`;
}

export function boundsForNetwork(network: NetworkGeoJson): Bounds {
  const coordinates = allCoordinates(network);
  if (coordinates.length === 0) throw new Error("Network GeoJSON contains no coordinates");
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

export function tileCoverageForBounds(bounds: Bounds): MapboxTileId[] {
  const padded = padBounds(bounds, NETWORK_PADDING_DEGREES);
  for (const zoom of TILE_ZOOM_CANDIDATES) {
    const tiles = tilesForBounds(padded, zoom);
    if (tiles.length <= MAX_TILE_REQUESTS) return tiles;
  }
  return tilesForBounds(padded, TILE_ZOOM_CANDIDATES[TILE_ZOOM_CANDIDATES.length - 1]!).slice(
    0,
    MAX_TILE_REQUESTS,
  );
}

export function buildingHeightsFromProperties(
  properties: Record<string, unknown>,
): { baseHeight: number; extrudedHeight: number } {
  const baseHeight = clampMeters(readMeters(properties.min_height) ?? 0, 0, MAX_RENDER_HEIGHT);
  const explicitHeight = readMeters(properties.height) ?? readMeters(properties.render_height);
  const extrudedHeight = clampMeters(
    explicitHeight ?? DEFAULT_BUILDING_HEIGHT,
    baseHeight + MIN_RENDER_HEIGHT,
    MAX_RENDER_HEIGHT,
  );
  return { baseHeight, extrudedHeight };
}

export async function loadMapboxBuildings(
  viewer: Viewer,
  network: NetworkGeoJson,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<MapboxBuildingLayer> {
  if (token.trim().length === 0) {
    throw new Error("Mapbox token is not configured");
  }

  const rawBounds = boundsForNetwork(network);
  const bounds = padBounds(rawBounds, NETWORK_PADDING_DEGREES);
  const tiles = tileCoverageForBounds(rawBounds);
  const entities: Entity[] = [];
  for (const tile of tiles) {
    if (entities.length >= MAX_BUILDING_ENTITIES) break;
    const response = await fetcher(buildMapboxBuildingTileUrl(tile, token));
    if (!response.ok) {
      throw new Error(`Mapbox building tile request failed (${response.status})`);
    }
    const vectorTile = new VectorTile(new PbfReader(await response.arrayBuffer()));
    const layer = vectorTile.layers[BUILDING_LAYER_NAME];
    if (!layer) continue;
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index).toGeoJSON(tile.x, tile.y, tile.z) as Feature<Geometry>;
      const added = addBuildingFeature(viewer, feature, bounds, MAX_BUILDING_ENTITIES - entities.length);
      entities.push(...added);
      if (entities.length >= MAX_BUILDING_ENTITIES) break;
    }
  }
  viewer.scene.requestRender();
  return { entities, featureCount: entities.length, tileCount: tiles.length, bounds };
}

export function clearMapboxBuildings(viewer: Viewer, entities: Entity[]): void {
  for (const entity of entities) viewer.entities.remove(entity);
  viewer.scene.requestRender();
}

function addBuildingFeature(
  viewer: Viewer,
  feature: Feature<Geometry>,
  bounds: Bounds,
  remainingSlots: number,
): Entity[] {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const heights = buildingHeightsFromProperties(properties);
  const entities: Entity[] = [];
  const polygons = polygonsFromGeometry(feature.geometry);
  for (const polygon of polygons) {
    if (entities.length >= remainingSlots) break;
    if (!polygonIntersectsBounds(polygon, bounds)) continue;
    const hierarchy = hierarchyFromPolygon(polygon);
    if (!hierarchy) continue;
    entities.push(
      viewer.entities.add({
        name: "Mapbox building",
        polygon: {
          hierarchy,
          height: heights.baseHeight,
          extrudedHeight: heights.extrudedHeight,
          material: new ColorMaterialProperty(BUILDING_FILL),
          outline: true,
          outlineColor: BUILDING_OUTLINE,
        },
        properties: {
          source: "Mapbox Streets v8",
          layer: BUILDING_LAYER_NAME,
          height: heights.extrudedHeight,
        },
      }),
    );
  }
  return entities;
}

function polygonsFromGeometry(geometry: Geometry | null): Position[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function hierarchyFromPolygon(polygon: Position[][]): PolygonHierarchy | undefined {
  const [outer, ...holes] = polygon;
  if (!outer) return undefined;
  const positions = positionsFromRing(outer);
  if (positions.length < 3) return undefined;
  const holeHierarchies = holes
    .map((ring) => positionsFromRing(ring))
    .filter((positionsForHole) => positionsForHole.length >= 3)
    .map((positionsForHole) => new PolygonHierarchy(positionsForHole));
  return new PolygonHierarchy(positions, holeHierarchies);
}

function positionsFromRing(ring: Position[]): Cartesian3[] {
  const degrees: number[] = [];
  for (const position of ring) {
    const longitude = Number(position[0]);
    const latitude = Number(position[1]);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      degrees.push(longitude, latitude);
    }
  }
  return degrees.length >= 6 ? Cartesian3.fromDegreesArray(degrees) : [];
}

function polygonIntersectsBounds(polygon: Position[][], bounds: Bounds): boolean {
  const coordinates = polygon.flat();
  if (coordinates.length === 0) return false;
  const longitudes = coordinates.map((coordinate) => Number(coordinate[0]));
  const latitudes = coordinates.map((coordinate) => Number(coordinate[1]));
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  return !(east < bounds.west || west > bounds.east || north < bounds.south || south > bounds.north);
}

function allCoordinates(value: unknown): Array<[number, number]> {
  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      return [[value[0], value[1]]];
    }
    return value.flatMap((item) => allCoordinates(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => allCoordinates(item));
  }
  return [];
}

function tilesForBounds(bounds: Bounds, zoom: number): MapboxTileId[] {
  const maxTileIndex = 2 ** zoom - 1;
  const minX = clampTile(lonToTileX(bounds.west, zoom), maxTileIndex);
  const maxX = clampTile(lonToTileX(bounds.east, zoom), maxTileIndex);
  const minY = clampTile(latToTileY(bounds.north, zoom), maxTileIndex);
  const maxY = clampTile(latToTileY(bounds.south, zoom), maxTileIndex);
  const tiles: MapboxTileId[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) tiles.push({ z: zoom, x, y });
  }
  return tiles;
}

function lonToTileX(longitude: number, zoom: number): number {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function latToTileY(latitude: number, zoom: number): number {
  const clampedLatitude = clamp(latitude, MIN_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const radians = (clampedLatitude * Math.PI) / 180;
  const mercatorY = Math.log(Math.tan(radians) + 1 / Math.cos(radians));
  return Math.floor(((1 - mercatorY / Math.PI) / 2) * 2 ** zoom);
}

function clampTile(value: number, maxTileIndex: number): number {
  return Math.trunc(clamp(value, 0, maxTileIndex));
}

function padBounds(bounds: Bounds, amount: number): Bounds {
  return {
    west: clamp(bounds.west - amount, -180, 180),
    south: clamp(bounds.south - amount, MIN_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    east: clamp(bounds.east + amount, -180, 180),
    north: clamp(bounds.north + amount, MIN_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
  };
}

function readMeters(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/m$/i, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampMeters(value: number, min: number, max: number): number {
  return clamp(value, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
