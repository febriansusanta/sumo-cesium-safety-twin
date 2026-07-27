import { Color, GeoJsonDataSource, Viewer } from "cesium";
import type { NetworkGeoJson } from "../api";

export async function renderNetwork(
  viewer: Viewer,
  network: NetworkGeoJson,
): Promise<GeoJsonDataSource> {
  const dataSource = await GeoJsonDataSource.load(network, {
    clampToGround: false,
    stroke: Color.fromCssColorString("#51c7da"),
    strokeWidth: 3,
    markerColor: Color.fromCssColorString("#f1b65b"),
    markerSize: 5,
  });
  await viewer.dataSources.add(dataSource);
  await viewer.flyTo(dataSource, { duration: 0.8 });
  return dataSource;
}
