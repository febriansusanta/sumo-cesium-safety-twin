import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles/main.css";
import * as Cesium from "cesium";
import {
  fetchHealth,
  createNetwork,
  fetchDemoRuns,
  fetchNetwork,
  fetchNetworkGeoJson,
  fetchNetworks,
  fetchNetworkStatus,
  fetchPresets,
  fetchRun,
  fetchRuns,
  fetchSafetyEvents,
  retrieveMapboxLocationSuggestion,
  searchLocations,
  searchMapboxLocationSuggestions,
  fetchTimeSeries,
  fetchTrajectories,
  fetchSummary,
  fetchLocalDatasets,
  fetchPointOverlays,
  createRun,
  importLocalDataset,
  validateScenario,
  loadDemoRun,
} from "./api";
import type {
  BoundingBox,
  LocationSearchResult,
  MapboxLocationSuggestion,
  NetworkBuildRequest,
  NetworkGeoJson,
  NetworkMetadata,
  Preset,
  SafetyEvent,
  Trajectory,
} from "./api";
import { renderTtcChart } from "./charts/ttc-chart";
import { renderVehicleChart } from "./charts/vehicle-chart";
import { EVENT_COLORS, humanizeEventType, renderSafetyEvents } from "./cesium/events";
import {
  clearMapboxBuildings,
  loadMapboxBuildings,
  type MapboxBuildingLayer,
} from "./cesium/mapbox-buildings";
import { renderNetwork } from "./cesium/network";
import { renderPointOverlays } from "./cesium/point-overlays";
import { highlightVehicle, renderVehicles } from "./cesium/vehicles";
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  basemapUsesMapboxBuildings,
  createViewer,
  getMapboxToken,
  setBasemap,
} from "./cesium/viewer";
import { PlaybackStore } from "./simulation/playback-store";
import {
  LOCATION_AUTOCOMPLETE_DEBOUNCE_MS,
  LOCATION_AUTOCOMPLETE_MIN_LENGTH,
  localLocationSuggestions,
  locationPrimaryLabel,
  locationSecondaryLabel,
  shouldSearchAutocomplete,
} from "./ui/location-search";

declare global {
  interface Window {
    Cesium: typeof Cesium;
  }
}
window.Cesium = Cesium;

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Application root is missing");

root.innerHTML = `
  <header class="masthead">
    <div>
      <p class="eyebrow">Local traffic-safety digital twin</p>
      <h1>SUMO–Cesium Safety Twin</h1>
    </div>
    <output id="api-status" class="status" aria-live="polite">Checking API…</output>
  </header>
  <main id="main" class="dashboard">
    <aside class="panel panel-left" aria-labelledby="study-area-heading scenario-heading">
      <h2 id="study-area-heading">Study area</h2>
      <label for="location-search">Search location</label>
      <div class="search-shell">
        <div class="search-row">
          <input id="location-search" type="search" maxlength="120" placeholder="Type a place, e.g. UGM" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="location-suggestions" />
          <button id="search-location" type="button">Search</button>
        </div>
        <div id="location-suggestions" class="location-suggestions" role="listbox" aria-label="Location suggestions" hidden></div>
      </div>
      <div class="field-grid">
        <label>AOI name<input id="aoi-name" type="text" maxlength="80" value="custom-aoi" /></label>
        <label>Driving side<select id="driving-side"><option value="right">right</option><option value="left">left</option></select></label>
        <label>West<input id="aoi-west" type="number" min="-180" max="180" step="0.000001" /></label>
        <label>South<input id="aoi-south" type="number" min="-90" max="90" step="0.000001" /></label>
        <label>East<input id="aoi-east" type="number" min="-180" max="180" step="0.000001" /></label>
        <label>North<input id="aoi-north" type="number" min="-90" max="90" step="0.000001" /></label>
      </div>
      <div class="button-row"><button id="use-current-view" type="button" disabled>Use current view</button><button id="build-network" type="button" disabled>Build network</button></div>
      <output id="aoi-status" class="form-message" aria-live="polite">Build a small AOI network before running a generated scenario.</output>
      <h2 id="scenario-heading">Scenario</h2>
      <label for="preset">Preset</label>
      <select id="preset"><option>Loading presets…</option></select>
      <div class="field-grid">
        <label>Duration (s)<input id="duration" type="number" min="30" max="3600" step="10" /></label>
        <label>Seed<input id="seed" type="number" min="0" step="1" /></label>
        <label>Demand<select id="demand-level"><option>low</option><option>medium</option><option>high</option></select></label>
        <label>Trip period (s)<input id="period" type="number" min="0.25" max="30" step="0.25" /></label>
        <label>TTC warning (s)<input id="warning-ttc" type="number" min="0.1" step="0.1" /></label>
        <label>TTC critical (s)<input id="critical-ttc" type="number" min="0.1" step="0.1" /></label>
      </div>
      <details><summary>Advanced behavioural assumptions</summary>
        <div class="field-grid">
          <label>Car-following<select id="car-follow"><option>Krauss</option><option>IDM</option><option>EIDM</option></select></label>
          <label>Tau (s)<input id="tau" type="number" min="0.01" max="5" step="0.1" /></label>
          <label>Decel (m/s²)<input id="decel" type="number" min="0.1" max="15" step="0.1" /></label>
          <label>Emergency decel<input id="emergency-decel" type="number" min="0.1" max="20" step="0.1" /></label>
          <label>Step length (s)<input id="step-length" type="number" min="0.01" max="1" step="0.01" /></label>
        </div>
      </details>
      <div class="button-row"><button id="reset" type="button">Reset</button><button id="validate" type="button" disabled>Validate</button><button id="run" type="button" disabled>Run simulation</button><button id="load-demo" type="button" disabled>Load demo run</button><button id="load-local-data" type="button" disabled>Load Data folder</button></div>
      <output id="validation" class="form-message" aria-live="polite"></output>
      <dl>
        <div><dt>Location</dt><dd id="location-status">No AOI selected</dd></div>
        <div><dt>Network</dt><dd id="network-status">Build an AOI network</dd></div>
        <div><dt>Point overlays</dt><dd id="point-status">Loading…</dd></div>
        <div><dt>Playback</dt><dd>Offline completed runs</dd></div>
        <div><dt>Run</dt><dd id="run-status">Looking for completed runs…</dd></div>
        <div><dt>Vehicles</dt><dd id="vehicle-count">—</dd></div>
        <div><dt>Selected</dt><dd id="selected-vehicle">None</dd></div>
      </dl>
      <p class="disclaimer">Synthetic and uncalibrated — not for operational road-safety decisions.</p>
    </aside>
    <section class="map-panel" aria-label="Three-dimensional network map">
      <div id="cesium-container"></div>
      <div id="event-tooltip" class="event-tooltip" role="tooltip" hidden></div>
      <section id="event-panel" class="event-panel" aria-label="Event details" hidden>
        <header id="event-panel-handle" class="event-panel-handle">
          <span id="event-panel-badge" class="sev-badge"></span>
          <strong id="event-panel-title"></strong>
          <button id="event-panel-close" type="button" aria-label="Close event details">×</button>
        </header>
        <div id="event-panel-body" class="event-panel-body"></div>
      </section>
      <div id="toast-stack" class="toast-stack" aria-live="polite"></div>
      <div class="map-toolbar">
        <fieldset class="layer-panel">
          <legend>Layers</legend>
          <label class="toggle"><input type="checkbox" id="layer-vehicles" checked /> Vehicles</label>
          <label class="toggle"><input type="checkbox" id="layer-events" checked /> Safety events</label>
          <label class="toggle"><input type="checkbox" id="layer-network" checked /> Road network</label>
          <label class="toggle"><input type="checkbox" id="layer-real-points" checked /> Real points</label>
          <label class="toggle"><input type="checkbox" id="layer-sumo-points" checked /> SUMO points</label>
        </fieldset>
        <div class="map-control-stack">
          <div class="camera-tools" aria-label="Map camera controls">
            <button id="north-up-view" type="button" title="Rotate north to the top">North Up</button>
            <button id="top-view" type="button" title="Look straight down over the active study area">Top View</button>
            <button id="orbit-view" type="button" title="Toggle 3D orbit around the active study area" aria-pressed="false">Orbit</button>
          </div>
          <div class="basemap-picker">
            <label for="basemap">Basemap</label>
            <select id="basemap" aria-label="Basemap style"></select>
          </div>
        </div>
      </div>
      <div class="map-legend">
        <span class="lg lg-vehicle">Vehicle</span>
        <span class="lg lg-warning">Warning event</span>
        <span class="lg lg-critical">Critical event</span>
        <span class="lg lg-network">Road network</span>
        <span id="legend-buildings" class="lg lg-building" hidden>3D buildings</span>
        <span class="lg lg-real-point">Real point</span>
        <span class="lg lg-sumo-point">SUMO point</span>
      </div>
      <section class="playback" aria-label="Playback controls">
        <button id="restart" type="button" aria-label="Restart playback">↺</button>
        <button id="play" type="button">Play</button>
        <label class="sr-only" for="time">Simulation time</label>
        <input id="time" type="range" min="0" max="0" step="0.1" value="0" />
        <output id="clock">0.0 / 0.0 s</output>
        <label class="sr-only" for="speed">Playback speed</label>
        <select id="speed" aria-label="Playback speed">
          <option value="0.5">0.5×</option><option value="1" selected>1×</option>
          <option value="2">2×</option><option value="4">4×</option>
        </select>
      </section>
    </section>
    <aside class="panel panel-right" aria-label="Run analytics">
      <h2>Run summary</h2><div id="summary" class="summary-grid"><p>No run loaded.</p></div>
      <div id="comparison" class="comparison"></div>
      <h2>Safety events</h2>
      <div class="event-nav"><button id="previous-event" type="button">Previous</button><button id="next-event" type="button">Next</button></div>
      <div id="ttc-chart" class="chart"></div>
      <div class="event-table-wrap">
        <table><thead><tr><th>Time</th><th>Event</th><th>TTC</th><th></th></tr></thead>
        <tbody id="event-table"><tr><td colspan="4">Load a completed run</td></tr></tbody></table>
      </div>
      <h2>Selected vehicle</h2><div id="vehicle-chart" class="chart vehicle-chart">Select a vehicle to inspect speed and acceleration.</div>
    </aside>
  </main>
`;

const mapElement = document.querySelector<HTMLElement>("#cesium-container");
if (!mapElement) throw new Error("Cesium container is missing");
const viewer = createViewer(mapElement);
const playback = new PlaybackStore();
const TOP_VIEW_PITCH = Cesium.Math.toRadians(-90);
const ORBIT_VIEW_PITCH = Cesium.Math.toRadians(-55);
const ORBIT_RATE = Cesium.Math.toRadians(8);
const MIN_CAMERA_RANGE_METERS = 650;

const layerVisibility = {
  vehicles: true,
  events: true,
  network: true,
  buildings: basemapUsesMapboxBuildings(DEFAULT_BASEMAP_ID),
  realPoints: true,
  sumoPoints: true,
};
let networkDataSource: Cesium.GeoJsonDataSource | undefined;
let currentNetwork: NetworkGeoJson | undefined;
let staticDashboardMode = false;
let backendActionsAvailable = false;
let locationSearchMode: "pending" | "local-api" | "static-pages" = "pending";
let selectedNetwork: NetworkMetadata | undefined;
let selectedNetworkId: string | undefined;
let mapboxBuildings: MapboxBuildingLayer | undefined;
let mapboxBuildingLoad: Promise<void> | undefined;
let realPointEntities: Cesium.Entity[] = [];
let sumoPointEntities: Cesium.Entity[] = [];
let loadedTrajectories: Trajectory[] = [];
let safetyEvents: SafetyEvent[] = [];
const eventsById = new Map<string, SafetyEvent>();
let vehicleEntities = new Map<string, Cesium.Entity>();
let eventEntities = new Map<string, Cesium.Entity>();
let dynamicEntities: Cesium.Entity[] = [];
let currentEventIndex = -1;
const buildingLegend = document.querySelector<HTMLElement>("#legend-buildings");
const northUpButton = document.querySelector<HTMLButtonElement>("#north-up-view");
const topViewButton = document.querySelector<HTMLButtonElement>("#top-view");
const orbitButton = document.querySelector<HTMLButtonElement>("#orbit-view");
let orbitEnabled = false;
let orbitHeading = 0;
let orbitRange = MIN_CAMERA_RANGE_METERS;
let orbitCenter: Cesium.Cartesian3 | undefined;
let lastOrbitTimestamp: number | undefined;

function coordinatesFromGeoJson(value: unknown, coordinates: Array<[number, number]> = []): Array<[number, number]> {
  if (Array.isArray(value)) {
    if (
      value.length >= 2
      && typeof value[0] === "number"
      && typeof value[1] === "number"
    ) {
      coordinates.push([value[0], value[1]]);
      return coordinates;
    }
    for (const item of value) coordinatesFromGeoJson(item, coordinates);
    return coordinates;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      coordinatesFromGeoJson(item, coordinates);
    }
  }
  return coordinates;
}

function bboxFromNetwork(network: NetworkGeoJson | undefined): BoundingBox | undefined {
  if (!network) return undefined;
  const coordinates = coordinatesFromGeoJson(network);
  if (coordinates.length === 0) return undefined;
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function activeBbox(): BoundingBox | undefined {
  return selectedNetwork?.bbox ?? bboxFromNetwork(currentNetwork);
}

function bboxCenter(bbox: BoundingBox): { longitude: number; latitude: number } {
  return {
    longitude: (bbox.west + bbox.east) / 2,
    latitude: (bbox.south + bbox.north) / 2,
  };
}

function cameraRangeForBbox(bbox: BoundingBox, multiplier = 2.7): number {
  const center = bboxCenter(bbox);
  const latitudeMeters = Math.abs(bbox.north - bbox.south) * 111_320;
  const longitudeMeters =
    Math.abs(bbox.east - bbox.west)
    * 111_320
    * Math.max(0.2, Math.cos(Cesium.Math.toRadians(center.latitude)));
  return Math.max(MIN_CAMERA_RANGE_METERS, Math.max(latitudeMeters, longitudeMeters) * multiplier);
}

function destinationForBbox(bbox: BoundingBox): Cesium.Cartesian3 {
  const center = bboxCenter(bbox);
  return Cesium.Cartesian3.fromDegrees(
    center.longitude,
    center.latitude,
    cameraRangeForBbox(bbox),
  );
}

function setOrbitPressed(active: boolean): void {
  if (!orbitButton) return;
  orbitButton.setAttribute("aria-pressed", String(active));
  orbitButton.textContent = active ? "Stop Orbit" : "Orbit";
}

function stopOrbit(): void {
  orbitEnabled = false;
  lastOrbitTimestamp = undefined;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  setOrbitPressed(false);
}

function flyTopToBbox(bbox: BoundingBox): void {
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({
    destination: destinationForBbox(bbox),
    orientation: {
      heading: 0,
      pitch: TOP_VIEW_PITCH,
      roll: 0,
    },
    duration: 0.8,
  });
}

function activateTopView(): void {
  stopOrbit();
  const bbox = activeBbox();
  if (!bbox) return;
  flyTopToBbox(bbox);
}

function activateNorthUpView(): void {
  stopOrbit();
  viewer.trackedEntity = undefined;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
    orientation: {
      heading: 0,
      pitch: viewer.camera.pitch,
      roll: 0,
    },
    duration: 0.5,
  });
}

function refreshOrbitTarget(): boolean {
  const bbox = activeBbox();
  if (!bbox) return false;
  const center = bboxCenter(bbox);
  orbitCenter = Cesium.Cartesian3.fromDegrees(center.longitude, center.latitude, 0);
  orbitRange = cameraRangeForBbox(bbox, 2.4);
  return true;
}

function toggleOrbitView(): void {
  if (orbitEnabled) {
    stopOrbit();
    return;
  }
  if (!refreshOrbitTarget()) return;
  viewer.trackedEntity = undefined;
  orbitEnabled = true;
  orbitHeading = viewer.camera.heading;
  lastOrbitTimestamp = undefined;
  setOrbitPressed(true);
}

northUpButton?.addEventListener("click", activateNorthUpView);
topViewButton?.addEventListener("click", activateTopView);
orbitButton?.addEventListener("click", toggleOrbitView);

viewer.scene.preRender.addEventListener(() => {
  if (!orbitEnabled || !orbitCenter) return;
  const timestamp = performance.now();
  const elapsedSeconds =
    lastOrbitTimestamp === undefined ? 0 : (timestamp - lastOrbitTimestamp) / 1000;
  lastOrbitTimestamp = timestamp;
  orbitHeading += elapsedSeconds * ORBIT_RATE;
  viewer.camera.lookAt(
    orbitCenter,
    new Cesium.HeadingPitchRange(orbitHeading, ORBIT_VIEW_PITCH, orbitRange),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
});

function updateBuildingLegend(): void {
  if (buildingLegend) buildingLegend.hidden = !layerVisibility.buildings;
}

function applyLayerVisibility(): void {
  // Event markers gate their own `show` via a playback-driven callback that also
  // reads layerVisibility.events, so they are intentionally not set here.
  for (const entity of vehicleEntities.values()) entity.show = layerVisibility.vehicles;
  if (networkDataSource) networkDataSource.show = layerVisibility.network;
  if (mapboxBuildings) {
    for (const entity of mapboxBuildings.entities) entity.show = layerVisibility.buildings;
  }
  for (const entity of realPointEntities) entity.show = layerVisibility.realPoints;
  for (const entity of sumoPointEntities) entity.show = layerVisibility.sumoPoints;
}

async function ensureMapboxBuildings(): Promise<void> {
  if (!layerVisibility.buildings || mapboxBuildings || mapboxBuildingLoad || !currentNetwork) return;
  const token = getMapboxToken();
  if (!token) {
    buildingFeatureCount = 0;
    updateNetworkStatus();
    if (validationOutput) {
      validationOutput.value = "Mapbox 3D Buildings requires VITE_MAPBOX_TOKEN in .env";
    }
    return;
  }
  mapboxBuildingLoad = loadMapboxBuildings(viewer, currentNetwork, token)
    .then((layer) => {
      mapboxBuildings = layer;
      buildingFeatureCount = layer.featureCount;
      applyLayerVisibility();
      updateNetworkStatus();
    })
    .catch((error: unknown) => {
      buildingFeatureCount = 0;
      updateNetworkStatus();
      if (validationOutput) {
        validationOutput.value =
          error instanceof Error ? error.message : "Mapbox buildings unavailable";
      }
      console.warn(error instanceof Error ? error.message : "Mapbox buildings unavailable");
    })
    .finally(() => {
      mapboxBuildingLoad = undefined;
    });
  await mapboxBuildingLoad;
}

function applyBasemapSelection(id: string): void {
  setBasemap(viewer, id);
  layerVisibility.buildings = basemapUsesMapboxBuildings(id);
  updateBuildingLegend();
  applyLayerVisibility();
  void ensureMapboxBuildings();
}

function bindLayerToggle(id: string, key: keyof typeof layerVisibility): void {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  input?.addEventListener("change", () => {
    layerVisibility[key] = input.checked;
    applyLayerVisibility();
  });
}
bindLayerToggle("layer-vehicles", "vehicles");
bindLayerToggle("layer-events", "events");
bindLayerToggle("layer-network", "network");
bindLayerToggle("layer-real-points", "realPoints");
bindLayerToggle("layer-sumo-points", "sumoPoints");

const basemapSelect = document.querySelector<HTMLSelectElement>("#basemap");
if (basemapSelect) {
  basemapSelect.replaceChildren(
    ...BASEMAPS.map((basemap) => new Option(basemap.label, basemap.id)),
  );
  basemapSelect.value = DEFAULT_BASEMAP_ID;
  applyBasemapSelection(basemapSelect.value);
  basemapSelect.addEventListener("change", () => applyBasemapSelection(basemapSelect.value));
}

const playButton = document.querySelector<HTMLButtonElement>("#play");
const restartButton = document.querySelector<HTMLButtonElement>("#restart");
const timeInput = document.querySelector<HTMLInputElement>("#time");
const speedSelect = document.querySelector<HTMLSelectElement>("#speed");
const clockOutput = document.querySelector<HTMLOutputElement>("#clock");
playButton?.addEventListener("click", () =>
  playback.value.playing ? playback.pause() : playback.play(),
);
restartButton?.addEventListener("click", () => playback.restart());
timeInput?.addEventListener("input", () => playback.setTime(Number(timeInput.value)));
speedSelect?.addEventListener("change", () => playback.setSpeed(Number(speedSelect.value)));
playback.subscribe((snapshot) => {
  if (timeInput) {
    timeInput.max = String(snapshot.duration);
    timeInput.value = String(snapshot.time);
  }
  if (playButton) playButton.textContent = snapshot.playing ? "Pause" : "Play";
  if (clockOutput) clockOutput.value = `${snapshot.time.toFixed(1)} / ${snapshot.duration.toFixed(1)} s`;
});
function animate(timestamp: number): void {
  playback.tick(timestamp);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

const status = document.querySelector<HTMLOutputElement>("#api-status");

function updateBackendActionState(): void {
  for (const selector of [
    "#validate",
    "#load-demo",
    "#load-local-data",
    "#use-current-view",
    "#build-network",
  ]) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) button.disabled = !backendActionsAvailable;
  }
  const runButton = document.querySelector<HTMLButtonElement>("#run");
  if (runButton) runButton.disabled = !backendActionsAvailable || !selectedNetworkId;
}

void fetchHealth()
  .then((health) => {
    staticDashboardMode = health.service === "static-pages";
    backendActionsAvailable = !staticDashboardMode;
    locationSearchMode = staticDashboardMode ? "static-pages" : "local-api";
    if (status) {
      status.textContent = staticDashboardMode
        ? `Static dashboard ${health.version} loaded`
        : `API ${health.version} connected`;
      status.dataset.state = "ok";
    }
    updateBackendActionState();
    if (staticDashboardMode && validationOutput) {
      validationOutput.value =
        "GitHub Pages mode is read-only playback. Build network, run simulation and local folder import require localhost.";
    }
    if (locationSearchInput?.value.trim()) {
      queueLocationAutocompleteSearch();
    }
  })
  .catch((error: unknown) => {
    backendActionsAvailable = false;
    locationSearchMode = "static-pages";
    updateBackendActionState();
    if (status) {
      status.textContent = error instanceof Error ? error.message : "API unavailable";
      status.dataset.state = "error";
    }
  });

const networkStatus = document.querySelector<HTMLElement>("#network-status");
let mappedFeatureCount: number | undefined;
let buildingFeatureCount: number | undefined;

function updateNetworkStatus(): void {
  if (!networkStatus) return;
  if (mappedFeatureCount === undefined) {
    networkStatus.textContent = selectedNetwork
      ? `${selectedNetwork.status} · ${selectedNetwork.name}`
      : "Build an AOI network";
    return;
  }
  const networkLabel = selectedNetwork ? `${selectedNetwork.name} · ` : "";
  networkStatus.textContent =
    buildingFeatureCount === undefined
      ? `${networkLabel}${mappedFeatureCount} mapped features`
      : `${networkLabel}${mappedFeatureCount} mapped features, ${buildingFeatureCount} Mapbox buildings`;
}

function clearNetworkLayers(): void {
  if (networkDataSource) {
    viewer.dataSources.remove(networkDataSource, true);
    networkDataSource = undefined;
  }
  if (mapboxBuildings) {
    clearMapboxBuildings(viewer, mapboxBuildings.entities);
    mapboxBuildings = undefined;
  }
  buildingFeatureCount = undefined;
}

async function showNetwork(network: NetworkGeoJson, metadata?: NetworkMetadata): Promise<void> {
  clearNetworkLayers();
  selectedNetwork = metadata ?? selectedNetwork;
  selectedNetworkId =
    metadata?.status === "ready" ? metadata.networkId : selectedNetworkId;
  currentNetwork = network;
  if (orbitEnabled) refreshOrbitTarget();
  networkDataSource = await renderNetwork(viewer, network);
  applyLayerVisibility();
  mappedFeatureCount = network.features.length;
  updateNetworkStatus();
  updateBackendActionState();
  void ensureMapboxBuildings();
}

void (async () => {
  try {
    const networks = await fetchNetworks();
    const ready = networks.find((network) => network.status === "ready");
    if (ready) {
      selectedNetwork = ready;
      selectedNetworkId = ready.networkId;
      await showNetwork(await fetchNetworkGeoJson(ready.networkId), ready);
      applySelectedNetwork(ready);
      return;
    }
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "Network registry unavailable");
  }
  await showNetwork(await fetchNetwork());
})()
  .catch((error: unknown) => {
    if (networkStatus) {
      networkStatus.textContent = error instanceof Error ? error.message : "Network unavailable";
    }
  });

const pointStatus = document.querySelector<HTMLElement>("#point-status");
void fetchPointOverlays()
  .then((overlays) => {
    const entities = renderPointOverlays(viewer, overlays);
    realPointEntities = entities.real;
    sumoPointEntities = entities.sumo;
    applyLayerVisibility();
    if (pointStatus) {
      pointStatus.textContent = `${entities.real.length} real, ${entities.sumo.length} SUMO`;
    }
  })
  .catch((error: unknown) => {
    if (pointStatus) {
      pointStatus.textContent = error instanceof Error ? error.message : "No point overlay data";
    }
  });

const defaultLocationLabel = "No AOI selected";
const locationStatus = document.querySelector<HTMLElement>("#location-status");
const runStatus = document.querySelector<HTMLElement>("#run-status");
const vehicleCount = document.querySelector<HTMLElement>("#vehicle-count");
const eventTable = document.querySelector<HTMLTableSectionElement>("#event-table");
const chart = document.querySelector<HTMLElement>("#ttc-chart");
const selectedVehicle = document.querySelector<HTMLElement>("#selected-vehicle");
const vehicleChart = document.querySelector<HTMLElement>("#vehicle-chart");
const summaryPanel = document.querySelector<HTMLElement>("#summary");
const comparison = document.querySelector<HTMLElement>("#comparison");

function locationLabelForRun(scenarioName: string, networkName?: string | null): string {
  if (networkName) return networkName;
  const localPrefix = "Local data:";
  return scenarioName.startsWith(localPrefix)
    ? scenarioName.slice(localPrefix.length).trim()
    : (selectedNetwork?.name ?? defaultLocationLabel);
}

const eventTooltip = document.querySelector<HTMLElement>("#event-tooltip");
const eventPanel = document.querySelector<HTMLElement>("#event-panel");
const eventPanelHandle = document.querySelector<HTMLElement>("#event-panel-handle");
const eventPanelTitle = document.querySelector<HTMLElement>("#event-panel-title");
const eventPanelBadge = document.querySelector<HTMLElement>("#event-panel-badge");
const eventPanelBody = document.querySelector<HTMLElement>("#event-panel-body");
const eventPanelClose = document.querySelector<HTMLButtonElement>("#event-panel-close");
const toastStack = document.querySelector<HTMLElement>("#toast-stack");
const mapPanel = mapElement.parentElement;

function metricRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  const key = document.createElement("dt");
  key.textContent = label;
  const val = document.createElement("dd");
  val.textContent = value;
  row.append(key, val);
  return row;
}

/** The metric list + source footer shared by the hover tooltip and pinned panel. */
function eventMetrics(event: SafetyEvent): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const list = document.createElement("dl");
  list.append(metricRow("Time", `${event.startTime.toFixed(1)}–${event.endTime.toFixed(1)} s`));
  if (event.minimumTtc !== null) list.append(metricRow("Min TTC", `${event.minimumTtc.toFixed(2)} s`));
  if (event.maximumDrac !== null) list.append(metricRow("Max DRAC", `${event.maximumDrac.toFixed(2)} m/s²`));
  if (event.pet !== null) list.append(metricRow("PET", `${event.pet.toFixed(2)} s`));
  list.append(metricRow("Vehicles", event.vehicleIds.join(", ") || "—"));
  const footer = document.createElement("footer");
  footer.textContent = `${event.category} · ${event.source}`;
  fragment.append(list, footer);
  return fragment;
}

// --- Hover tooltip ---------------------------------------------------------
const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
pickHandler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
  const picked = viewer.scene.pick(movement.endPosition) as { id?: Cesium.Entity } | undefined;
  const entityId = picked?.id instanceof Cesium.Entity ? picked.id.id : undefined;
  const event = entityId?.startsWith("event-")
    ? eventsById.get(entityId.slice("event-".length))
    : undefined;
  if (event && eventTooltip) {
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = humanizeEventType(event.type);
    const badge = document.createElement("span");
    badge.className = `sev-badge sev-${event.severity}`;
    badge.textContent = event.severity;
    header.append(title, badge);
    eventTooltip.replaceChildren(header, eventMetrics(event));
    eventTooltip.style.left = `${movement.endPosition.x + 14}px`;
    eventTooltip.style.top = `${movement.endPosition.y + 14}px`;
    eventTooltip.hidden = false;
    viewer.scene.canvas.style.cursor = "pointer";
  } else {
    if (eventTooltip) eventTooltip.hidden = true;
    viewer.scene.canvas.style.cursor = "";
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// --- Pinned draggable detail panel -----------------------------------------
let panelPlaced = false;

function openEventPanel(event: SafetyEvent): void {
  if (!eventPanel || !eventPanelTitle || !eventPanelBadge || !eventPanelBody) return;
  eventPanelTitle.textContent = humanizeEventType(event.type);
  eventPanelBadge.className = `sev-badge sev-${event.severity}`;
  eventPanelBadge.textContent = event.severity;
  eventPanelBody.replaceChildren(eventMetrics(event));
  if (!panelPlaced) {
    eventPanel.style.left = "1rem";
    eventPanel.style.top = "5.5rem";
    eventPanel.style.right = "auto";
  }
  eventPanel.hidden = false;
}

eventPanelClose?.addEventListener("click", () => {
  if (eventPanel) eventPanel.hidden = true;
  viewer.selectedEntity = undefined;
});

if (eventPanel && eventPanelHandle && mapPanel) {
  let dragging = false;
  let pointerId = 0;
  let originX = 0;
  let originY = 0;
  let startLeft = 0;
  let startTop = 0;
  eventPanelHandle.addEventListener("pointerdown", (pointer) => {
    if (pointer.target === eventPanelClose) return;
    dragging = true;
    pointerId = pointer.pointerId;
    eventPanelHandle.setPointerCapture(pointerId);
    const panelRect = eventPanel.getBoundingClientRect();
    const parentRect = mapPanel.getBoundingClientRect();
    startLeft = panelRect.left - parentRect.left;
    startTop = panelRect.top - parentRect.top;
    originX = pointer.clientX;
    originY = pointer.clientY;
  });
  eventPanelHandle.addEventListener("pointermove", (pointer) => {
    if (!dragging) return;
    const maxLeft = mapPanel.clientWidth - eventPanel.offsetWidth;
    const maxTop = mapPanel.clientHeight - eventPanel.offsetHeight;
    const nextLeft = Math.min(Math.max(0, startLeft + pointer.clientX - originX), Math.max(0, maxLeft));
    const nextTop = Math.min(Math.max(0, startTop + pointer.clientY - originY), Math.max(0, maxTop));
    eventPanel.style.left = `${nextLeft}px`;
    eventPanel.style.top = `${nextTop}px`;
    eventPanel.style.right = "auto";
    panelPlaced = true;
  });
  const endDrag = (): void => {
    if (dragging) eventPanelHandle.releasePointerCapture(pointerId);
    dragging = false;
  };
  eventPanelHandle.addEventListener("pointerup", endDrag);
  eventPanelHandle.addEventListener("pointercancel", endDrag);
}

// --- Toasts as events occur during playback --------------------------------
function locateEventById(eventId: string): void {
  const index = safetyEvents.findIndex((event) => event.eventId === eventId);
  if (index >= 0) locateEvent(index);
}

function showEventToast(event: SafetyEvent): void {
  if (!toastStack) return;
  while (toastStack.childElementCount >= 4) toastStack.firstElementChild?.remove();
  const toast = document.createElement("button");
  toast.type = "button";
  toast.className = `toast sev-${event.severity}`;
  const time = document.createElement("span");
  time.className = "toast-time";
  time.textContent = `${event.startTime.toFixed(1)}s`;
  const label = document.createElement("span");
  label.textContent = humanizeEventType(event.type);
  toast.append(time, label);
  toast.addEventListener("click", () => locateEventById(event.eventId));
  const dismiss = (): void => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 300);
  };
  window.setTimeout(dismiss, 4500);
  toastStack.append(toast);
}

let lastToastTime = 0;
playback.subscribe((snapshot) => {
  const time = snapshot.time;
  if (snapshot.playing && time > lastToastTime && time - lastToastTime < 2) {
    for (const event of safetyEvents) {
      if (
        event.severity !== "normal" &&
        event.startTime > lastToastTime &&
        event.startTime <= time
      ) {
        showEventToast(event);
      }
    }
  }
  lastToastTime = time;
});

function locateEvent(index: number): void {
  if (safetyEvents.length === 0) return;
  stopOrbit();
  currentEventIndex = (index + safetyEvents.length) % safetyEvents.length;
  const event = safetyEvents[currentEventIndex];
  if (!event) return;
  playback.setTime(Math.max(0, event.startTime - 1));
  for (const vehicle of vehicleEntities.values()) highlightVehicle(vehicle, false);
  for (const id of event.vehicleIds) {
    const vehicle = vehicleEntities.get(id);
    if (vehicle) highlightVehicle(vehicle, true);
  }
  const entity = eventEntities.get(event.eventId);
  if (entity) {
    viewer.selectedEntity = entity;
    void viewer.flyTo(entity, { duration: 0.5 });
  }
}

document.querySelector<HTMLButtonElement>("#previous-event")?.addEventListener("click", () =>
  locateEvent(currentEventIndex - 1),
);
document.querySelector<HTMLButtonElement>("#next-event")?.addEventListener("click", () =>
  locateEvent(currentEventIndex + 1),
);

function clearLoadedRunVisuals(message = "No run loaded."): void {
  for (const entity of dynamicEntities) viewer.entities.remove(entity);
  dynamicEntities = [];
  loadedTrajectories = [];
  safetyEvents = [];
  eventsById.clear();
  vehicleEntities.clear();
  eventEntities.clear();
  currentEventIndex = -1;
  viewer.selectedEntity = undefined;
  eventPanel?.setAttribute("hidden", "");
  playback.setDuration(0);
  if (summaryPanel) {
    const empty = document.createElement("p");
    empty.textContent = message;
    summaryPanel.replaceChildren(empty);
  }
  if (comparison) comparison.replaceChildren();
  if (eventTable) {
    const row = document.createElement("tr");
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = "Load a completed run";
    eventTable.replaceChildren(row);
  }
  if (vehicleCount) vehicleCount.textContent = "—";
  if (selectedVehicle) selectedVehicle.textContent = "None";
  if (vehicleChart) vehicleChart.textContent = "Select a vehicle to inspect speed and acceleration.";
  if (runStatus) runStatus.textContent = message;
}

async function loadRun(runId: string, scenarioName: string): Promise<void> {
  if (runStatus) runStatus.textContent = `Loading ${scenarioName}…`;
  const [trajectories, events, timeseries, summary] = await Promise.all([
    fetchTrajectories(runId),
    fetchSafetyEvents(runId),
    fetchTimeSeries(runId),
    fetchSummary(runId),
  ]);
  if (summary.networkId) {
    try {
      const metadata = await fetchNetworkStatus(summary.networkId);
      await showNetwork(await fetchNetworkGeoJson(summary.networkId), metadata);
      applySelectedNetwork(metadata);
    } catch (error) {
      if (aoiStatus) {
        aoiStatus.value =
          error instanceof Error
            ? `Run network unavailable: ${error.message}`
            : "Run network unavailable";
      }
    }
  }
  for (const entity of dynamicEntities) viewer.entities.remove(entity);
  loadedTrajectories = trajectories;
  safetyEvents = events;
  eventsById.clear();
  for (const event of events) eventsById.set(event.eventId, event);
  currentEventIndex = -1;
  const duration = Math.max(
    ...trajectories.flatMap((item) => item.samples.map((sample) => sample.t)),
  );
  playback.setDuration(Number.isFinite(duration) ? duration : 0);
  const vehicles = renderVehicles(viewer, trajectories, playback);
  vehicleEntities = new Map(vehicles.map((entity) => [entity.id, entity]));
  eventEntities = renderSafetyEvents(viewer, events, playback, () => layerVisibility.events);
  dynamicEntities = [...vehicles, ...eventEntities.values()];
  applyLayerVisibility();
  renderTtcChart(chart ?? document.createElement("div"), timeseries[0], playback);
  if (eventTable) {
    eventTable.replaceChildren();
    events.forEach((event, index) => {
      const row = eventTable.insertRow();
      row.insertCell().textContent = event.startTime.toFixed(1);
      const typeCell = row.insertCell();
      const dot = document.createElement("span");
      dot.className = "sev-dot";
      dot.style.background = EVENT_COLORS[event.severity];
      dot.title = `${event.severity} · ${event.category}`;
      const label = document.createElement("span");
      label.textContent = humanizeEventType(event.type);
      typeCell.append(dot, label);
      row.insertCell().textContent = event.minimumTtc?.toFixed(2) ?? "—";
      const action = row.insertCell();
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Locate";
      button.setAttribute(
        "aria-label",
        `Locate ${event.severity} ${humanizeEventType(event.type)} event at ${event.startTime.toFixed(1)} seconds`,
      );
      button.addEventListener("click", () => locateEvent(index));
      action.append(button);
    });
  }
  if (summaryPanel) {
    const metrics: Array<[string, string]> = [
      [String(summary.completedVehicleCount), "completed vehicles"],
      [summary.meanTravelTime?.toFixed(1) ?? "—", "mean travel time (s)"],
      [summary.minimumObservedTtc?.toFixed(2) ?? "—", "minimum TTC (s)"],
      [summary.maximumObservedDrac?.toFixed(2) ?? "—", "maximum DRAC"],
      [String(summary.hardBrakingEvents), "hard braking"],
      [String(summary.emergencyBrakingEvents), "emergency braking"],
      [String(summary.ttcCriticalEvents), "critical TTC"],
      [String(summary.collisions), "collisions"],
    ];
    summaryPanel.replaceChildren(
      ...metrics.map(([value, label]) => {
        const metric = document.createElement("div");
        metric.className = "metric";
        const strong = document.createElement("strong");
        strong.textContent = value;
        const caption = document.createElement("span");
        caption.textContent = label;
        metric.append(strong, caption);
        return metric;
      }),
    );
  }
  if (runStatus) runStatus.textContent = `${scenarioName} · ${runId}`;
  if (locationStatus) {
    locationStatus.textContent = locationLabelForRun(scenarioName, summary.networkName);
  }
  if (vehicleCount) vehicleCount.textContent = String(trajectories.length);
}

viewer.selectedEntityChanged.addEventListener((entity) => {
  const id = typeof entity?.id === "string" ? entity.id : undefined;
  if (id?.startsWith("event-")) {
    const event = eventsById.get(id.slice("event-".length));
    if (event) openEventPanel(event);
    return;
  }
  if (selectedVehicle) selectedVehicle.textContent = id ?? "None";
  const trajectory = loadedTrajectories.find((item) => item.vehicleId === id);
  if (vehicleChart) renderVehicleChart(vehicleChart, trajectory, playback);
});

async function loadLatestRuns(): Promise<void> {
  const runs = await fetchRuns();
  const completed = runs.filter((run) => run.status === "completed");
  const newest = completed[0];
  if (!newest) {
    if (runStatus) runStatus.textContent = "No completed run yet";
    return;
  }
  await loadRun(newest.runId, newest.scenario.name);
  if (comparison && completed.length >= 2) {
    const [newestSummary, previousSummary] = await Promise.all([
      fetchSummary(completed[0]!.runId),
      fetchSummary(completed[1]!.runId),
    ]);
    comparison.textContent = `Compared with ${previousSummary.scenarioName}: ${newestSummary.ttcCriticalEvents - previousSummary.ttcCriticalEvents >= 0 ? "+" : ""}${newestSummary.ttcCriticalEvents - previousSummary.ttcCriticalEvents} critical TTC events; ${(newestSummary.minimumObservedTtc ?? 0) - (previousSummary.minimumObservedTtc ?? 0) >= 0 ? "+" : ""}${((newestSummary.minimumObservedTtc ?? 0) - (previousSummary.minimumObservedTtc ?? 0)).toFixed(2)} s minimum TTC.`;
  }
}

void loadLatestRuns().catch((error: unknown) => {
  if (runStatus) runStatus.textContent = error instanceof Error ? error.message : "Run unavailable";
});

const presetSelect = document.querySelector<HTMLSelectElement>("#preset");
const validationOutput = document.querySelector<HTMLOutputElement>("#validation");
let presets: Preset[] = [];
let activePreset: Preset | undefined;
const numericInput = (id: string): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing input ${id}`);
  return input;
};
const selectInput = (id: string): HTMLSelectElement => {
  const input = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!input) throw new Error(`Missing select ${id}`);
  return input;
};
const textInput = (id: string): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing input ${id}`);
  return input;
};

const aoiStatus = document.querySelector<HTMLOutputElement>("#aoi-status");
const locationSearchInput = document.querySelector<HTMLInputElement>("#location-search");
const locationSearchButton = document.querySelector<HTMLButtonElement>("#search-location");
const locationSuggestions = document.querySelector<HTMLElement>("#location-suggestions");

type LocationSuggestionItem =
  | { provider: "local-api"; result: LocationSearchResult }
  | { provider: "mapbox"; suggestion: MapboxLocationSuggestion };

let locationSearchResults: LocationSuggestionItem[] = [];
let activeLocationSuggestionIndex = -1;
let locationSearchDebounceId: number | undefined;
let locationSearchRequestId = 0;
const mapboxLocationSearchSession = globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function setAoiInputs(
  bbox: BoundingBox,
  name = textInput("aoi-name").value || "custom-aoi",
  drivingSide: "right" | "left" = "right",
): void {
  textInput("aoi-name").value = name;
  numericInput("aoi-west").value = bbox.west.toFixed(6);
  numericInput("aoi-south").value = bbox.south.toFixed(6);
  numericInput("aoi-east").value = bbox.east.toFixed(6);
  numericInput("aoi-north").value = bbox.north.toFixed(6);
  selectInput("driving-side").value = drivingSide;
}

function bboxAreaKm2(bbox: BoundingBox): number {
  const meanLat = ((bbox.south + bbox.north) / 2) * (Math.PI / 180);
  const width = (bbox.east - bbox.west) * 111.32 * Math.cos(meanLat);
  const height = (bbox.north - bbox.south) * 110.574;
  return width * height;
}

function readAoiNumber(id: string): number {
  const value = numericInput(id).value.trim();
  if (!value) throw new Error("AOI bbox fields are required");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("AOI bbox fields must be valid numbers");
  return parsed;
}

function currentAoiRequest(): NetworkBuildRequest {
  const bbox: BoundingBox = {
    west: readAoiNumber("aoi-west"),
    south: readAoiNumber("aoi-south"),
    east: readAoiNumber("aoi-east"),
    north: readAoiNumber("aoi-north"),
  };
  if (bbox.west >= bbox.east || bbox.south >= bbox.north) {
    throw new Error("AOI west/south must be less than east/north");
  }
  return {
    name: textInput("aoi-name").value.trim() || "custom-aoi",
    bbox,
    drivingSide: selectInput("driving-side").value === "left" ? "left" : "right",
  };
}

function networkStatusText(metadata: NetworkMetadata): string {
  const area = bboxAreaKm2(metadata.bbox).toFixed(3);
  const reused = metadata.cacheHit ? " · cache reused" : "";
  if (metadata.status !== "ready") {
    return `${metadata.status} · ${metadata.name} · ${area} km2`;
  }
  return `${metadata.name} ready · ${metadata.edgeCount} edges · ${metadata.laneCount} lanes · ${metadata.junctionCount} junctions · ${metadata.drivingSide}-hand${reused}`;
}

function locationNameFromSearch(result: LocationSearchResult): string {
  return (locationPrimaryLabel(result) || "searched-aoi").slice(0, 80);
}

function locationSuggestionPrimary(item: LocationSuggestionItem): string {
  return item.provider === "local-api"
    ? locationPrimaryLabel(item.result)
    : item.suggestion.name;
}

function locationSuggestionSecondary(item: LocationSuggestionItem): string {
  if (item.provider === "local-api") return locationSecondaryLabel(item.result);
  return item.suggestion.fullAddress ??
    item.suggestion.placeFormatted ??
    item.suggestion.featureType ??
    "Mapbox location";
}

function locationSuggestionTitle(item: LocationSuggestionItem): string {
  if (item.provider === "local-api") return item.result.displayName;
  return [item.suggestion.name, item.suggestion.placeFormatted].filter(Boolean).join(", ");
}

function mergeLocationSuggestions(
  localResults: LocationSearchResult[],
  remoteResults: LocationSuggestionItem[],
): LocationSuggestionItem[] {
  const merged: LocationSuggestionItem[] = localResults.map((result) => ({
    provider: "local-api",
    result,
  }));
  const seen = new Set(merged.map((item) => locationSuggestionPrimary(item).toLowerCase()));
  for (const item of remoteResults) {
    const label = locationSuggestionPrimary(item).toLowerCase();
    if (seen.has(label)) continue;
    seen.add(label);
    merged.push(item);
  }
  return merged.slice(0, 5);
}

function applyLocationSearchResult(result: LocationSearchResult): void {
  stopOrbit();
  selectedNetwork = undefined;
  selectedNetworkId = undefined;
  currentNetwork = undefined;
  mappedFeatureCount = undefined;
  clearLoadedRunVisuals("Build a network for the selected location.");
  clearNetworkLayers();
  setAoiInputs(
    result.bbox,
    locationNameFromSearch(result),
    selectInput("driving-side").value === "left" ? "left" : "right",
  );
  if (locationStatus) locationStatus.textContent = locationNameFromSearch(result);
  if (networkStatus) networkStatus.textContent = "Location selected; build the network";
  if (aoiStatus) {
    const area = result.bboxAreaKm2.toFixed(3);
    aoiStatus.value = result.bboxAdjusted
      ? `Search result adjusted to safe AOI · ${area} km2`
      : `Location found · ${area} km2`;
  }
  updateBackendActionState();
  flyTopToBbox(result.bbox);
}

function clearLocationAutocompleteDelay(): void {
  if (locationSearchDebounceId !== undefined) {
    window.clearTimeout(locationSearchDebounceId);
    locationSearchDebounceId = undefined;
  }
}

function setLocationSuggestionsExpanded(expanded: boolean): void {
  locationSearchInput?.setAttribute("aria-expanded", String(expanded));
}

function hideLocationSuggestions(): void {
  locationSuggestions?.replaceChildren();
  if (locationSuggestions) locationSuggestions.hidden = true;
  activeLocationSuggestionIndex = -1;
  locationSearchInput?.removeAttribute("aria-activedescendant");
  setLocationSuggestionsExpanded(false);
}

function setActiveLocationSuggestion(index: number): void {
  activeLocationSuggestionIndex = index;
  locationSuggestions
    ?.querySelectorAll<HTMLButtonElement>(".location-suggestion")
    .forEach((button, buttonIndex) => {
      const isActive = buttonIndex === index;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      if (isActive) locationSearchInput?.setAttribute("aria-activedescendant", button.id);
    });
  if (index < 0) locationSearchInput?.removeAttribute("aria-activedescendant");
}

async function chooseLocationSearchResult(index: number): Promise<void> {
  const item = locationSearchResults[index];
  if (!item) return;
  if (locationSearchInput) locationSearchInput.value = locationSuggestionPrimary(item);
  hideLocationSuggestions();
  if (item.provider === "local-api") {
    applyLocationSearchResult(item.result);
    return;
  }

  const token = getMapboxToken();
  if (!token) {
    if (aoiStatus) aoiStatus.value = "Mapbox token is missing, so public autocomplete cannot retrieve this location.";
    return;
  }
  if (aoiStatus) aoiStatus.value = `Opening ${item.suggestion.name}...`;
  try {
    const result = await retrieveMapboxLocationSuggestion(
      item.suggestion,
      token,
      mapboxLocationSearchSession,
    );
    applyLocationSearchResult(result);
    if (staticDashboardMode && aoiStatus) {
      aoiStatus.value = "Location selected. To build a SUMO network, open the localhost dashboard.";
    }
  } catch (error) {
    if (aoiStatus) {
      aoiStatus.value = error instanceof Error ? error.message : "Location retrieve failed";
    }
  }
}

function showLocationSuggestions(
  results: LocationSuggestionItem[],
  emptyMessage = "No matching location found.",
): void {
  if (!locationSuggestions) return;
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "location-suggestion-empty";
    empty.textContent = emptyMessage;
    locationSuggestions.replaceChildren(empty);
    locationSuggestions.hidden = false;
    activeLocationSuggestionIndex = -1;
    setLocationSuggestionsExpanded(true);
    return;
  }

  locationSuggestions.replaceChildren(
    ...results.map((result, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = `location-suggestion-${index}`;
      option.className = "location-suggestion";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.title = locationSuggestionTitle(result);

      const primary = document.createElement("span");
      primary.className = "location-suggestion-primary";
      primary.textContent = locationSuggestionPrimary(result);
      option.append(primary);

      const secondary = document.createElement("span");
      secondary.className = "location-suggestion-secondary";
      secondary.textContent = locationSuggestionSecondary(result);
      option.append(secondary);

      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => {
        void chooseLocationSearchResult(index);
      });
      return option;
    }),
  );
  locationSuggestions.hidden = false;
  setLocationSuggestionsExpanded(true);
  setActiveLocationSuggestion(0);
}

async function fetchLocationSuggestions(query: string, showSearchingMessage = false): Promise<void> {
  const requestId = ++locationSearchRequestId;
  if (showSearchingMessage && aoiStatus) aoiStatus.value = `Searching ${query}...`;
  try {
    const localResults = localLocationSuggestions(query);
    if (locationSearchMode === "pending") {
      locationSearchResults = mergeLocationSuggestions(localResults, []);
      showLocationSuggestions(locationSearchResults, "Search service is still starting.");
      if (aoiStatus) aoiStatus.value = "Checking search service...";
      return;
    }
    const token = getMapboxToken();
    const useStaticSearch = locationSearchMode === "static-pages";
    if (useStaticSearch && !token) {
      locationSearchResults = mergeLocationSuggestions(localResults, []);
      showLocationSuggestions(
        locationSearchResults,
        "Mapbox token is missing, so public autocomplete is unavailable. Use localhost for backend search.",
      );
      if (aoiStatus) {
        aoiStatus.value = locationSearchResults.length > 0
          ? "Choose a local suggestion. Online public autocomplete requires VITE_MAPBOX_TOKEN."
          : "Public autocomplete requires VITE_MAPBOX_TOKEN in GitHub Actions secrets.";
      }
      return;
    }
    const remoteResults: LocationSuggestionItem[] = useStaticSearch
      ? (
          await searchMapboxLocationSuggestions(
            query,
            token,
            mapboxLocationSearchSession,
          )
        ).map((suggestion) => ({ provider: "mapbox", suggestion }))
      : (await searchLocations(query)).map((result) => ({ provider: "local-api", result }));
    if (requestId !== locationSearchRequestId) return;
    const results = mergeLocationSuggestions(localResults, remoteResults);
    locationSearchResults = results;
    showLocationSuggestions(results);
    if (aoiStatus) {
      aoiStatus.value = results.length > 0
        ? useStaticSearch
          ? "Choose one Mapbox location suggestion. Network build requires localhost."
          : "Choose one location suggestion, then build the network."
        : "No location found.";
    }
  } catch (error) {
    if (requestId !== locationSearchRequestId) return;
    locationSearchResults = [];
    hideLocationSuggestions();
    if (aoiStatus) {
      aoiStatus.value = error instanceof Error ? error.message : "Location search failed";
    }
  }
}

async function runLocationSearch(): Promise<void> {
  const query = locationSearchInput?.value.trim() ?? "";
  if (!shouldSearchAutocomplete(query)) {
    hideLocationSuggestions();
    if (aoiStatus) {
      aoiStatus.value = `Enter at least ${LOCATION_AUTOCOMPLETE_MIN_LENGTH} characters to search.`;
    }
    return;
  }
  clearLocationAutocompleteDelay();
  if (locationSearchButton) locationSearchButton.disabled = true;
  try {
    await fetchLocationSuggestions(query, true);
  } finally {
    if (locationSearchButton) locationSearchButton.disabled = staticDashboardMode;
  }
}

function queueLocationAutocompleteSearch(): void {
  clearLocationAutocompleteDelay();
  const query = locationSearchInput?.value.trim() ?? "";
  locationSearchRequestId += 1;
  if (!shouldSearchAutocomplete(query)) {
    locationSearchResults = [];
    hideLocationSuggestions();
    return;
  }
  locationSearchDebounceId = window.setTimeout(() => {
    if (locationSearchMode === "pending") {
      queueLocationAutocompleteSearch();
      return;
    }
    void fetchLocationSuggestions(query);
  }, LOCATION_AUTOCOMPLETE_DEBOUNCE_MS);
}

locationSearchButton?.addEventListener("click", () => {
  void runLocationSearch();
});
locationSearchInput?.addEventListener("input", () => {
  queueLocationAutocompleteSearch();
});
locationSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !locationSuggestions?.hidden && locationSearchResults.length > 0) {
    event.preventDefault();
    setActiveLocationSuggestion(
      Math.min(activeLocationSuggestionIndex + 1, locationSearchResults.length - 1),
    );
    return;
  }
  if (event.key === "ArrowUp" && !locationSuggestions?.hidden && locationSearchResults.length > 0) {
    event.preventDefault();
    setActiveLocationSuggestion(Math.max(activeLocationSuggestionIndex - 1, 0));
    return;
  }
  if (event.key === "Escape") {
    hideLocationSuggestions();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!locationSuggestions?.hidden && activeLocationSuggestionIndex >= 0) {
    void chooseLocationSearchResult(activeLocationSuggestionIndex);
    return;
  }
  void runLocationSearch();
});
locationSearchInput?.addEventListener("focus", () => {
  const query = locationSearchInput.value.trim();
  if (locationSearchResults.length > 0 && shouldSearchAutocomplete(query)) {
    showLocationSuggestions(locationSearchResults);
  }
});
locationSearchInput?.addEventListener("blur", () => {
  window.setTimeout(() => hideLocationSuggestions(), 120);
});

function applySelectedNetwork(metadata: NetworkMetadata): void {
  selectedNetwork = metadata;
  selectedNetworkId = metadata.status === "ready" ? metadata.networkId : undefined;
  setAoiInputs(metadata.bbox, metadata.name, metadata.drivingSide);
  if (aoiStatus) aoiStatus.value = networkStatusText(metadata);
  if (locationStatus) locationStatus.textContent = metadata.name;
  mappedFeatureCount = metadata.status === "ready" ? mappedFeatureCount : undefined;
  updateNetworkStatus();
  updateBackendActionState();
}

function markAoiChanged(): void {
  if (!selectedNetwork && !selectedNetworkId) return;
  selectedNetwork = undefined;
  selectedNetworkId = undefined;
  clearLoadedRunVisuals("Build a network for the changed AOI.");
  if (aoiStatus) aoiStatus.value = "AOI changed. Build the network before running.";
  if (networkStatus) networkStatus.textContent = "AOI changed; build the selected network";
  if (locationStatus) locationStatus.textContent = textInput("aoi-name").value || "Custom AOI";
  updateBackendActionState();
}

for (const id of [
  "aoi-name",
  "driving-side",
  "aoi-west",
  "aoi-south",
  "aoi-east",
  "aoi-north",
]) {
  const control = document.querySelector(`#${id}`);
  control?.addEventListener("input", markAoiChanged);
  control?.addEventListener("change", markAoiChanged);
}

document.querySelector<HTMLButtonElement>("#use-current-view")?.addEventListener("click", () => {
  try {
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rectangle) throw new Error("Current map view is not a valid AOI");
    setAoiInputs(
      {
        west: Cesium.Math.toDegrees(rectangle.west),
        south: Cesium.Math.toDegrees(rectangle.south),
        east: Cesium.Math.toDegrees(rectangle.east),
        north: Cesium.Math.toDegrees(rectangle.north),
      },
      textInput("aoi-name").value || "current-view",
      selectInput("driving-side").value === "left" ? "left" : "right",
    );
    markAoiChanged();
    if (aoiStatus) {
      const area = bboxAreaKm2(currentAoiRequest().bbox).toFixed(3);
      aoiStatus.value = `Current view copied · ${area} km2`;
    }
  } catch (error) {
    if (aoiStatus) aoiStatus.value = error instanceof Error ? error.message : "AOI failed";
  }
});

document.querySelector<HTMLButtonElement>("#build-network")?.addEventListener("click", () => {
  void (async () => {
    const request = currentAoiRequest();
    selectedNetwork = undefined;
    selectedNetworkId = undefined;
    updateBackendActionState();
    if (aoiStatus) aoiStatus.value = `Submitting ${request.name}...`;
    let current = await createNetwork(request);
    applySelectedNetwork(current);
    while (!["ready", "failed"].includes(current.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      current = await fetchNetworkStatus(current.networkId);
      applySelectedNetwork(current);
    }
    if (current.status === "failed") throw new Error(current.message ?? "Network build failed");
    await showNetwork(await fetchNetworkGeoJson(current.networkId), current);
    applySelectedNetwork(current);
  })().catch((error: unknown) => {
    if (aoiStatus) aoiStatus.value = error instanceof Error ? error.message : "Network build failed";
    updateBackendActionState();
  });
});

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    const created: Record<string, unknown> = {};
    record[key] = created;
    return created;
  }
  return value as Record<string, unknown>;
}

function applyPreset(preset: Preset): void {
  activePreset = preset;
  const scenario = preset.scenario;
  const demand = nested(scenario, "demand");
  const safety = nested(scenario, "safety");
  const vehicle = nested(scenario, "vehicle");
  numericInput("duration").value = String(scenario.duration ?? 120);
  numericInput("seed").value = String(scenario.seed ?? 42);
  selectInput("demand-level").value = String(demand.level ?? "medium");
  numericInput("period").value = String(demand.period ?? 2);
  numericInput("warning-ttc").value = String(safety.warningTtc ?? 3);
  numericInput("critical-ttc").value = String(safety.criticalTtc ?? 1.5);
  selectInput("car-follow").value = String(vehicle.carFollowModel ?? "Krauss");
  numericInput("tau").value = String(vehicle.tau ?? 1);
  numericInput("decel").value = String(vehicle.decel ?? 4.5);
  numericInput("emergency-decel").value = String(vehicle.emergencyDecel ?? 9);
  numericInput("step-length").value = String(vehicle.stepLength ?? 0.1);
  if (validationOutput) validationOutput.value = preset.description;
}

function currentScenario(): Record<string, unknown> {
  if (!activePreset) throw new Error("Presets have not loaded");
  const scenario = structuredClone(activePreset.scenario);
  scenario.duration = Number(numericInput("duration").value);
  scenario.seed = Number(numericInput("seed").value);
  const demand = nested(scenario, "demand");
  demand.level = selectInput("demand-level").value;
  demand.period = Number(numericInput("period").value);
  const safety = nested(scenario, "safety");
  safety.warningTtc = Number(numericInput("warning-ttc").value);
  safety.criticalTtc = Number(numericInput("critical-ttc").value);
  const vehicle = nested(scenario, "vehicle");
  vehicle.carFollowModel = selectInput("car-follow").value;
  vehicle.tau = Number(numericInput("tau").value);
  vehicle.decel = Number(numericInput("decel").value);
  vehicle.emergencyDecel = Number(numericInput("emergency-decel").value);
  vehicle.stepLength = Number(numericInput("step-length").value);
  return scenario;
}

void fetchPresets()
  .then((loaded) => {
    presets = loaded;
    if (presetSelect) {
      presetSelect.replaceChildren(
        ...loaded.map((preset) => new Option(preset.name, preset.id)),
      );
      presetSelect.addEventListener("change", () => {
        const selected = presets.find((preset) => preset.id === presetSelect.value);
        if (selected) applyPreset(selected);
      });
    }
    if (loaded[0]) applyPreset(loaded[0]);
  })
  .catch((error: unknown) => {
    if (validationOutput) validationOutput.value = error instanceof Error ? error.message : "Presets unavailable";
  });

document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => {
  if (activePreset) applyPreset(activePreset);
});
document.querySelector<HTMLButtonElement>("#validate")?.addEventListener("click", () => {
  void validateScenario(currentScenario())
    .then((result) => {
      if (validationOutput) validationOutput.value = result.warnings.length ? result.warnings.join(" · ") : `Valid · ${result.checksum.slice(0, 12)}`;
    })
    .catch((error: unknown) => {
      if (validationOutput) validationOutput.value = error instanceof Error ? error.message : "Validation failed";
    });
});
document.querySelector<HTMLButtonElement>("#run")?.addEventListener("click", () => {
  void (async () => {
    if (!selectedNetworkId) {
      throw new Error("Build or select a ready AOI network before running a simulation");
    }
    const scenario = currentScenario();
    await validateScenario(scenario);
    const run = await createRun(scenario, selectedNetworkId);
    if (runStatus) runStatus.textContent = `${run.status} · ${run.runId}`;
    let current = run;
    while (!(["completed", "failed"] as string[]).includes(current.status)) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      current = await fetchRun(run.runId);
      if (runStatus) runStatus.textContent = `${current.status} · ${current.runId}`;
    }
    if (current.status === "failed") throw new Error(current.message ?? "Simulation failed");
    await loadRun(current.runId, current.scenario.name);
  })().catch((error: unknown) => {
    if (validationOutput) validationOutput.value = error instanceof Error ? error.message : "Run failed";
  });
});

document.querySelector<HTMLButtonElement>("#load-demo")?.addEventListener("click", () => {
  void (async () => {
    const demos = await fetchDemoRuns();
    const selected = demos.find((demo) => demo.id === activePreset?.id) ?? demos[0];
    if (!selected) throw new Error("No bundled demo runs are available");
    const run = await loadDemoRun(selected.id);
    await loadRun(run.runId, run.scenario.name);
    if (validationOutput) validationOutput.value = `${selected.title} loaded · ${selected.disclaimer}`;
  })().catch((error: unknown) => {
    if (validationOutput) validationOutput.value = error instanceof Error ? error.message : "Demo load failed";
  });
});

document.querySelector<HTMLButtonElement>("#load-local-data")?.addEventListener("click", () => {
  void (async () => {
    const datasets = await fetchLocalDatasets();
    const selected = datasets.find((dataset) => dataset.readyForPlayback);
    if (!selected) throw new Error("No playback-ready local SUMO dataset was found");
    if (validationOutput) validationOutput.value = `Importing ${selected.title}...`;
    const run = await importLocalDataset(selected.id);
    await loadRun(run.runId, run.scenario.name);
    if (validationOutput) validationOutput.value = `${selected.title} loaded from Data folder`;
  })().catch((error: unknown) => {
    if (validationOutput) validationOutput.value = error instanceof Error ? error.message : "Local import failed";
  });
});
