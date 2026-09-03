import { z } from "zod";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const STATIC_FALLBACK_ENABLED = import.meta.env.VITE_STATIC_FALLBACK !== "false";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
});

export type Health = z.infer<typeof healthSchema>;

const geoJsonFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({ type: z.literal("Feature") }).passthrough()),
}).passthrough();

const networkSchema = geoJsonFeatureCollectionSchema;
const pointOverlaySchema = geoJsonFeatureCollectionSchema;

export type NetworkGeoJson = z.infer<typeof networkSchema>;
export type PointOverlayGeoJson = z.infer<typeof pointOverlaySchema>;

const bboxSchema = z.object({
  west: z.number(),
  south: z.number(),
  east: z.number(),
  north: z.number(),
});

const networkMetadataSchema = z.object({
  networkId: z.string(),
  name: z.string(),
  bbox: bboxSchema,
  drivingSide: z.enum(["right", "left"]),
  status: z.enum(["queued", "downloading", "building", "ready", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.string(),
  osmChecksum: z.string().nullable(),
  networkChecksum: z.string().nullable(),
  geojsonChecksum: z.string().nullable(),
  sumoVersion: z.string().nullable(),
  edgeCount: z.number(),
  laneCount: z.number(),
  junctionCount: z.number(),
  cacheHit: z.boolean(),
  message: z.string().nullable(),
  warnings: z.array(z.string()),
});

export type BoundingBox = z.infer<typeof bboxSchema>;
export type NetworkMetadata = z.infer<typeof networkMetadataSchema>;
export type NetworkBuildRequest = {
  name: string;
  bbox: BoundingBox;
  drivingSide: "right" | "left";
  forceRefresh?: boolean;
};

const locationSearchResultSchema = z.object({
  placeId: z.string(),
  displayName: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  bbox: bboxSchema,
  bboxAdjusted: z.boolean(),
  bboxAreaKm2: z.number(),
  category: z.string().nullable(),
  type: z.string().nullable(),
  osmType: z.string().nullable(),
  osmId: z.string().nullable(),
  source: z.string(),
});

export type LocationSearchResult = z.infer<typeof locationSearchResultSchema>;

const mapboxSuggestionSchema = z
  .object({
    mapbox_id: z.string(),
    name: z.string(),
    full_address: z.string().nullable().optional(),
    place_formatted: z.string().nullable().optional(),
    feature_type: z.string().nullable().optional(),
  })
  .passthrough();

const mapboxSuggestResponseSchema = z
  .object({
    suggestions: z.array(mapboxSuggestionSchema),
  })
  .passthrough();

const mapboxRetrieveResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z
        .object({
          type: z.literal("Feature"),
          geometry: z.object({
            type: z.literal("Point"),
            coordinates: z.tuple([z.number(), z.number()]),
          }),
          properties: z
            .object({
              name: z.string(),
              mapbox_id: z.string(),
              full_address: z.string().nullable().optional(),
              place_formatted: z.string().nullable().optional(),
              feature_type: z.string().nullable().optional(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface MapboxLocationSuggestion {
  mapboxId: string;
  name: string;
  fullAddress?: string;
  placeFormatted?: string;
  featureType?: string;
}

const runSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "preparing", "running", "processing", "completed", "failed"]),
  scenario: z.object({ name: z.string(), duration: z.number() }).passthrough(),
  scenarioChecksum: z.string(),
  networkId: z.string().nullable().optional(),
  networkName: z.string().nullable().optional(),
  networkChecksum: z.string().nullable().optional(),
  networkBbox: bboxSchema.nullable().optional(),
  drivingSide: z.enum(["right", "left"]).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  message: z.string().nullable(),
});

const trajectorySampleSchema = z.object({
  t: z.number(),
  longitude: z.number(),
  latitude: z.number(),
  height: z.number(),
  speed: z.number(),
  acceleration: z.number(),
  angle: z.number(),
  edgeId: z.string(),
  laneId: z.string(),
});

const trajectorySchema = z.object({
  vehicleId: z.string(),
  samples: z.array(trajectorySampleSchema).min(1),
});

export type Run = z.infer<typeof runSchema>;
export type Trajectory = z.infer<typeof trajectorySchema>;

const safetyEventSchema = z.object({
  eventId: z.string(),
  category: z.string(),
  type: z.string(),
  source: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  minimumTtc: z.number().nullable(),
  maximumDrac: z.number().nullable(),
  pet: z.number().nullable(),
  vehicleIds: z.array(z.string()),
  longitude: z.number().nullable(),
  latitude: z.number().nullable(),
  severity: z.enum(["normal", "warning", "critical"]),
  interventionId: z.string().nullable(),
});

const timeSeriesSchema = z.object({
  name: z.string(),
  unit: z.string(),
  points: z.array(
    z.object({ t: z.number(), value: z.number().nullable(), eventId: z.string().nullable() }),
  ),
});

export type SafetyEvent = z.infer<typeof safetyEventSchema>;
export type TimeSeries = z.infer<typeof timeSeriesSchema>;

const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  scenario: z.record(z.string(), z.unknown()),
  limitations: z.array(z.string()),
});

const validationSchema = z.object({
  normalized: z.record(z.string(), z.unknown()),
  errors: z.array(z.unknown()),
  warnings: z.array(z.string()),
  checksum: z.string(),
  disclaimer: z.string(),
});

const summarySchema = z
  .object({
    scenarioName: z.string(),
    networkId: z.string().nullable().optional(),
    networkName: z.string().nullable().optional(),
    networkChecksum: z.string().nullable().optional(),
    networkBbox: bboxSchema.nullable().optional(),
    drivingSide: z.enum(["right", "left"]).nullable().optional(),
    generatedVehicleCount: z.number(),
    completedVehicleCount: z.number(),
    meanTravelTime: z.number().nullable(),
    meanDelay: z.number().nullable(),
    hardBrakingEvents: z.number().default(0),
    emergencyBrakingEvents: z.number().default(0),
    ttcWarningEvents: z.number().default(0),
    ttcCriticalEvents: z.number().default(0),
    minimumObservedTtc: z.number().nullable().default(null),
    maximumObservedDrac: z.number().nullable().default(null),
    collisions: z.number(),
    teleports: z.number(),
    warnings: z.array(z.string()),
  })
  .passthrough();

export type Preset = z.infer<typeof presetSchema>;
export type RunSummary = z.infer<typeof summarySchema>;

const demoSchema = z.object({
  id: z.string(),
  title: z.string(),
  file: z.string(),
  sha256: z.string(),
  disclaimer: z.string(),
});

export type DemoRun = z.infer<typeof demoSchema>;

const localDatasetSchema = z.object({
  id: z.string(),
  title: z.string(),
  relativePath: z.string(),
  readyForPlayback: z.boolean(),
  hasNetwork: z.boolean(),
  hasRoutes: z.boolean(),
  hasFcd: z.boolean(),
  hasSsm: z.boolean(),
  hasCollisions: z.boolean(),
  hasTripinfo: z.boolean(),
});

export type LocalDataset = z.infer<typeof localDatasetSchema>;

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function staticUrls(path: string): string[] {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const baseUrl = `${base}static-data/${path}`;
  const rootUrl = `/static-data/${path}`;
  return baseUrl === rootUrl ? [baseUrl] : [baseUrl, rootUrl];
}

function canUseStaticFallback(fetcher: typeof fetch, fallbackPath?: string): boolean {
  return fetcher === fetch && STATIC_FALLBACK_ENABLED && fallbackPath !== undefined;
}

async function fetchJson<T>(
  path: string,
  label: string,
  schema: z.ZodType<T>,
  fetcher: typeof fetch,
  fallbackPath?: string,
): Promise<T> {
  try {
    const response = await fetcher(apiUrl(path));
    if (response.ok) return schema.parse(await response.json());
    if (!canUseStaticFallback(fetcher, fallbackPath)) {
      throw new Error(`${label} request failed (${response.status})`);
    }
  } catch (error) {
    if (!canUseStaticFallback(fetcher, fallbackPath)) throw error;
  }

  let fallbackError: unknown;
  for (const candidate of staticUrls(fallbackPath!)) {
    try {
      const fallbackResponse = await fetcher(candidate);
      if (!fallbackResponse.ok) {
        throw new Error(`${label} static fallback failed (${fallbackResponse.status})`);
      }
      return schema.parse(await fallbackResponse.json());
    } catch (error) {
      fallbackError = error;
    }
  }
  if (fallbackError instanceof Error) {
    throw new Error(`${label} static fallback failed: ${fallbackError.message}`);
  }
  throw new Error(`${label} static fallback failed`);
}

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<Health> {
  return fetchJson("/api/health", "API health", healthSchema, fetcher, "health.json");
}

export async function fetchNetwork(fetcher: typeof fetch = fetch): Promise<NetworkGeoJson> {
  return fetchJson("/api/network", "Network", networkSchema, fetcher, "network.geojson");
}

export async function createNetwork(
  payload: NetworkBuildRequest,
  fetcher: typeof fetch = fetch,
): Promise<NetworkMetadata> {
  const response = await fetcher(apiUrl("/api/networks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Network build request failed (${response.status})`);
  return networkMetadataSchema.parse(await response.json());
}

export async function searchLocations(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<LocationSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: "5" });
  return fetchJson(
    `/api/locations/search?${params.toString()}`,
    "Location search",
    z.array(locationSearchResultSchema),
    fetcher,
  );
}

function mapboxUrl(path: string, params: URLSearchParams): string {
  return `https://api.mapbox.com/search/searchbox/v1/${path}?${params.toString()}`;
}

function centeredBbox(longitude: number, latitude: number, halfSideKm = 0.4): BoundingBox {
  const latitudeDelta = halfSideKm / 110.574;
  const longitudeDelta = halfSideKm / (111.32 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
  return {
    west: Math.max(-180, longitude - longitudeDelta),
    south: Math.max(-90, latitude - latitudeDelta),
    east: Math.min(180, longitude + longitudeDelta),
    north: Math.min(90, latitude + latitudeDelta),
  };
}

function bboxAreaKm2(bbox: BoundingBox): number {
  const meanLat = ((bbox.south + bbox.north) / 2) * (Math.PI / 180);
  const width = (bbox.east - bbox.west) * 111.32 * Math.cos(meanLat);
  const height = (bbox.north - bbox.south) * 110.574;
  return width * height;
}

export async function searchMapboxLocationSuggestions(
  query: string,
  accessToken: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
): Promise<MapboxLocationSuggestion[]> {
  if (!accessToken.trim()) throw new Error("Mapbox token is not configured");
  const params = new URLSearchParams({
    q: query,
    access_token: accessToken,
    session_token: sessionToken,
    limit: "5",
    language: "en,id,zh-Hant",
    proximity: "ip",
    types: "poi,address,street,neighborhood,locality,place,district",
  });
  const response = await fetcher(mapboxUrl("suggest", params));
  if (!response.ok) throw new Error(`Mapbox location suggestion failed (${response.status})`);
  const payload = mapboxSuggestResponseSchema.parse(await response.json());
  return payload.suggestions.map((suggestion) => ({
    mapboxId: suggestion.mapbox_id,
    name: suggestion.name,
    fullAddress: suggestion.full_address ?? undefined,
    placeFormatted: suggestion.place_formatted ?? undefined,
    featureType: suggestion.feature_type ?? undefined,
  }));
}

export async function retrieveMapboxLocationSuggestion(
  suggestion: MapboxLocationSuggestion,
  accessToken: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
): Promise<LocationSearchResult> {
  if (!accessToken.trim()) throw new Error("Mapbox token is not configured");
  const params = new URLSearchParams({
    access_token: accessToken,
    session_token: sessionToken,
    language: "en,id,zh-Hant",
  });
  const response = await fetcher(
    mapboxUrl(`retrieve/${encodeURIComponent(suggestion.mapboxId)}`, params),
  );
  if (!response.ok) throw new Error(`Mapbox location retrieve failed (${response.status})`);
  const payload = mapboxRetrieveResponseSchema.parse(await response.json());
  const feature = payload.features[0];
  if (!feature) throw new Error("Mapbox location retrieve returned no feature");
  const [longitude, latitude] = feature.geometry.coordinates;
  const properties = feature.properties;
  const bbox = centeredBbox(longitude, latitude);
  const placeText = properties.full_address ?? properties.place_formatted;
  const displayName = [properties.name, placeText].filter(Boolean).join(", ") || properties.name;

  return {
    placeId: properties.mapbox_id,
    displayName,
    longitude,
    latitude,
    bbox,
    bboxAdjusted: true,
    bboxAreaKm2: bboxAreaKm2(bbox),
    category: "mapbox",
    type: properties.feature_type ?? suggestion.featureType ?? null,
    osmType: null,
    osmId: null,
    source: "Mapbox Search Box",
  };
}

export async function fetchNetworks(fetcher: typeof fetch = fetch): Promise<NetworkMetadata[]> {
  return fetchJson("/api/networks", "Network registry", z.array(networkMetadataSchema), fetcher);
}

export async function fetchNetworkStatus(
  networkId: string,
  fetcher: typeof fetch = fetch,
): Promise<NetworkMetadata> {
  return fetchJson(
    `/api/networks/${encodeURIComponent(networkId)}/status`,
    "Network status",
    networkMetadataSchema,
    fetcher,
  );
}

export async function fetchNetworkGeoJson(
  networkId: string,
  fetcher: typeof fetch = fetch,
): Promise<NetworkGeoJson> {
  return fetchJson(
    `/api/networks/${encodeURIComponent(networkId)}/geojson`,
    "Network GeoJSON",
    networkSchema,
    fetcher,
  );
}

export async function fetchPointOverlays(
  fetcher: typeof fetch = fetch,
): Promise<PointOverlayGeoJson> {
  return fetchJson(
    "/api/point-overlays",
    "Point-overlay",
    pointOverlaySchema,
    fetcher,
    "point-overlays.geojson",
  );
}

export async function fetchRuns(fetcher: typeof fetch = fetch): Promise<Run[]> {
  return fetchJson("/api/runs", "Run", z.array(runSchema), fetcher, "runs.json");
}

export async function fetchTrajectories(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<Trajectory[]> {
  const encodedRunId = encodeURIComponent(runId);
  return fetchJson(
    `/api/runs/${encodedRunId}/trajectories`,
    "Trajectory",
    z.array(trajectorySchema),
    fetcher,
    `runs/${encodedRunId}/trajectories.json`,
  );
}

export async function fetchSafetyEvents(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<SafetyEvent[]> {
  const encodedRunId = encodeURIComponent(runId);
  return fetchJson(
    `/api/runs/${encodedRunId}/safety-events`,
    "Safety-event",
    z.array(safetyEventSchema),
    fetcher,
    `runs/${encodedRunId}/safety-events.json`,
  );
}

export async function fetchTimeSeries(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<TimeSeries[]> {
  const encodedRunId = encodeURIComponent(runId);
  return fetchJson(
    `/api/runs/${encodedRunId}/timeseries`,
    "Timeseries",
    z.array(timeSeriesSchema),
    fetcher,
    `runs/${encodedRunId}/timeseries.json`,
  );
}

export async function fetchPresets(fetcher: typeof fetch = fetch): Promise<Preset[]> {
  return fetchJson(
    "/api/scenarios/presets",
    "Preset",
    z.array(presetSchema),
    fetcher,
    "presets.json",
  );
}

export async function validateScenario(
  scenario: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<z.infer<typeof validationSchema>> {
  const response = await fetcher(apiUrl("/api/scenarios/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
  });
  if (!response.ok) throw new Error(`Scenario validation failed (${response.status})`);
  return validationSchema.parse(await response.json());
}

export async function createRun(
  scenario: Record<string, unknown>,
  networkIdOrFetcher?: string | typeof fetch,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const networkId = typeof networkIdOrFetcher === "string" ? networkIdOrFetcher : undefined;
  const effectiveFetcher = typeof networkIdOrFetcher === "function" ? networkIdOrFetcher : fetcher;
  const body = networkId ? { networkId, scenario } : scenario;
  const response = await effectiveFetcher(apiUrl("/api/runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status !== 202) throw new Error(`Run submission failed (${response.status})`);
  return runSchema.parse(await response.json());
}

export async function fetchRun(runId: string, fetcher: typeof fetch = fetch): Promise<Run> {
  const encodedRunId = encodeURIComponent(runId);
  return fetchJson(
    `/api/runs/${encodedRunId}/status`,
    "Run status",
    runSchema,
    fetcher,
    `runs/${encodedRunId}/run.json`,
  );
}

export async function fetchSummary(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<RunSummary> {
  const encodedRunId = encodeURIComponent(runId);
  return fetchJson(
    `/api/runs/${encodedRunId}/summary`,
    "Summary",
    summarySchema,
    fetcher,
    `runs/${encodedRunId}/summary.json`,
  );
}

export async function fetchDemoRuns(fetcher: typeof fetch = fetch): Promise<DemoRun[]> {
  return fetchJson("/api/demo-runs", "Demo-run", z.array(demoSchema), fetcher, "demo-runs.json");
}

export async function loadDemoRun(
  demoId: string,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const response = await fetcher(apiUrl(`/api/demo-runs/${encodeURIComponent(demoId)}/load`), {
    method: "POST",
  });
  if (!response.ok) throw new Error(`Demo load failed (${response.status})`);
  return runSchema.parse(await response.json());
}

export async function fetchLocalDatasets(
  fetcher: typeof fetch = fetch,
): Promise<LocalDataset[]> {
  return fetchJson(
    "/api/local-datasets",
    "Local dataset",
    z.array(localDatasetSchema),
    fetcher,
    "local-datasets.json",
  );
}

export async function importLocalDataset(
  datasetId: string,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const response = await fetcher(
    apiUrl(`/api/local-datasets/${encodeURIComponent(datasetId)}/import`),
    { method: "POST" },
  );
  if (!response.ok) throw new Error(`Local dataset import failed (${response.status})`);
  return runSchema.parse(await response.json());
}
