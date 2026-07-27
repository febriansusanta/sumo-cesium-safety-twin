# Architecture

## Purpose and constraints

This repository is a host-native, reproducible traffic-safety demonstrator. OpenStreetMap
provides road geometry, Eclipse SUMO produces synthetic microscopic traffic, FastAPI
orchestrates completed simulations, and CesiumJS provides spatial playback. It uses no
containers, database, cloud service or Cesium ion token.

The model is exploratory, synthetic and uncalibrated. Visual realism is not evidence of
traffic-model validity.

## Local runtime

`scripts/bootstrap.py` creates the repository-root `.venv`, synchronises the pinned Python
lock, installs npm packages from `package-lock.json`, and runs the environment doctor. The
doctor resolves SUMO in this order: explicit environment variables, `SUMO_HOME`, the
project environment, PATH, then conservative platform locations. On the tested Windows
host no system SUMO installation exists, so the selected mode is the pinned SUMO 1.27.1
and libsumo wheels inside `.venv`.

`scripts/dev.py` starts Uvicorn and Vite on loopback interfaces, prefixes their logs, checks
port availability and terminates both process trees on interruption. Vite proxies `/api`
to FastAPI, matching the eventual single-origin production contract.

## Components and data flow

1. A validated location and bounding box are read from YAML with environment overrides.
2. The pipeline downloads and caches OSM XML from the direct map API, then invokes
   `netconvert` using argument arrays. The network cache key includes OSM content, SUMO
   version, conversion options and geographic clipping boundary.
3. `randomTrips.py` creates deterministic passenger demand and routed vehicles.
4. A single in-process worker runs one libsumo simulation at a time.
5. Trajectory subscriptions, FCD, trip information, collision logs and SSM XML are retained.
6. Projection metadata and PyProj convert local SUMO positions to WGS84.
7. Parsers write compact JSON results; raw SUMO XML is never sent to the browser.
8. FastAPI exposes completed-run resources and Cesium replays them offline.

An alternate local-data branch scans the sibling `Data` folder for existing SUMO project
directories. Playback-ready imports reuse the same result contract by copying the selected
network, exporting network GeoJSON, parsing FCD trajectories, transforming local SUMO
coordinates to WGS84, parsing SSM/collision outputs where available, and writing a
completed run directory under `data/runs/`.

The job queue persists each state transition atomically as JSON. Its single worker builds
explicit vehicle types and routed demand, then executes libsumo in a background thread so
the HTTP event loop stays responsive. An interrupted job is marked failed on restart with
a recoverable message. Raw files and summaries live in isolated run directories; no
database or external queue is involved.

Network GeoJSON is derived lane-by-lane with `sumolib`; every feature preserves edge and
lane identifiers. Coordinate conversion parses `netOffset`, `convBoundary`, `origBoundary`
and `projParameter` from the generated network, then applies an always-XY PyProj transform.

## Source and generated data

Application source, scenario definitions and automation are versioned. OSM downloads,
networks, demand and runs remain under separate `data/` subdirectories and are ignored by
Git. `data/environment.json` records local versions and absolute tool paths but is never
committed or exported.

## Reproducibility

Canonical sorted JSON and SHA-256 identify location, network options, demand and effective
scenario inputs. Every run retains inputs, tool versions, logs and outputs. Runtime
timestamps and unique run IDs are metadata excluded from scenario checksums.

## Browser architecture

The framework-free strict TypeScript client uses a single shared playback state. Cesium is
the primary spatial view; TTC, vehicle traces and event counts are linked supporting views.
External API JSON is validated with Zod. OpenStreetMap imagery is optional; an ellipsoid
and generated road overlay keep the application usable when imagery is unavailable.

FCD is generated directly in geographic coordinates from SUMO's retained projection and
parsed incrementally to bound processor memory. Compact trajectories are sorted by vehicle
ID and contain stable sample order. The browser keeps one entity per vehicle; callback
positions interpolate between adjacent samples using the single playback store shared by
the controls and Cesium scene.

Every simulated passenger vehicle receives the SSM device. Its measure and threshold lists
are generated in the same order, with trajectories and geographic conflict points retained.
The safety parser preserves undefined values as null and deduplicates only reciprocal events
for the same vehicle pair, encounter type and overlapping time. Event markers, the table and
the minimal TTC time-series view all navigate through the shared playback store.

Intervention demand contains named lead and follower vehicles sharing the longest suitable
generated route. A libsumo preparation pass resolves the first established following state
after the requested trigger, excluding insertion margins and internal junction lanes. The
measured pass repeats identical inputs and applies `setAcceleration`; the command record and
FCD-observed acceleration remain separate. Braking classifications use measured samples.
