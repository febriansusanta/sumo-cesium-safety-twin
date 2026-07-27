import { z } from "zod";

const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
});

export type Health = z.infer<typeof healthSchema>;

const networkSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({ type: z.literal("Feature") }).passthrough()),
});

export type NetworkGeoJson = z.infer<typeof networkSchema>;

const runSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "preparing", "running", "processing", "completed", "failed"]),
  scenario: z.object({ name: z.string(), duration: z.number() }).passthrough(),
  scenarioChecksum: z.string(),
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

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<Health> {
  const response = await fetcher("/api/health");
  if (!response.ok) throw new Error(`API health request failed (${response.status})`);
  return healthSchema.parse(await response.json());
}

export async function fetchNetwork(fetcher: typeof fetch = fetch): Promise<NetworkGeoJson> {
  const response = await fetcher("/api/network");
  if (!response.ok) throw new Error(`Network request failed (${response.status})`);
  return networkSchema.parse(await response.json());
}

export async function fetchRuns(fetcher: typeof fetch = fetch): Promise<Run[]> {
  const response = await fetcher("/api/runs");
  if (!response.ok) throw new Error(`Run request failed (${response.status})`);
  return z.array(runSchema).parse(await response.json());
}

export async function fetchTrajectories(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<Trajectory[]> {
  const response = await fetcher(`/api/runs/${encodeURIComponent(runId)}/trajectories`);
  if (!response.ok) throw new Error(`Trajectory request failed (${response.status})`);
  return z.array(trajectorySchema).parse(await response.json());
}

export async function fetchSafetyEvents(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<SafetyEvent[]> {
  const response = await fetcher(`/api/runs/${encodeURIComponent(runId)}/safety-events`);
  if (!response.ok) throw new Error(`Safety-event request failed (${response.status})`);
  return z.array(safetyEventSchema).parse(await response.json());
}

export async function fetchTimeSeries(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<TimeSeries[]> {
  const response = await fetcher(`/api/runs/${encodeURIComponent(runId)}/timeseries`);
  if (!response.ok) throw new Error(`Timeseries request failed (${response.status})`);
  return z.array(timeSeriesSchema).parse(await response.json());
}

export async function fetchPresets(fetcher: typeof fetch = fetch): Promise<Preset[]> {
  const response = await fetcher("/api/scenarios/presets");
  if (!response.ok) throw new Error(`Preset request failed (${response.status})`);
  return z.array(presetSchema).parse(await response.json());
}

export async function validateScenario(
  scenario: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<z.infer<typeof validationSchema>> {
  const response = await fetcher("/api/scenarios/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
  });
  if (!response.ok) throw new Error(`Scenario validation failed (${response.status})`);
  return validationSchema.parse(await response.json());
}

export async function createRun(
  scenario: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const response = await fetcher("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
  });
  if (response.status !== 202) throw new Error(`Run submission failed (${response.status})`);
  return runSchema.parse(await response.json());
}

export async function fetchRun(runId: string, fetcher: typeof fetch = fetch): Promise<Run> {
  const response = await fetcher(`/api/runs/${encodeURIComponent(runId)}/status`);
  if (!response.ok) throw new Error(`Run status failed (${response.status})`);
  return runSchema.parse(await response.json());
}

export async function fetchSummary(
  runId: string,
  fetcher: typeof fetch = fetch,
): Promise<RunSummary> {
  const response = await fetcher(`/api/runs/${encodeURIComponent(runId)}/summary`);
  if (!response.ok) throw new Error(`Summary request failed (${response.status})`);
  return summarySchema.parse(await response.json());
}

export async function fetchDemoRuns(fetcher: typeof fetch = fetch): Promise<DemoRun[]> {
  const response = await fetcher("/api/demo-runs");
  if (!response.ok) throw new Error(`Demo-run request failed (${response.status})`);
  return z.array(demoSchema).parse(await response.json());
}

export async function loadDemoRun(
  demoId: string,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const response = await fetcher(`/api/demo-runs/${encodeURIComponent(demoId)}/load`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`Demo load failed (${response.status})`);
  return runSchema.parse(await response.json());
}

export async function fetchLocalDatasets(
  fetcher: typeof fetch = fetch,
): Promise<LocalDataset[]> {
  const response = await fetcher("/api/local-datasets");
  if (!response.ok) throw new Error(`Local dataset request failed (${response.status})`);
  return z.array(localDatasetSchema).parse(await response.json());
}

export async function importLocalDataset(
  datasetId: string,
  fetcher: typeof fetch = fetch,
): Promise<Run> {
  const response = await fetcher(
    `/api/local-datasets/${encodeURIComponent(datasetId)}/import`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(`Local dataset import failed (${response.status})`);
  return runSchema.parse(await response.json());
}
