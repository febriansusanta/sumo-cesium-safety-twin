import {
  Cartesian3,
  Credit,
  EllipsoidTerrainProvider,
  type ImageryProvider,
  OpenStreetMapImageryProvider,
  Rectangle,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";

const TAIWAN_BASEMAP_RECTANGLE = Rectangle.fromDegrees(118, 20, 123, 26.8);
const NLSC_EMAP_TILE_URL =
  "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}";
const MAPBOX_STREETS_TILE_URL =
  "https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token={token}";

export const MAPBOX_3D_BUILDINGS_BASEMAP_ID = "mapbox-3d-buildings";

export interface BasemapOption {
  id: string;
  label: string;
  createProvider: () => ImageryProvider;
  buildingSource?: "mapbox";
}

export function getMapboxToken(): string {
  return import.meta.env.VITE_MAPBOX_TOKEN?.trim() ?? "";
}

export function mapboxTokenConfigured(): boolean {
  return getMapboxToken().length > 0;
}

function createNlscProvider(): ImageryProvider {
  return new UrlTemplateImageryProvider({
    url: NLSC_EMAP_TILE_URL,
    credit: "National Land Surveying and Mapping Center, Taiwan",
    maximumLevel: 19,
    rectangle: TAIWAN_BASEMAP_RECTANGLE,
  });
}

function createMapboxStreetsProvider(): ImageryProvider {
  const token = getMapboxToken();
  if (!token) return createNlscProvider();
  return new UrlTemplateImageryProvider({
    url: MAPBOX_STREETS_TILE_URL.replace("{token}", encodeURIComponent(token)),
    credit: new Credit("Mapbox, OpenStreetMap"),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel: 22,
  });
}

/**
 * Public basemaps for Cesium. The Mapbox option also enables a separate
 * Mapbox Streets vector-tile building layer in the dashboard.
 */
export const BASEMAPS: BasemapOption[] = [
  {
    id: "nlsc",
    label: "NLSC Taiwan",
    createProvider: createNlscProvider,
  },
  {
    id: MAPBOX_3D_BUILDINGS_BASEMAP_ID,
    label: "Mapbox 3D Buildings",
    buildingSource: "mapbox",
    createProvider: createMapboxStreetsProvider,
  },
  {
    id: "dark",
    label: "Dark",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        subdomains: "abcd",
        credit: "OpenStreetMap contributors, CARTO",
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
        credit: "OpenStreetMap contributors, CARTO",
        maximumLevel: 20,
      }),
  },
  {
    id: "streets",
    label: "Streets",
    createProvider: () =>
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        credit: "OpenStreetMap contributors",
      }),
  },
  {
    id: "satellite",
    label: "Satellite",
    createProvider: () =>
      new UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        credit: "Imagery: Esri, Maxar, Earthstar Geographics",
        maximumLevel: 19,
      }),
  },
];

export const DEFAULT_BASEMAP_ID = "nlsc";

export function basemapUsesMapboxBuildings(id: string): boolean {
  const option = BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0]!;
  return option.buildingSource === "mapbox";
}

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
  viewer.camera.setView({ destination: Cartesian3.fromDegrees(0, 20, 20_000_000) });
  return viewer;
}
