# SUMO–Cesium Traffic-Safety Digital Twin

A host-native demonstrator connecting an OpenStreetMap-derived Eclipse SUMO simulation to
a CesiumJS dashboard. Demand, driver behaviour and safety results are **synthetic and
uncalibrated** and must not be used for operational road-safety decisions.

## Architecture

Portable Python scripts manage a repository-root virtual environment and the local SUMO,
FastAPI and Vite processes. Generated source data, networks, demand and runs are separated
under `data/`. Completed runs are converted from SUMO XML into compact JSON before Cesium
playback. There are no containers, virtual machines, databases, cloud services or private
map tokens.

For a practical map of the codebase, see [Code structure guide](docs/code-structure.md).
For a plain-language explanation of the updated dashboard data, see
[Dashboard data guide](DASHBOARD_DATA_GUIDE.md).
For saved external map references, see [Reference links](docs/reference-links.md).

## Supported systems and prerequisites

- Windows 11 with PowerShell (tested: build 26200 x64)
- Current Linux distributions and macOS, subject to SUMO/libsumo availability
- Python 3.12 or 3.13
- Node.js 22 or newer with npm
- Git

SUMO may be installed globally, or bootstrap can use the pinned project-local SUMO 1.27.1
fallback. See [Windows](docs/platforms/windows.md), [Linux](docs/platforms/linux.md) and
[macOS](docs/platforms/macos.md) guidance.

## Quick start

```powershell
python .\scripts\doctor.py
python .\scripts\bootstrap.py
python .\scripts\dev.py
```

The pre-bootstrap doctor intentionally exits non-zero when SUMO is unavailable. Bootstrap
creates `.venv`, installs locked Python and npm dependencies without global changes, creates
`.env` when missing, and reruns the doctor. Open:

- Dashboard: <http://127.0.0.1:5173>
- API health: <http://127.0.0.1:8000/api/health>
- OpenAPI: <http://127.0.0.1:8000/docs>

Press Ctrl+C in the development process to terminate both Uvicorn and Vite.

## Commands

```text
python scripts/doctor.py     inspect local dependencies and selected SUMO mode
python scripts/bootstrap.py  prepare the idempotent local environment
python scripts/dev.py        start API and web processes
python scripts/test_all.py   run lint, tests, type checks and the web build
python scripts/demo.py       prepare demo runs (available after simulation phases)
python scripts/clean.py      list explicit generated-data cleanup choices
python scripts/import_local_data.py --list
                             list SUMO projects in the sibling Data folder
python scripts/import_local_data.py
                             import the best playback-ready local SUMO run
python scripts/export_run.py RUN_ID
                             export a completed run archive
python -m pipeline.entrypoint network  download/cache OSM and build/validate the network
python -m pipeline.entrypoint demand   generate deterministic routed baseline demand
python -m pipeline.entrypoint run      execute a baseline run through libsumo
```

GNU Make is optional and merely wraps these Python commands.

On Windows, every delivery task is available without Make:

```powershell
.\scripts\task.ps1 setup       # bootstrap pinned local tools
.\scripts\task.ps1 build       # bootstrap and production web build
.\scripts\task.ps1 up          # foreground API + dashboard
.\scripts\task.ps1 down        # stop a matching project dev process
.\scripts\task.ps1 reset       # clear generated data and bootstrap
.\scripts\task.ps1 test        # complete lint/test/build suite
.\scripts\task.ps1 lint
.\scripts\task.ps1 demo        # rebuild bundled baseline/intervention archives
.\scripts\task.ps1 clean-runs
.\scripts\task.ps1 rebuild-network
.\scripts\task.ps1 smoke
```

## Configuration

The default 0.06 km² extent covers Daxue Road and Shengli Road beside National Cheng Kung
University in Tainan. Edit `config/default.yaml` or `.env` for supported overrides. Default
services bind only to `127.0.0.1`; change `API_PORT` and `WEB_PORT` in `.env` if required.

The default dashboard basemap uses the NLSC Taiwan `EMAP` WMTS service. Optional
OpenStreetMap/CARTO/Esri basemaps remain available in the basemap picker for visual
comparison; each layer keeps its own attribution in Cesium.
The dashboard also includes a token-free 3D building context layer. OSM building footprints
are used when available; otherwise the API generates deterministic visual blocks from the
active network bounds.

## Using the local Data folder

This checkout can also use the sibling `../Data` folder instead of downloading a fresh OSM
area. The importer scans SUMO project directories that contain `.sumocfg` and `.net.xml`
files, then prefers runs that already include FCD playback output. In the current local
folder, `Data\Nanke\project\高精` is the preferred first import because it includes a
network, routes, FCD trajectories, SSM output, tripinfo and collision output.

```powershell
.\.venv\Scripts\python.exe .\scripts\import_local_data.py --list
.\.venv\Scripts\python.exe .\scripts\import_local_data.py
```

The dashboard also has a `Load Data folder` action. Imported runs are converted into the
same compact JSON format as generated runs, and local SUMO coordinates are transformed to
WGS84 using the network projection metadata. The importer records source checksums and
relative paths in each run directory without embedding machine-specific absolute paths.

## Phase 0 verification

Verified on the Windows environment documented above:

- the pre-bootstrap doctor failed clearly for missing SUMO;
- bootstrap created root `.venv` and installed SUMO/libsumo 1.27.1;
- a second bootstrap skipped current Python and Node environments;
- Ruff, Pytest, strict TypeScript, Vitest and the Vite production build passed;
- `scripts/dev.py` started both services on loopback interfaces;
- health, configuration, environment and Vite page probes returned successfully;
- the active simulation mode is `libsumo`, with no private Cesium token.

Cesium currently produces an approximately 4.9 MB uncompressed application chunk. This is
recorded for later performance work; it does not prevent local startup.

## Network preparation

```powershell
.\.venv\Scripts\python.exe -m pipeline.entrypoint network
```

The direct OSM API download is guarded to the configured small bounding box, cached by
source and extent checksum, and attributed to OpenStreetMap contributors. `netconvert`
clips imported roads to the geographic boundary, retains UTM projection metadata and
keeps passenger edges. Outputs include the `.net.xml`, GeoJSON, metadata and conversion
log under `data/network/`. Repeat runs reuse both the download and converted network.

On the verified NCKU extent SUMO 1.27.1 produced 16 passenger edges, 16 lanes and nine
junction nodes. Conversion warnings are retained in metadata; they include incomplete OSM
turn-restriction references and inferred signal/minor-green warnings, reinforcing that the
network has not been manually validated.

## Baseline simulations

`POST /api/runs` validates a camelCase scenario, returns a queued run with HTTP 202 and
executes it through a single in-process worker. This serialises libsumo's process-global
state. Poll `/api/runs/{runId}/status`, then retrieve `/summary`. Runs survive API restarts;
an interrupted job becomes failed with a recoverable diagnostic. Queued, completed and
failed runs can be deleted, while active runs return HTTP 409.

Every run directory preserves the normalized scenario, explicit vehicle type, trips,
routes, SUMO configuration, FCD/trip/collision/statistics output, SUMO log, compact summary,
software versions and a checksum manifest. Identical seeds and effective parameters yield
the same semantic route checksum; generated comments and output paths are excluded.

The verified default run requested, generated and routed 45 vehicles. Twenty-eight reached
their destination within 120 seconds; no collisions, teleports or SUMO warnings were
reported. Remaining vehicles are retained as unfinished trip records at the simulation end.

## Trajectory playback

The result processor streams geographic FCD XML and writes deterministic compact JSON with
time, WGS84 position, speed, acceleration, heading, edge ID and lane ID. Raw FCD remains in
the run for audit, while `/api/runs/{runId}/trajectories` serves only client-oriented data.
The dashboard loads the newest completed run, creates each Cesium vehicle entity once and
interpolates positions against a shared typed playback store. Play, pause, restart, scrub and
speed controls update the same clock, and clicking a vehicle shows its SUMO identifier.

The verified baseline produced 45 trajectory records. Two repeated effective configurations
produced byte-identical compact trajectory JSON. Coordinate transforms and geographic output
are checked against the configured NCKU extent and automated round-trip tests.

## SSM safety results

All vehicles are equipped with SUMO's SSM device using the configured TTC, DRAC and PET
measures, 50-metre range and full trajectories. The output uses geographic coordinates and
remains in `ssm.xml`; parsed events and TTC points are exposed separately. Reciprocal
records are deduplicated only when vehicle pair, encounter type and time overlap. Unavailable
TTC and inapplicable PET values remain null.

The dashboard shows warning/critical event markers, a compact linked TTC trace and an event
table. Locating an event moves the shared clock, flies the camera to the SSM conflict point
and highlights the involved vehicles. Warning (3.0 seconds) and critical (1.5 seconds) TTC
thresholds are analytical display assumptions, not universal safety standards.

The verified baseline generated 64 warning and 56 critical records after the prescribed
deduplication, with minimum reported TTC 1.11 seconds and maximum DRAC 3.79 m/s². These are
synthetic surrogate measures from an uncalibrated network and are not operational findings.

## Reproducible safety presets

Four YAML presets are available from `/api/scenarios/presets`: Baseline, Lead-vehicle
emergency braking, Reduced reaction margin (`tau=0.7`) and High demand (one-second synthetic
trip period). They inherit validated defaults, retain seed 42 and are included in scenario
checksums.

The braking preset inserts `intervention_lead` and `intervention_follower` on the longest
suitable passenger route. A deterministic preparation pass found an established pair away
from insertion and internal lanes at 24.8 seconds for the requested 20-second trigger. The
measured pass commanded −9.0 m/s² for one second with SUMO safety checks retained. Its
observed minima were −4.50 m/s² for the lead and −3.84 m/s² for the follower, proving why
commanded and observed braking are stored separately. Repeated effective configurations
produced byte-identical summaries.

## Dashboard workflow

The framework-free dashboard now supports the complete local workflow: choose a preset,
edit supported demand, TTC and behavioural assumptions, reset or validate them, submit a
run, observe queued/preparing/running/processing states and load the completed results.
Summary cards, newest-versus-previous comparison, TTC timeline, selected-vehicle
speed/acceleration trace, safety table and previous/next event controls all use the same
playback clock. Advanced assumptions remain collapsed by default.

## Demo runs and archives

“Load demo run” imports the bundled baseline or emergency-braking ZIP without executing
SUMO or downloading OSM. `GET /api/runs/{runId}/archive` exports any completed run with a
checksum manifest; `POST /api/demo-runs/{demoId}/load` safely imports a bundled archive.
ZIP members are path-checked and size-limited. Re-running `scripts/demo.py` reproduces both
archives with fixed ZIP metadata.

## Verification

`python scripts/smoke.py` builds a licence-compatible fixture network, routes and runs a
30-second libsumo scenario, verifies compact trajectories and summary data, builds the web
client, starts Uvicorn and Vite on temporary loopback ports, then probes API health directly
and through the web proxy.

The final staged-source verification was performed in an empty directory: bootstrap restored
all pinned dependencies from `uv.lock` and `package-lock.json`, its health tests passed, and
the independent smoke command completed without relying on files from the working checkout.

## Troubleshooting

- Run `python scripts/doctor.py` for exact Python, Node, SUMO tool and libsumo diagnostics.
- If ports 8000 or 5173 are occupied, change `API_PORT` or `WEB_PORT` in `.env`.
- If OSM acquisition fails, retry later or load bundled demo runs; automated tests use the
  included fixture and never require Overpass or the OSM map API.
- If imagery is unavailable, Cesium's ellipsoid, generated network and vehicles remain usable.
- A failed run retains `run.json`, `sumo.log` and generation logs under `data/runs/{runId}`.

## Licences and attribution

Project source is MIT licensed. Eclipse SUMO is distributed under EPL-2.0 or GPL-2.0-or-later
and is installed as pinned project-local wheels. Road data and default imagery are ©
OpenStreetMap contributors under the ODbL and tile usage policy. The synthetic OSM test
fixture was authored for this repository and contains no extracted map data.

## Limitations

The OSM network is not yet manually validated, demand will be synthetic, no calibration is
present, TTC is a surrogate measure and emergency braking is simulated. Results are not
suitable for operational decisions, and visual realism does not imply simulation validity.
