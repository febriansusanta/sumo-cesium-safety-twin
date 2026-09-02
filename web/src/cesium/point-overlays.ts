import { Cartesian3, Color, Entity, HeightReference, Viewer } from "cesium";
import type { PointOverlayGeoJson } from "../api";

const REAL_POINT_COLOR = "#db2777";
const SUMO_POINT_COLOR = "#2563eb";

export interface PointOverlayEntities {
  real: Entity[];
  sumo: Entity[];
}

export function renderPointOverlays(
  viewer: Viewer,
  overlays: PointOverlayGeoJson,
): PointOverlayEntities {
  const entities: PointOverlayEntities = { real: [], sumo: [] };
  for (const feature of overlays.features) {
    const geometry = feature.geometry as { type?: string; coordinates?: unknown } | undefined;
    if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) continue;
    const [longitude, latitude] = geometry.coordinates;
    if (typeof longitude !== "number" || typeof latitude !== "number") continue;
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const kind = properties.overlayKind === "sumo" ? "sumo" : "real";
    const entity = viewer.entities.add({
      id: `point-overlay-${kind}-${String(feature.id ?? entities[kind].length + 1)}`,
      name: kind === "sumo" ? "SUMO point" : "Real point",
      position: Cartesian3.fromDegrees(longitude, latitude, 1.5),
      point: {
        pixelSize: kind === "sumo" ? 10 : 13,
        color: Color.fromCssColorString(kind === "sumo" ? SUMO_POINT_COLOR : REAL_POINT_COLOR),
        outlineColor: Color.WHITE.withAlpha(0.88),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties,
    });
    entities[kind].push(entity);
  }
  return entities;
}
