import { Color, ColorMaterialProperty, ConstantProperty, GeoJsonDataSource, Viewer } from "cesium";
import type { BuildingGeoJson } from "../api";

const BUILDING_FILL = Color.fromCssColorString("#9aa6a0").withAlpha(0.62);
const BUILDING_STROKE = Color.fromCssColorString("#2d4042").withAlpha(0.9);
const DEFAULT_HEIGHT = 14;

export async function renderBuildings(
  viewer: Viewer,
  buildings: BuildingGeoJson,
): Promise<GeoJsonDataSource> {
  const dataSource = await GeoJsonDataSource.load(buildings, {
    clampToGround: false,
    fill: BUILDING_FILL,
    stroke: BUILDING_STROKE,
    strokeWidth: 1,
  });
  const now = viewer.clock.currentTime;
  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon;
    if (!polygon) continue;
    const properties = entity.properties?.getValue(now) as { height?: unknown } | undefined;
    const height = Number(properties?.height ?? DEFAULT_HEIGHT);
    polygon.height = new ConstantProperty(0);
    polygon.extrudedHeight = new ConstantProperty(
      Number.isFinite(height) ? height : DEFAULT_HEIGHT,
    );
    polygon.material = new ColorMaterialProperty(BUILDING_FILL);
    polygon.outline = new ConstantProperty(true);
    polygon.outlineColor = new ConstantProperty(BUILDING_STROKE);
  }
  await viewer.dataSources.add(dataSource);
  return dataSource;
}
