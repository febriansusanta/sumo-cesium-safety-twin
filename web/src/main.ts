import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles/main.css";
import * as Cesium from "cesium";
import {
  fetchHealth,
  fetchBuildings,
  fetchDemoRuns,
  fetchNetwork,
  fetchPresets,
  fetchRun,
  fetchRuns,
  fetchSafetyEvents,
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
import type { Preset, SafetyEvent, Trajectory } from "./api";
import { renderTtcChart } from "./charts/ttc-chart";
import { renderVehicleChart } from "./charts/vehicle-chart";
import { renderBuildings } from "./cesium/buildings";
import { EVENT_COLORS, humanizeEventType, renderSafetyEvents } from "./cesium/events";
import { renderNetwork } from "./cesium/network";
import { renderPointOverlays } from "./cesium/point-overlays";
import { highlightVehicle, renderVehicles } from "./cesium/vehicles";
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  basemapShowsBuildings,
  createViewer,
  setBasemap,
} from "./cesium/viewer";
import { PlaybackStore } from "./simulation/playback-store";

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
    <aside class="panel panel-left" aria-labelledby="scenario-heading">
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
      <div class="button-row"><button id="reset" type="button">Reset</button><button id="validate" type="button">Validate</button><button id="run" type="button">Run simulation</button><button id="load-demo" type="button">Load demo run</button><button id="load-local-data" type="button">Load Data folder</button></div>
      <output id="validation" class="form-message" aria-live="polite"></output>
      <dl>
        <div><dt>Location</dt><dd id="location-status">NCKU / Daxue / Shengli</dd></div>
        <div><dt>Network</dt><dd id="network-status">Loading…</dd></div>
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
        <div class="basemap-picker">
          <label for="basemap">Basemap</label>
          <select id="basemap" aria-label="Basemap style"></select>
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

const layerVisibility = {
  vehicles: true,
  events: true,
  network: true,
  buildings: basemapShowsBuildings(DEFAULT_BASEMAP_ID),
  realPoints: true,
  sumoPoints: true,
};
let networkDataSource: Cesium.GeoJsonDataSource | undefined;
let buildingDataSource: Cesium.GeoJsonDataSource | undefined;
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

function updateBuildingLegend(): void {
  if (buildingLegend) buildingLegend.hidden = !layerVisibility.buildings;
}

function applyLayerVisibility(): void {
  // Event markers gate their own `show` via a playback-driven callback that also
  // reads layerVisibility.events, so they are intentionally not set here.
  for (const entity of vehicleEntities.values()) entity.show = layerVisibility.vehicles;
  if (networkDataSource) networkDataSource.show = layerVisibility.network;
  if (buildingDataSource) buildingDataSource.show = layerVisibility.buildings;
  for (const entity of realPointEntities) entity.show = layerVisibility.realPoints;
  for (const entity of sumoPointEntities) entity.show = layerVisibility.sumoPoints;
}

function applyBasemapSelection(id: string): void {
  setBasemap(viewer, id);
  layerVisibility.buildings = basemapShowsBuildings(id);
  updateBuildingLegend();
  applyLayerVisibility();
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
void fetchHealth()
  .then((health) => {
    if (status) {
      status.textContent = `API ${health.version} connected`;
      status.dataset.state = "ok";
    }
  })
  .catch((error: unknown) => {
    if (status) {
      status.textContent = error instanceof Error ? error.message : "API unavailable";
      status.dataset.state = "error";
    }
  });

const networkStatus = document.querySelector<HTMLElement>("#network-status");
let mappedFeatureCount: number | undefined;
let buildingFeatureCount: number | undefined;

function updateNetworkStatus(): void {
  if (!networkStatus || mappedFeatureCount === undefined) return;
  networkStatus.textContent =
    buildingFeatureCount === undefined
      ? `${mappedFeatureCount} mapped features`
      : `${mappedFeatureCount} mapped features, ${buildingFeatureCount} buildings`;
}

void fetchNetwork()
  .then(async (network) => {
    networkDataSource = await renderNetwork(viewer, network);
    applyLayerVisibility();
    mappedFeatureCount = network.features.length;
    updateNetworkStatus();
  })
  .catch((error: unknown) => {
    if (networkStatus) {
      networkStatus.textContent = error instanceof Error ? error.message : "Network unavailable";
    }
  });

void fetchBuildings()
  .then(async (buildings) => {
    buildingDataSource = await renderBuildings(viewer, buildings);
    applyLayerVisibility();
    buildingFeatureCount = buildings.features.length;
    updateNetworkStatus();
  })
  .catch((error: unknown) => {
    console.warn(error instanceof Error ? error.message : "Building layer unavailable");
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

const defaultLocationLabel = "NCKU / Daxue / Shengli";
const locationStatus = document.querySelector<HTMLElement>("#location-status");
const runStatus = document.querySelector<HTMLElement>("#run-status");
const vehicleCount = document.querySelector<HTMLElement>("#vehicle-count");
const eventTable = document.querySelector<HTMLTableSectionElement>("#event-table");
const chart = document.querySelector<HTMLElement>("#ttc-chart");
const selectedVehicle = document.querySelector<HTMLElement>("#selected-vehicle");
const vehicleChart = document.querySelector<HTMLElement>("#vehicle-chart");
const summaryPanel = document.querySelector<HTMLElement>("#summary");
const comparison = document.querySelector<HTMLElement>("#comparison");

function locationLabelForRun(scenarioName: string): string {
  const localPrefix = "Local data:";
  return scenarioName.startsWith(localPrefix)
    ? scenarioName.slice(localPrefix.length).trim()
    : defaultLocationLabel;
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

async function loadRun(runId: string, scenarioName: string): Promise<void> {
  if (runStatus) runStatus.textContent = `Loading ${scenarioName}…`;
  const [trajectories, events, timeseries, summary] = await Promise.all([
    fetchTrajectories(runId),
    fetchSafetyEvents(runId),
    fetchTimeSeries(runId),
    fetchSummary(runId),
  ]);
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
  if (locationStatus) locationStatus.textContent = locationLabelForRun(scenarioName);
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
    const scenario = currentScenario();
    await validateScenario(scenario);
    const run = await createRun(scenario);
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
