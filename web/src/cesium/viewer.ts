import {
  Cartesian3,
  EllipsoidTerrainProvider,
  type ImageryProvider,
  OpenStreetMapImageryProvider,
  Rectangle,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";

const NCKU_VIEW = { longitude: 120.2184, latitude: 22.9962 };
const TAIWAN_BASEMAP_RECTANGLE = Rectangle.fromDegrees(118, 20, 123, 26.8);
const NLSC_EMAP_TILE_URL =
  "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}";

export interface BasemapOption {
  id: string;
  label: string;
  createProvider: () => ImageryProvider;
}

/**
 * Token-free basemaps. NLSC Taiwan e-Map is the default local context layer;
 * the other layers stay available for contrast and visual checks.
 */
export const BASEMAPS: BasemapOption[] = [
  {
    id: "nlsc",
    label: "NLSC Taiwan",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: NLSC_EMAP_TILE_URL,
        credit: "National Land Surveying and Mapping Center, Taiwan",
        maximumLevel: 19,
        rectangle: TAIWAN_BASEMAP_RECTANGLE,
      }),
  },
  {
    id: "dark",
    label: "Dark",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        subdomains: "abcd",
        credit: "© OpenStreetMap contributors © CARTO",
        maximumLevel: 20,
      }),
  },
  {
    id: "light",
    label: "Light",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        subdomains: "abcd",
        credit: "© OpenStreetMap contributors © CARTO",
        maximumLevel: 20,
      }),
  },
  {
    id: "streets",
    label: "Streets",
    createProvider: () =>
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        credit: "© OpenStreetMap contributors",
      }),
  },
  {
    id: "satellite",
    label: "Satellite",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        credit: "Imagery © Esri, Maxar, Earthstar Geographics",
        maximumLevel: 19,
      }),
  },
];

export const DEFAULT_BASEMAP_ID = "nlsc";

/**
 * Replace the basemap imagery layer. The network, vehicles and safety events
 * are Cesium entities rather than imagery layers, so the imagery stack only
 * ever holds the basemap and can be swapped wholesale.
 */
export function setBasemap(viewer: Viewer, id: string): void {
  const option = BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0]!;
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(option.createProvider());
}

export function createViewer(container: HTMLElement): Viewer {
  const viewer = new Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    terrainProvider: new EllipsoidTerrainProvider(),
  });
  setBasemap(viewer, DEFAULT_BASEMAP_ID);
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(NCKU_VIEW.longitude, NCKU_VIEW.latitude, 900),
    duration: 0,
  });
  return viewer;
}
