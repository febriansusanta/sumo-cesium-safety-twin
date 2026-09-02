# Code Structure Guide

This document explains how the repository is organized and how the main code paths fit
together. It is written for someone who wants to understand or modify the prototype without
reading every file first.

## Big Picture

The project has three main parts:

1. `api/`: the local FastAPI server. It validates scenarios, imports or runs SUMO data,
   parses outputs, and serves JSON to the browser.
2. `web/`: the CesiumJS dashboard. It draws the road network, vehicles, charts, controls
   and safety-event table.
3. `scripts/` and `pipeline/`: command-line helpers. They prepare dependencies, build
   networks, run simulations, import local data, export runs and start development servers.

Generated files are kept under `data/`. Your sibling `Data/` folder is treated as an input
source and is not modified by the app.

## Top-Level Folders

| Path | Purpose |
| --- | --- |
| `api/app/` | Python API application and SUMO processing logic. |
| `api/tests/` | Backend unit and API tests. |
| `web/src/` | Browser application written in strict TypeScript. |
| `web/tests/` | Frontend unit tests. |
| `pipeline/` | CLI pipeline for OSM download, network build, demand generation and simulation. |
| `scripts/` | User-facing commands such as bootstrap, doctor, dev, test and local-data import. |
| `scenarios/presets/` | YAML scenario presets shown in the dashboard. |
| `config/default.yaml` | Default project location, bounding box and project settings. |
| `data/` | Generated environment, network, demand and run outputs. |
| `demo/archives/` | Small prebuilt demo run archives. |
| `docs/` | Project documentation. |
| `outputs/` | Human deliverables, such as the explanatory PowerPoint. |

## Backend Structure

The backend is a FastAPI app in `api/app/`.

| File or Folder | Role |
| --- | --- |
| `api/app/main.py` | Defines HTTP endpoints such as health, network, scenarios, runs, demo runs and local-data imports. |
| `api/app/config.py` | Loads YAML and `.env` configuration and exposes public config to the browser. |
| `api/app/jobs.py` | Owns the in-process run queue. It creates run IDs, writes status files and executes one SUMO run at a time. |
| `api/app/models/` | Pydantic models for scenarios, runs, summaries, trajectories and safety events. |
| `api/app/services/` | The main business logic. Each service handles one domain area. |

### Important Services

| Service | What It Does |
| --- | --- |
| `osm_service.py` | Downloads and caches OSM XML for a small configured bounding box. |
| `network_service.py` | Runs `netconvert`, validates SUMO networks and exports network GeoJSON for Cesium. |
| `point_overlay_service.py` | Reads local WGS84 point shapefiles from `Data/sumo` and serves real/SUMO comparison points as GeoJSON. |
| `demand_service.py` | Runs `randomTrips.py` and routing tools to create synthetic vehicle demand. |
| `simulation_service.py` | Runs SUMO through `libsumo`, writes FCD, tripinfo, collision and SSM outputs, then creates summary JSON. |
| `coordinate_service.py` | Reads SUMO network projection metadata and converts between SUMO coordinates and WGS84 longitude/latitude. |
| `result_service.py` | Parses FCD trajectories into compact browser-friendly JSON. |
| `safety_service.py` | Parses SSM and collision outputs, classifies TTC severity and detects braking events from trajectories. |
| `local_data_service.py` | Scans the sibling `Data/` folder, imports existing SUMO outputs and creates completed local runs. |
| `archive_service.py` | Creates and imports portable ZIP archives for completed runs and demo runs. |
| `preset_service.py` | Loads YAML scenario presets for the API and dashboard. |
| `checksum_service.py` | Produces stable SHA-256 hashes for reproducibility. |

## Frontend Structure

The frontend is a framework-free TypeScript app in `web/src/`.

| File or Folder | Role |
| --- | --- |
| `web/src/main.ts` | Builds the dashboard UI, connects buttons to API calls, loads runs and synchronizes playback. |
| `web/src/api.ts` | Typed API client. It uses Zod schemas to validate JSON received from FastAPI. |
| `web/src/cesium/viewer.ts` | Creates the Cesium viewer and basemap options. |
| `web/src/cesium/network.ts` | Renders road/lane GeoJSON into Cesium. |
| `web/src/cesium/mapbox-buildings.ts` | Fetches Mapbox Streets v8 building vector tiles near the active network and renders them as Cesium extruded polygons. |
| `web/src/cesium/point-overlays.ts` | Renders observed and SUMO-derived point shapefile overlays as Cesium markers. |
| `web/src/cesium/vehicles.ts` | Creates and updates vehicle entities from trajectory samples. |
| `web/src/cesium/events.ts` | Renders TTC, braking and collision markers. |
| `web/src/simulation/playback-store.ts` | Shared playback clock used by map, charts and controls. |
| `web/src/charts/ttc-chart.ts` | Draws the TTC-over-time chart. |
| `web/src/charts/vehicle-chart.ts` | Draws selected-vehicle speed and acceleration. |
| `web/src/styles/main.css` | Dashboard layout and visual styling. |

The browser does not receive raw SUMO XML. It receives compact JSON through endpoints such
as `/api/runs/{run_id}/trajectories`, `/api/runs/{run_id}/safety-events` and
`/api/runs/{run_id}/summary`.

## Main Data Flows

### Flow A: Build and Run a New Scenario

1. User changes scenario settings in the dashboard.
2. `web/src/main.ts` calls `validateScenario()` or `createRun()` from `web/src/api.ts`.
3. `api/app/main.py` receives the request at `/api/scenarios/validate` or `/api/runs`.
4. `api/app/jobs.py` writes a queued run and the background worker starts it.
5. `api/app/services/simulation_service.py` generates demand, runs SUMO and writes raw XML.
6. `result_service.py` and `safety_service.py` convert raw outputs into compact JSON.
7. The dashboard polls the run status, then loads trajectories, events, time series and summary.

### Flow B: Import Your Existing Local SUMO Data

1. User clicks `Load Data folder` in the dashboard.
2. `web/src/main.ts` calls `/api/local-datasets` to find available local SUMO projects.
3. The frontend selects the first dataset with both a `.net.xml` network and FCD output.
4. `api/app/services/local_data_service.py` imports that dataset into `data/runs/`.
5. The importer copies the network, exports GeoJSON, converts local SUMO coordinates to WGS84
   and parses FCD, SSM, collisions and tripinfo where available.
6. The imported run appears like any completed run in the dashboard.

Your current preferred local import is the Nanke high-precision project. In the dashboard it
appears as a local run rather than the old NCKU demo location.

## Generated Data Layout

| Path | Contains |
| --- | --- |
| `data/environment.json` | Detected local environment, tool versions and simulation mode. |
| `data/raw/` | Cached OSM downloads. |
| `data/network/` | SUMO `.net.xml`, network GeoJSON, logs and metadata. |
| `data/demand/` | Generated trips and routed demand. |
| `data/runs/{run_id}/` | One completed, failed or queued run. |
| `data/cache/archives/` | ZIP exports of completed runs. |

Typical files inside a run directory:

| File | Meaning |
| --- | --- |
| `run.json` | Run ID, status, scenario name and checksum. |
| `effective-scenario.json` | Normalized scenario used for the run. |
| `trajectories.json` | Browser-ready vehicle samples with time, lon/lat, speed and acceleration. |
| `safety-events.json` | Parsed TTC, braking and collision events. |
| `timeseries.json` | Chart-ready time series, currently focused on TTC. |
| `summary.json` | Run-level metrics shown in the dashboard. |
| `manifest.json` | Checksums for reproducibility. |
| `source-files.json` | Relative source paths and checksums for imported local data. |
| `*.xml` | Raw SUMO outputs retained for audit. |

## HTTP Endpoints to Know

| Endpoint | Use |
| --- | --- |
| `GET /api/health` | Check whether the API is running. |
| `GET /api/config` | Read public project defaults and capabilities. |
| `GET /api/environment` | Read detected local tool versions and simulation mode. |
| `GET /api/network` | Load the prepared network GeoJSON. |
| `GET /api/point-overlays` | Load local `real_point` and `sumo_point` shapefile overlays from `Data/sumo`. |
| `GET /api/scenarios/presets` | Load scenario presets. |
| `POST /api/scenarios/validate` | Validate scenario settings without running SUMO. |
| `POST /api/runs` | Submit a new generated simulation run. |
| `GET /api/runs` | List known runs. |
| `GET /api/runs/{run_id}/status` | Poll run status. |
| `GET /api/runs/{run_id}/summary` | Load summary metrics. |
| `GET /api/runs/{run_id}/trajectories` | Load vehicle playback data. |
| `GET /api/runs/{run_id}/safety-events` | Load event markers and table rows. |
| `GET /api/local-datasets` | Discover local SUMO datasets from `Data/`. |
| `POST /api/local-datasets/{dataset_id}/import` | Import a local dataset as a completed run. |
| `GET /api/runs/{run_id}/archive` | Export a completed run ZIP. |

## User-Facing Scripts

| Script | Use |
| --- | --- |
| `scripts/doctor.py` | Check Python, Node, npm, Git, SUMO and related tools. |
| `scripts/bootstrap.py` | Create `.venv`, install Python/npm dependencies and prepare folders. |
| `scripts/dev.py` | Start FastAPI and Vite together for localhost development. |
| `scripts/test_all.py` | Run backend lint/tests, frontend tests, type checks and build. |
| `scripts/demo.py` | Prepare demo runs and print local URLs. |
| `scripts/import_local_data.py` | List or import existing SUMO outputs from `Data/`. |
| `scripts/export_run.py` | Create a portable ZIP for a completed run. |
| `scripts/clean.py` | Safely clean generated files with explicit choices. |

## Where to Change Common Things

| Goal | Start Here |
| --- | --- |
| Change the default map area | `config/default.yaml` and `docs/platforms/*.md` if setup assumptions change. |
| Add a scenario preset | Add a YAML file in `scenarios/presets/`. |
| Add a new scenario field | Update `api/app/models/scenario.py`, frontend controls in `web/src/main.ts`, and API schemas in `web/src/api.ts`. |
| Change run execution | `api/app/services/simulation_service.py`. |
| Change local-data import behavior | `api/app/services/local_data_service.py`. |
| Change trajectory parsing | `api/app/services/result_service.py`. |
| Change TTC or braking classification | `api/app/services/safety_service.py`. |
| Change the Cesium map | `web/src/cesium/`. |
| Change the dashboard layout | `web/src/main.ts` and `web/src/styles/main.css`. |
| Change API routes | `api/app/main.py`. |
| Change command-line behavior | `scripts/` or `pipeline/entrypoint.py`. |

## How to Trace the Two Main Buttons

### `Load Data folder`

`web/src/main.ts` button handler
-> `fetchLocalDatasets()` in `web/src/api.ts`
-> `GET /api/local-datasets` in `api/app/main.py`
-> `discover_local_datasets()` in `local_data_service.py`
-> `importLocalDataset()` in `web/src/api.ts`
-> `POST /api/local-datasets/{dataset_id}/import`
-> `import_local_dataset()` in `local_data_service.py`
-> `loadRun()` in `web/src/main.ts`
-> Cesium vehicles, events, charts and summary update.

### `Run simulation`

`web/src/main.ts` button handler
-> `validateScenario()` and `createRun()` in `web/src/api.ts`
-> `POST /api/runs` in `api/app/main.py`
-> `RunManager.create()` in `api/app/jobs.py`
-> background worker calls `execute_run()` in `simulation_service.py`
-> SUMO outputs and compact JSON are written to `data/runs/{run_id}/`
-> frontend polls status and calls `loadRun()` when complete.

## Testing Map

| Area | Tests |
| --- | --- |
| API health and run endpoints | `api/tests/test_health.py`, `api/tests/test_run_api.py` |
| Scenario validation | `api/tests/test_scenario.py` |
| Network and demand workflow | `api/tests/test_network_integration.py`, `api/tests/test_demand_and_run.py` |
| Local data import | `api/tests/test_local_data_service.py` |
| FCD and safety parsing | `api/tests/test_result_service.py`, `api/tests/test_safety_service.py` |
| Frontend API client | `web/tests/api.test.ts` |
| Basemap and Mapbox building helpers | `web/tests/basemap.test.ts`, `web/tests/mapbox-buildings.test.ts` |
| Playback logic | `web/tests/playback-store.test.ts` |
| Vehicle rendering performance logic | `web/tests/vehicle-performance.test.ts` |

Run the full suite with:

```powershell
.\.venv\Scripts\python.exe .\scripts\test_all.py
```

For a faster frontend-only check:

```powershell
cd web
npm run typecheck
npm test
```

## Important Design Rules

- Keep raw SUMO XML on disk; serve compact JSON to the browser.
- Keep machine-specific absolute paths out of exported archives.
- Do not require Docker, external databases, cloud infrastructure or Cesium ion.
- Treat generated demand and TTC results as exploratory and uncalibrated.
- Use SUMO projection metadata for coordinate conversion. Do not approximate lon/lat manually.
- Keep essential commands available through Python scripts for Windows compatibility.
