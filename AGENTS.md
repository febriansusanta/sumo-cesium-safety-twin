# Build a local SUMO–Cesium traffic-safety digital twin prototype

You are acting as a senior geospatial software engineer, traffic-simulation engineer and visualisation developer.

Build a complete local prototype that connects an OpenStreetMap-derived SUMO traffic simulation to an interactive CesiumJS web interface.

The project must run directly on the host operating system without Docker, containers, virtual machines, Kubernetes or cloud infrastructure.

This instruction file is intended to be portable. Another developer should be able to place it in a new repository, give it to a local coding agent and have the agent construct, configure, test and document the project on their machine.

Work incrementally in phases.

At the end of every phase:

1. run all relevant tests;
2. run the application or pipeline;
3. inspect logs and generated outputs;
4. fix failures before continuing;
5. update the README and implementation checklist;
6. record environment-specific decisions;
7. commit the completed phase with a clear commit message where Git is available.

Do not claim that a phase works unless you have executed and verified it locally.

---

# 1. Project objective

Create a small, reproducible traffic-simulation digital-twin demonstrator that:

- downloads a small urban road network from OpenStreetMap;
- converts it into a valid SUMO network;
- generates synthetic demand using SUMO tools;
- runs SUMO through a Python orchestration API;
- records vehicle trajectories and safety-related outputs;
- visualises the simulation in CesiumJS;
- lets users configure and execute simple scenarios;
- supports time-to-collision, TTC, and emergency-braking experiments;
- presents simulation results and safety events;
- runs directly on Windows, macOS or Linux where dependencies are supported;
- requires minimal manual configuration;
- can be rebuilt by another developer from this repository and instruction file.

This is an exploratory prototype, not a calibrated traffic-engineering model.

The interface must state clearly that:

- traffic demand is synthetic;
- network conversion may contain inferred properties;
- driver behaviour is simulated;
- TTC is a surrogate safety measure;
- outputs are not suitable for operational road-safety decisions.

---

# 2. Core implementation principle

Do not depend on Docker.

Use:

- system-installed SUMO;
- a project-local Python virtual environment;
- project-local Node.js dependencies;
- cross-platform setup scripts;
- environment detection;
- documented dependency checks;
- reproducible version locking;
- generated local configuration files;
- one-command development and demonstration workflows where practical.

The project must not require:

- administrator access after initial dependency installation;
- global Python package installation;
- global npm package installation;
- Cesium ion;
- external databases;
- Redis;
- Celery;
- cloud-hosted services;
- authentication;
- proprietary software.

---

# 3. Scope constraints

Keep the first implementation deliberately small.

Use:

- one compact urban area, preferably area around National Cheng Kung University campus, Tainan, Taiwan;
- approximately one to four connected junctions;
- passenger vehicles only initially;
- synthetic random demand;
- one baseline scenario;
- several predefined safety scenarios;
- offline simulation followed by playback;
- no pedestrians;
- no buses or rail;
- no public-transport schedules;
- no traffic-demand calibration;
- no live city-wide data;
- no detailed vehicle models;
- no city-wide network;
- no live WebSocket simulation in the first implementation.

Choose a default demonstration area that:

- has a manageable OpenStreetMap road network;
- contains at least one useful junction;
- avoids a highly complex interchange;
- can be downloaded quickly;
- can produce valid random trips.

The geographic extent must remain configurable.

---

# 4. Required technology

## Simulation and processing

Use:

- Eclipse SUMO;
- Python 3.12 where supported, otherwise a documented compatible version;
- FastAPI;
- Uvicorn;
- libsumo as the preferred Python simulation interface;
- TraCI compatibility where useful;
- Pydantic;
- PyProj;
- standard Python subprocess execution;
- SUMO utilities including:
  - `netconvert`;
  - `randomTrips.py`;
  - `duarouter` where needed;
  - SSM device output;
  - FCD output where useful.

## Client

Use:

- CesiumJS;
- TypeScript;
- Vite;
- native HTML;
- native CSS or simple modular CSS;
- SVG or Canvas charts where useful;
- no React;
- no Vue;
- no Angular;
- no unnecessary user-interface framework.

## Development tooling

Use:

- Python virtual environment;
- `pyproject.toml`;
- a pinned Python lock file where practical;
- npm with a committed lock file;
- TypeScript strict mode;
- Ruff or an equivalent Python linter;
- Pytest;
- Vitest or another lightweight front-end testing tool;
- cross-platform scripts;
- Makefile only as an optional convenience layer, not as the sole interface.

Because Make is not installed by default on all Windows systems, every essential operation must also be available through Python scripts or npm commands.

---

# 5. Supported operating systems

Target:

- Linux;
- macOS;
- Windows 11 with PowerShell.

The agent must detect the current operating system and adapt installation instructions accordingly.

Do not silently assume:

- Bash;
- GNU Make;
- Homebrew;
- Chocolatey;
- Scoop;
- `apt`;
- administrative privileges;
- POSIX path semantics.

Where installation cannot be automated safely, provide exact manual commands and verify the result afterwards.

Maintain:

```text
docs/platforms/
├── linux.md
├── macos.md
└── windows.md
```

Each document must include:

- tested operating-system version;
- SUMO installation method;
- required environment variables;
- Python setup;
- Node.js setup;
- known platform-specific limitations;
- troubleshooting steps.

---

# 6. Local dependency discovery

Before writing substantial application code, inspect the environment.

Detect and report:

- operating system;
- CPU architecture;
- Python version;
- Python executable path;
- Node.js version;
- npm version;
- Git version;
- SUMO binary path;
- `sumo` version;
- `netconvert` path;
- `duarouter` path;
- `randomTrips.py` path;
- whether `libsumo` is importable;
- whether `traci` is importable;
- `SUMO_HOME`;
- available shell;
- available package manager.

Create a diagnostic command:

```bash
python scripts/doctor.py
```

On Windows:

```powershell
python .\scripts\doctor.py
```

The doctor script must:

- inspect dependencies;
- print clear pass, warning and failure states;
- identify missing tools;
- print platform-specific installation guidance;
- verify that SUMO tools belong to the same installation;
- verify that Python can locate SUMO tools;
- verify that the Node project can be installed;
- exit with a non-zero code when essential dependencies are missing.

Do not modify the user’s shell profile automatically.

---

# 7. Repository structure

Use a clear monorepo structure similar to:

```text
.
├── api/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/
│   │   ├── routers/
│   │   └── services/
│   │       ├── osm_service.py
│   │       ├── network_service.py
│   │       ├── demand_service.py
│   │       ├── simulation_service.py
│   │       ├── safety_service.py
│   │       ├── coordinate_service.py
│   │       └── result_service.py
│   ├── tests/
│   └── pyproject.toml
├── web/
│   ├── src/
│   │   ├── main.ts
│   │   ├── api.ts
│   │   ├── cesium/
│   │   ├── simulation/
│   │   ├── ui/
│   │   ├── charts/
│   │   └── styles/
│   ├── public/
│   ├── tests/
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.ts
├── pipeline/
│   ├── download_osm.py
│   ├── build_network.py
│   ├── generate_demand.py
│   ├── validate_scenario.py
│   └── entrypoint.py
├── scenarios/
│   ├── presets/
│   └── schemas/
├── data/
│   ├── raw/
│   ├── network/
│   ├── demand/
│   ├── runs/
│   └── cache/
├── scripts/
│   ├── bootstrap.py
│   ├── doctor.py
│   ├── dev.py
│   ├── demo.py
│   ├── test_all.py
│   ├── clean.py
│   └── platform.py
├── docs/
│   ├── architecture.md
│   ├── implementation-plan.md
│   ├── data-flow.md
│   ├── scenario-model.md
│   ├── limitations.md
│   └── platforms/
├── .env.example
├── .gitignore
├── README.md
├── AGENTS.md
└── LICENSE
```

Adapt where justified, but preserve separation among:

- source data;
- generated SUMO network;
- generated demand;
- scenarios;
- execution;
- results;
- front-end visualisation;
- platform setup.

---

# 8. Portable agent instruction files

Create these files:

```text
AGENTS.md
docs/implementation-plan.md
docs/architecture.md
```

`AGENTS.md` must contain concise instructions for future coding agents, including:

- project purpose;
- repository conventions;
- development commands;
- testing requirements;
- platform-detection requirements;
- restrictions against Docker;
- requirement to verify SUMO installation;
- required acceptance criteria;
- prohibition against inventing SUMO flags or Cesium APIs;
- requirement to consult official documentation when uncertain.

This repository must remain understandable to another agent without access to the original conversation.

---

# 9. Bootstrap process

Implement:

```bash
python scripts/bootstrap.py
```

The bootstrap script must:

1. detect the operating system;
2. run dependency diagnostics;
3. create `.venv` if absent;
4. install pinned Python dependencies;
5. verify `libsumo` or configure SUMO Python tools;
6. create `.env` from `.env.example` if absent;
7. install front-end dependencies using `npm ci`;
8. create required data directories;
9. verify write permissions;
10. run a short setup validation;
11. print the commands required to start development.

The script must be idempotent.

Running it repeatedly must not:

- destroy data;
- reinstall everything unnecessarily;
- overwrite user configuration;
- rebuild the network unnecessarily;
- modify global dependencies.

Use:

```text
.venv/
```

as the default virtual environment directory.

Provide activation instructions, but do not require manual activation for project scripts. Scripts should locate and use `.venv` where practical.

---

# 10. SUMO discovery and configuration

Support these discovery methods in order:

1. explicit paths from environment variables;
2. `SUMO_HOME`;
3. executable discovery through `PATH`;
4. common platform-specific installation paths;
5. clear failure with installation guidance.

Support environment variables such as:

```text
SUMO_HOME=
SUMO_BINARY=
NETCONVERT_BINARY=
DUAROUTER_BINARY=
SUMO_TOOLS_DIR=
```

Store generated effective configuration in:

```text
data/environment.json
```

Include:

- platform;
- architecture;
- Python version;
- Node version;
- SUMO version;
- resolved executable paths;
- projection-library version;
- Cesium version;
- timestamp.

Do not commit machine-specific paths.

---

# 11. End-to-end data flow

Implement:

```text
Bounding box or place configuration
        ↓
Download OSM data
        ↓
Convert OSM to SUMO network
        ↓
Validate network
        ↓
Generate random trips and routes
        ↓
Generate vehicle types and scenario parameters
        ↓
Generate SUMO configuration
        ↓
Run SUMO through libsumo or command execution
        ↓
Collect trajectories and safety outputs
        ↓
Convert SUMO coordinates to WGS84
        ↓
Serve compact results through FastAPI
        ↓
Visualise and replay in CesiumJS
```

Every generated artefact must be reproducible when the same:

- source data;
- SUMO version;
- random seed;
- network options;
- demand parameters;
- scenario parameters

are used.

---

# 12. OSM acquisition

Implement automatic acquisition using one clear approach.

Preferred methods:

1. Overpass API for a small bounding box; or
2. direct OSM API download for a sufficiently small extent.

Do not require OSMnx unless it materially simplifies acquisition or validation.

Support a configuration such as:

```yaml
location:
  name: "default-demo"
  bbox:
    west: -0.130
    south: 51.503
    east: -0.115
    north: 51.512
```

Provide:

- a default location;
- environment-variable overrides;
- configuration-file overrides;
- cached downloads;
- checksum recording;
- forced refresh;
- explicit OpenStreetMap attribution;
- download retry handling;
- network-size safeguards;
- understandable errors.

The pipeline must not download an entire city accidentally.

---

# 13. SUMO network construction

Use `netconvert`.

The network pipeline must:

- import OSM roads;
- retain projection metadata;
- create lane-level network topology;
- infer junction connections;
- retain traffic signals where available;
- generate conversion logs;
- capture warnings;
- validate passenger-vehicle connectivity;
- reject an empty or unusable network;
- avoid manual editing of `.net.xml`.

Export a client-side representation containing:

- road or lane geometries;
- junction coordinates;
- SUMO edge IDs;
- SUMO lane IDs where useful;
- mappings between client features and SUMO objects.

Use GeoJSON for modest network display data.

Preserve identifiers consistently.

---

# 14. Synthetic demand

Use `randomTrips.py`.

Expose:

- simulation duration;
- random seed;
- trip-generation period;
- approximate demand level;
- minimum trip distance;
- maximum trip distance where supported;
- vehicle type;
- departure interval;
- relevant source and destination weighting.

Provide presets:

- `low`;
- `medium`;
- `high`.

The generator must record:

- requested trips;
- generated trips;
- routed trips;
- rejected trips;
- unroutable trips;
- random seed;
- generation command;
- routing command;
- warning messages.

The interface must label these presets as synthetic and uncalibrated.

---

# 15. Vehicle parameters

Support a passenger-car vehicle type.

Expose a constrained subset:

- car-following model;
- `accel`;
- `decel`;
- `emergencyDecel`;
- `apparentDecel`;
- `tau`;
- `sigma`;
- `minGap`;
- `maxSpeed`;
- simulation step length.

Validate server-side.

At minimum:

- reject negative values;
- require `emergencyDecel >= decel`;
- apply sensible bounds;
- warn about extreme values;
- warn where step length may reduce model stability;
- reject arbitrary XML from the browser.

Document that these are model assumptions.

---

# 16. TTC and surrogate safety measurement

Use SUMO’s SSM device as the authoritative source for TTC-related analysis.

Record where available:

- TTC;
- DRAC;
- PET;
- conflict type;
- event start time;
- event end time;
- minimum TTC;
- maximum DRAC;
- vehicle IDs;
- conflict coordinates;
- path information where useful.

Make configurable:

- warning TTC threshold;
- critical TTC threshold;
- SSM detection range;
- enabled measures;
- event retention settings.

Classify events:

```text
normal:
TTC unavailable or above warning threshold

warning:
TTC below warning threshold

critical:
TTC below critical threshold
```

Treat these as visual-analysis thresholds, not universal safety standards.

---

# 17. Emergency-braking scenarios

Implement predefined reproducible scenarios.

## Baseline

- ordinary synthetic demand;
- default vehicle behaviour;
- no forced braking event.

## Lead-vehicle emergency braking

- deterministically select a suitable vehicle;
- wait until it has entered a valid road segment;
- trigger hard deceleration or stopping;
- record following-vehicle responses;
- record TTC and DRAC.

## Reduced reaction margin

- alter `tau` or another justified behaviour parameter;
- keep other conditions controlled;
- compare with baseline.

## High demand

- increase synthetic demand;
- preserve comparable behaviour parameters;
- inspect changes in conflicts and braking.

Each preset must store:

- scenario identifier;
- description;
- random seed;
- demand parameters;
- vehicle parameters;
- trigger time;
- target-selection rule;
- limitations;
- checksum.

Avoid triggering forced braking:

- immediately after insertion;
- within an invalid junction context;
- where no following vehicle exists;
- in a manner that only creates simulation artefacts.

Classify:

- ordinary braking;
- hard braking;
- emergency braking;
- collision;
- teleportation.

Document thresholds.

---

# 18. Simulation execution

Begin with completed-run playback.

Use this workflow:

```text
POST scenario
    ↓
validate
    ↓
create run directory
    ↓
generate SUMO files
    ↓
execute SUMO
    ↓
parse outputs
    ↓
write client-oriented results
    ↓
serve result metadata
```

Support states:

- queued;
- preparing;
- running;
- processing;
- completed;
- failed.

A simple local in-process job manager is acceptable.

Do not introduce a database unless required.

Each run must use a unique directory:

```text
data/runs/{run_id}/
```

Store:

- effective scenario;
- generated demand;
- SUMO configuration;
- logs;
- trajectory data;
- SSM output;
- parsed events;
- summary;
- checksums;
- environment metadata.

---

# 19. FastAPI endpoints

Implement endpoints similar to:

```text
GET  /api/health
GET  /api/environment
GET  /api/config
GET  /api/network
GET  /api/scenarios/presets
POST /api/scenarios/validate
POST /api/runs
GET  /api/runs
GET  /api/runs/{run_id}
GET  /api/runs/{run_id}/status
GET  /api/runs/{run_id}/summary
GET  /api/runs/{run_id}/trajectories
GET  /api/runs/{run_id}/safety-events
GET  /api/runs/{run_id}/timeseries
GET  /api/runs/{run_id}/archive
DELETE /api/runs/{run_id}
```

Use typed request and response models.

Return meaningful errors.

Do not expose raw filesystem paths unnecessarily.

---

# 20. Result format

Do not send raw SUMO XML to the browser.

Use compact JSON.

A trajectory should resemble:

```json
{
  "vehicleId": "veh_42",
  "samples": [
    {
      "t": 0.0,
      "longitude": -0.121,
      "latitude": 51.507,
      "height": 0,
      "speed": 8.2,
      "acceleration": 0.4,
      "angle": 92.0,
      "edgeId": "12345"
    }
  ]
}
```

A safety event should resemble:

```json
{
  "eventId": "ssm_12",
  "type": "rear_end",
  "startTime": 24.5,
  "endTime": 27.0,
  "minimumTtc": 0.82,
  "maximumDrac": 5.9,
  "vehicleIds": ["veh_42", "veh_15"],
  "longitude": -0.121,
  "latitude": 51.507,
  "severity": "critical"
}
```

A summary must include:

- scenario;
- duration;
- seed;
- demand level;
- generated vehicle count;
- completed vehicle count;
- mean travel time;
- mean delay;
- hard-braking count;
- emergency-braking count;
- TTC warning count;
- TTC critical count;
- minimum TTC;
- maximum DRAC;
- collision count;
- teleport count;
- warnings;
- SUMO version;
- scenario checksum.

---

# 21. CesiumJS interface

Build a complete small dashboard.

## Spatial view

Show:

- the prepared road network;
- moving vehicles;
- vehicle orientation;
- selected vehicle;
- short trajectory tail where useful;
- TTC conflict markers;
- braking-event markers;
- fly-to-network action;
- fly-to-event action.

Use an imagery source that does not require a private token.

The application must work without Cesium ion.

## Scenario panel

Allow configuration of:

- preset;
- duration;
- seed;
- demand level;
- trip period;
- warning TTC threshold;
- critical TTC threshold;
- car-following model;
- `tau`;
- `decel`;
- `emergencyDecel`;
- step length.

Place less common options in an advanced section.

Provide:

- reset;
- validate;
- run;
- load demo;
- clear error display;
- scenario-assumption summary.

## Status panel

Show:

- dependency status;
- network status;
- demand-generation stage;
- simulation state;
- processing state;
- completion;
- warnings;
- failures.

## Playback

Provide:

- play;
- pause;
- restart;
- time slider;
- current time;
- playback speed;
- step forward;
- previous event;
- next event.

Synchronise charts and event selections.

## Results

Display:

- vehicle count;
- mean travel time;
- minimum TTC;
- maximum DRAC;
- hard-braking count;
- emergency-braking count;
- collisions;
- teleports;
- warnings.

## Safety-event table

Include:

- time;
- event type;
- severity;
- minimum TTC;
- DRAC;
- vehicle IDs;
- locate;
- replay.

When selected:

- move the clock near the event;
- fly to the event;
- highlight involved vehicles;
- show details.

## Charts

Implement:

1. TTC over simulation time;
2. selected-vehicle speed and acceleration;
3. event count by type or severity.

Keep charts simple and interpretable.

---

# 22. Cesium rendering strategy

Start with:

- points;
- billboards;
- simple primitives;
- lightweight entities.

Do not begin with detailed glTF cars.

Use:

- interpolation between trajectory samples;
- highlighted selected vehicle;
- distinct warning and critical states;
- event markers;
- efficient updates;
- no complete recreation of all entities every frame.

Test approximately:

- 100 vehicles;
- 500 vehicles;
- 1,000 vehicles where feasible.

Document practical limits.

CZML is optional.

Use it only if it materially simplifies playback and performs adequately.

---

# 23. Coordinate conversion

Treat coordinate handling as a dedicated subsystem.

Use:

- SUMO projection metadata;
- `netOffset`;
- `convBoundary`;
- `origBoundary`;
- projection definition;
- PyProj or verified SUMO conversion tools.

Test:

- known junction coordinates;
- network bounds;
- OSM alignment;
- round-trip coordinate conversion.

Do not approximate longitude and latitude using arbitrary multipliers.

---

# 24. Development commands

Essential commands must work through Python scripts.

Provide:

```bash
python scripts/doctor.py
python scripts/bootstrap.py
python scripts/dev.py
python scripts/demo.py
python scripts/test_all.py
python scripts/clean.py
```

On Windows, the equivalent PowerShell syntax must work.

## `doctor.py`

Checks environment and dependencies.

## `bootstrap.py`

Creates and prepares the local project environment.

## `dev.py`

Starts:

- FastAPI;
- Vite development server.

It must:

- start both processes;
- stream labelled logs;
- terminate both when interrupted;
- avoid orphan processes;
- choose documented ports;
- detect port conflicts.

## `demo.py`

Must:

1. verify dependencies;
2. prepare the default network;
3. generate baseline demand;
4. run the baseline scenario;
5. run the emergency-braking scenario where practical;
6. verify result output;
7. print the local application URLs.

## `test_all.py`

Runs:

- Python tests;
- Python linting;
- TypeScript checks;
- front-end tests;
- integration smoke test.

## `clean.py`

Provides explicit choices for:

- temporary files;
- generated demand;
- generated network;
- simulation runs;
- all generated content.

Never delete user data without confirmation or an explicit destructive flag.

Optional Makefile commands may wrap these scripts.

---

# 25. Local development ports

Use configurable defaults:

```text
API_HOST=127.0.0.1
API_PORT=8000
WEB_HOST=127.0.0.1
WEB_PORT=5173
```

Do not bind publicly by default.

The Vite development server must proxy `/api` to FastAPI.

Document how to change ports.

---

# 26. Windows requirements

Pay particular attention to Windows.

The implementation must:

- handle backslashes and spaces in paths;
- avoid Bash-only scripts;
- use Python for process orchestration;
- avoid shell string execution;
- use `subprocess` argument arrays;
- discover `.exe` executables;
- handle PowerShell;
- handle `SUMO_HOME`;
- document official SUMO installer use;
- verify that SUMO tools are accessible;
- stop child processes cleanly.

Do not make WSL mandatory.

WSL may be documented as an alternative, not the default Windows path.

---

# 27. Python environment

Use:

```text
.venv/
```

Create:

```text
api/pyproject.toml
```

Pin dependencies.

Provide a reproducible installation method.

Avoid depending on globally installed Python packages.

Where `libsumo` installation differs by platform, implement a fallback strategy:

1. attempt project-environment installation;
2. inspect SUMO-provided Python bindings;
3. add supported tool paths at runtime;
4. fall back to TraCI or command-line SUMO execution where necessary;
5. document the selected mode.

The application must report the active simulation mode:

- `libsumo`;
- `traci`;
- `subprocess`.

Do not hide fallbacks.

---

# 28. Front-end environment

Use:

```bash
cd web
npm ci
npm run dev
```

Commit the npm lock file.

Provide scripts:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "...",
    "typecheck": "...",
    "lint": "..."
  }
}
```

Do not require globally installed Vite or TypeScript.

---

# 29. Reproducibility

Use checksums for:

- OSM source;
- bounding box;
- SUMO version;
- network-conversion options;
- demand settings;
- random seed;
- scenario parameters.

Do not regenerate unchanged artefacts unnecessarily.

Every run must preserve:

- effective configuration;
- generated XML;
- result files;
- logs;
- software versions;
- environment summary;
- checksum;
- timestamp.

Provide a run export command:

```bash
python scripts/export_run.py RUN_ID
```

It should produce a portable archive containing the run definition and results.

Do not include machine-specific absolute paths in exported archives.

---

# 30. Pre-generated demonstration data

Include or generate:

- one baseline demonstration run;
- one emergency-braking demonstration run.

Do not commit extremely large trajectory files.

Where generated demonstrations are too large for Git:

- provide a script that regenerates them;
- document expected runtime;
- retain small fixture outputs for testing.

The web interface must provide a “Load demo runs” path.

A live demonstration should not depend on a new simulation completing successfully.

---

# 31. Testing

## Unit tests

Test:

- environment-path resolution;
- scenario validation;
- demand validation;
- vehicle parameter validation;
- coordinate conversion;
- severity classification;
- braking classification;
- checksums;
- output parsing.

## Integration tests

Use a small fixture OSM network.

Test:

- network construction;
- demand generation;
- route generation;
- short SUMO execution;
- trajectory output;
- SSM output;
- parsing;
- API exposure.

Do not require an internet download for every test run.

## API tests

Test:

- health;
- environment;
- configuration;
- validation;
- run creation;
- status;
- summary;
- trajectories;
- safety events;
- errors.

## Front-end tests

Test:

- API client;
- scenario form;
- validation feedback;
- playback state;
- event selection;
- result rendering.

## Smoke test

One command must:

1. inspect dependencies;
2. prepare a fixture network;
3. run a 30–60 second simulation;
4. verify trajectories;
5. verify valid summary output;
6. verify the API;
7. verify front-end build.

---

# 32. Documentation

## README

Include:

- project purpose;
- architecture summary;
- supported operating systems;
- prerequisites;
- SUMO installation;
- Python installation;
- Node installation;
- quick start;
- platform-specific setup;
- environment diagnostics;
- bootstrap;
- development startup;
- demonstration workflow;
- rebuilding the network;
- changing location;
- running tests;
- troubleshooting;
- licences;
- limitations.

## Platform guides

Provide exact instructions for:

- Ubuntu or a current Debian-based Linux;
- current macOS;
- Windows 11.

## Architecture

Explain:

- OSM ingestion;
- SUMO conversion;
- synthetic demand;
- simulation execution;
- SSM outputs;
- coordinate conversion;
- API;
- Cesium playback;
- result persistence.

## Scenario documentation

Explain:

- baseline;
- forced emergency braking;
- reduced reaction margin;
- high demand;
- controlled variables;
- interpretation.

## Limitations

State explicitly:

- OSM network has not necessarily been manually validated;
- demand is synthetic;
- no calibration is present;
- TTC is a surrogate;
- emergency braking is simulated;
- results are not suitable for operational decisions;
- visual realism does not imply simulation validity.

---

# 33. User demonstration flow

The intended demonstration is:

1. clone the repository;
2. install SUMO if absent;
3. run `python scripts/doctor.py`;
4. run `python scripts/bootstrap.py`;
5. run `python scripts/demo.py`;
6. run `python scripts/dev.py`;
7. open the local Cesium dashboard;
8. inspect the prepared road network;
9. load the baseline scenario;
10. replay vehicles;
11. inspect TTC and braking metrics;
12. load the emergency-braking scenario;
13. jump to a critical event;
14. compare summaries.

The interface must remain understandable without developer tools.

---

# 34. Development phases

## Phase 0 — environment and repository

Deliver:

- environment diagnostics;
- repository structure;
- dependency definitions;
- virtual-environment setup;
- front-end skeleton;
- FastAPI health endpoint;
- Cesium canvas;
- architecture document;
- implementation plan;
- platform guides.

Acceptance criteria:

- `doctor.py` runs;
- missing dependencies are reported clearly;
- `.venv` can be created;
- Python dependencies install;
- npm dependencies install;
- API starts;
- Cesium starts;
- no Docker is required;
- no private Cesium token is required.

## Phase 1 — OSM to SUMO

Deliver:

- configurable extent;
- download;
- cache;
- network conversion;
- logs;
- validation;
- network GeoJSON.

Acceptance criteria:

- one command builds the network;
- unchanged network uses cache;
- network loads in SUMO;
- Cesium displays the network correctly;
- platform-specific paths work.

## Phase 2 — random demand and baseline run

Deliver:

- demand configuration;
- random trips;
- routed demand;
- SUMO configuration;
- execution;
- run storage;
- metadata.

Acceptance criteria:

- short run completes;
- vehicles traverse the network;
- same seed reproduces demand;
- invalid values are rejected.

## Phase 3 — trajectories and Cesium playback

Deliver:

- trajectory extraction;
- coordinate conversion;
- result API;
- Cesium animation;
- playback controls;
- vehicle selection.

Acceptance criteria:

- vehicles align with roads;
- animation is smooth;
- scrubbing works;
- selected vehicle details are correct.

## Phase 4 — TTC and SSM

Deliver:

- SSM configuration;
- TTC and DRAC parsing;
- event API;
- map markers;
- event list;
- navigation.

Acceptance criteria:

- SSM output exists;
- vehicle IDs and locations are preserved;
- selecting an event synchronises the interface;
- severity classifications are tested.

## Phase 5 — emergency braking

Deliver:

- deterministic target selection;
- braking trigger;
- presets;
- behaviour controls;
- event classification;
- scenario comparison.

Acceptance criteria:

- braking occurs at the configured time;
- the run is reproducible;
- following responses can be inspected;
- forced action and simulated response are distinguished.

## Phase 6 — dashboard refinement

Deliver:

- complete scenario form;
- run states;
- metrics;
- charts;
- warnings;
- responsive layout.

Acceptance criteria:

- full demonstration works;
- failures are understandable;
- advanced parameters are contained;
- no unsupported controls are exposed.

## Phase 7 — collaborator reproducibility

Deliver:

- clean-clone test;
- platform setup verification;
- final documentation;
- demo runs;
- export command;
- smoke test;
- agent instructions.

Acceptance criteria:

- a new developer can follow the README;
- another coding agent can continue from `AGENTS.md`;
- no undocumented machine-specific file is required;
- tests pass;
- Docker is not required;
- demo works after dependency setup.

---

# 35. Code quality rules

- Use Python type hints.
- Use TypeScript strict mode.
- Validate all browser inputs.
- Use structured logging.
- Centralise SUMO command construction.
- Never concatenate untrusted input into shell commands.
- Use argument arrays with `subprocess`.
- Do not use `shell=True` unless unavoidable and explicitly justified.
- Avoid global mutable state.
- Keep generated files outside source directories.
- Do not suppress exceptions silently.
- Avoid unnecessary dependencies.
- Avoid premature abstractions.
- Add no AI features.
- Add no accounts.
- Add no cloud deployment.
- Add no Docker files unless later requested explicitly.

---

# 36. Rules for uncertainty

When uncertain:

1. inspect the installed SUMO version;
2. consult current official SUMO documentation;
3. consult current official CesiumJS documentation;
4. use the simplest officially supported implementation;
5. construct a minimal experiment;
6. run it;
7. document the result;
8. retain an architecture decision record for consequential choices.

Do not invent:

- SUMO command-line flags;
- XML attributes;
- SSM fields;
- libsumo functions;
- TraCI functions;
- CesiumJS APIs;
- operating-system installation paths.

---

# 37. Initial task

Begin with Phase 0.

Before implementing the complete application:

1. inspect the repository;
2. detect the operating system;
3. inspect installed dependencies;
4. run or create `scripts/doctor.py`;
5. identify the compatible Python, Node, SUMO and Cesium versions;
6. create `docs/architecture.md`;
7. create `docs/implementation-plan.md`;
8. create `AGENTS.md`;
9. define the default bounding box;
10. define baseline API and data schemas;
11. create the Python virtual-environment configuration;
12. create the Vite Cesium application;
13. implement the FastAPI health endpoint;
14. implement `scripts/dev.py`;
15. verify that the API and web application start locally;
16. record all platform-specific issues.

Continue phase by phase without skipping acceptance criteria.

The final repository must be independently reproducible by another developer or local coding agent using this file, the README and `AGENTS.md`.
