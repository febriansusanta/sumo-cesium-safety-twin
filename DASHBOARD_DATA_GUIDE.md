# Updated Dashboard Data Guide

This file is a shared reference for people who open the SUMO-Cesium dashboard and need to
understand what the data means. It is written like a simple project guide rather than a
developer-only document.

## One-Sentence Explanation

The dashboard visualizes local SUMO simulation outputs in a CesiumJS map so users can replay
vehicle movement, inspect safety events, and understand traffic-safety indicators from one
completed simulation run.

## Current Loaded Dataset

The updated dashboard is currently configured to load this local dataset:

```text
Data/Nanke/project/高精
```

In the dashboard it appears as:

```text
Location: Nanke / project / 高精
Run: Local data: Nanke / project / 高精 · local-nanke-project-11d06af0
```

If PowerShell or some logs show the Chinese folder name incorrectly, the intended folder name
is `高精`.

The dashboard also reads local point overlay data from:

```text
Data/sumo
```

That folder currently contributes `real_point.shp` and `sumo_point.shp`. These are map
overlays for comparing observed points with SUMO-derived points; they are not a full
trajectory playback run by themselves.

## What The Dashboard Shows

The screen has three main areas:

| Area | What Users See | What It Means |
| --- | --- | --- |
| Left panel | Scenario controls, location, network count and loaded run | Which run is loaded and whether it came from local data or a generated scenario. |
| Center map | Cesium map with roads, 3D buildings, vehicles and event markers | Spatial playback of the SUMO run. This is where users inspect vehicle movement and event locations. |
| Right panel | Summary metrics, TTC chart, safety-event table and selected vehicle chart | Numerical interpretation of the loaded run. |

The dashboard is for completed-run playback. It is not a live traffic feed.

## Source Files Behind The Current Dashboard

These files come from the local `Data` folder and are imported into the app as browser-ready
JSON.

| Original File | Role In The Dashboard |
| --- | --- |
| `run.sumocfg` | SUMO configuration for the source run. |
| `selaya_19ga.net.xml` | SUMO road network. The app also converts it to GeoJSON for Cesium. |
| `random.rou.xml` | Vehicle routes and generated vehicle definitions. |
| `fcd.xml` | Floating-car data. This becomes the moving vehicle playback. |
| `ssm.xml` | Surrogate safety measures. This provides TTC safety events and TTC time-series points. |
| `collisions.xml` | Collision output. This contributes collision events where present. |
| `tripinfo.xml` | Vehicle completion, travel-time and delay information. |

After import, the app writes processed output under:

```text
data/runs/local-nanke-project-11d06af0/
```

Important processed files:

| Processed File | Meaning |
| --- | --- |
| `trajectories.json` | Vehicle positions, speed, acceleration and headings for playback. |
| `safety-events.json` | TTC conflicts, collisions and braking events for the event table and markers. |
| `timeseries.json` | TTC chart data. |
| `summary.json` | Main dashboard metric cards. |
| `source-files.json` | Source file names and checksums, without machine-specific absolute paths. |
| `manifest.json` | Reproducibility checksums for the imported run. |

## Current Run Numbers

For the current imported Nanke run:

| Metric | Value | Plain Meaning |
| --- | ---: | --- |
| Generated vehicles | `1,951` | Vehicles present in the route/FCD data. |
| Routed vehicles | `1,951` | Vehicles with a usable route in the run. |
| Completed vehicles | `319` | Vehicles that reached their destination before the simulation ended. |
| Mean travel time | `42.6 s` | Average trip duration for completed vehicles. |
| Mean delay | `32.8 s` | Average time loss reported in `tripinfo.xml`. |
| Minimum TTC | `0.43 s` | Smallest time-to-collision value observed in SSM events. |
| TTC warning events | `1,482` | Events below the warning TTC threshold. |
| TTC critical events | `1,219` | Events below the critical TTC threshold. |
| Hard braking events | `255` | Braking events detected from trajectory acceleration. |
| Emergency braking events | `0` | No braking events met the emergency-braking threshold. |
| Collisions | `0` | No collision records were parsed for this imported run. |
| Teleports | `0` | No teleports were counted in the imported summary. |

## How To Read The Map

| Visual Item | Meaning |
| --- | --- |
| Cyan road lines | SUMO road/lane network converted from the local `.net.xml`. |
| Light extruded blocks | Optional `Mapbox 3D Buildings` basemap mode. The dashboard requests Mapbox Streets v8 building vector tiles near the active SUMO network and renders them as Cesium extruded polygons. |
| Pink circles | Real/observed point data from `Data/sumo/real_point.shp`. |
| Blue circles | SUMO-derived point data from `Data/sumo/sumo_point.shp`. |
| Low-poly cyan cars | Vehicles from `fcd.xml`. Each car is a lightweight project-owned glTF model styled after low-poly traffic assets. |
| Orange/yellow markers | Warning-level safety events. |
| Red markers | Critical-level safety events. |
| Playback slider | Simulation time. Moving it changes vehicles, events and charts together. |
| Locate button | Moves the map and playback time to the selected safety event. |

The map uses CesiumJS for spatial visualization. It does not need a private Cesium ion token.
The Mapbox 3D building mode requires `VITE_MAPBOX_TOKEN` in local `.env`. These buildings
are visual context only and are not used in the TTC, braking or collision calculations.

## How To Read TTC And Safety Events

TTC means time to collision. It estimates how soon two vehicles would conflict if their
current movement continued.

Default dashboard thresholds:

| Severity | Rule |
| --- | --- |
| Normal | TTC is unavailable or above the warning threshold. |
| Warning | TTC is below the warning threshold. |
| Critical | TTC is below the critical threshold. |

Current default threshold values:

```text
Warning TTC: 3.0 seconds
Critical TTC: 1.5 seconds
```

The safety-event table shows:

| Column | Meaning |
| --- | --- |
| Time | Event start time in simulation seconds. |
| Event | Event type and severity. |
| TTC | Minimum TTC value for that event, when available. |
| Locate | Jump the map and playback clock to that event. |

Important: TTC is a surrogate safety measure. It helps identify events to inspect, but it is
not a direct crash-risk guarantee.

## Why The Scenario Controls Still Exist

The left panel contains scenario controls such as duration, seed, demand level, TTC thresholds
and vehicle behavior parameters.

For imported local data:

```text
The controls describe analysis assumptions, but they do not change the already-imported SUMO output.
```

To change the actual run behavior, a new SUMO simulation must be generated or a different local
SUMO result folder must be imported.

## How To Confirm The Dashboard Uses Local Data

Look for these signs:

1. The left panel says `Location: Nanke / project / 高精`.
2. The run name starts with `Local data:`.
3. The run ID is `local-nanke-project-11d06af0`.
4. The dashboard shows 1,951 vehicles and 319 completed vehicles for the current run.
5. `source-files.json` points back to `Data/Nanke/project/高精`.

If the dashboard says `NCKU / Daxue / Shengli`, it is showing the original default location
label rather than the imported Nanke data label.

## What The Data Is Not

The dashboard should not be presented as:

- real-time traffic monitoring;
- calibrated traffic demand;
- an official road-safety assessment;
- proof of real-world crash risk;
- a substitute for field validation;
- a final engineering decision tool.

Use this wording when explaining the limitations:

```text
This is an exploratory local digital-twin prototype. The demand, driver behavior and safety
metrics are simulated and uncalibrated. TTC is used as a visual screening indicator, not as
an operational safety decision standard.
```

## How To Load Or Refresh Local Data

From the dashboard:

```text
Click "Load Data folder".
```

From PowerShell:

```powershell
.\.venv\Scripts\python.exe .\scripts\import_local_data.py --list
.\.venv\Scripts\python.exe .\scripts\import_local_data.py --replace
```

Then open:

```text
http://127.0.0.1:5173
```

## GitHub Pages Version

The dashboard can also be published as:

```text
https://febriansusanta.github.io/sumo-cesium-safety-twin/
```

That public GitHub Pages version is read-only. It uses the exported JSON files in:

```text
web/public/static-data
```

It can replay the exported Nanke / project / 高精 run, show the network, vehicles, safety
events, charts and point overlays. It cannot run SUMO, import local folders or validate new
scenarios because GitHub Pages does not run the FastAPI backend.

To refresh the public snapshot, import or generate the desired run locally, then run:

```powershell
.\.venv\Scripts\python.exe .\scripts\export_static_site_data.py
git add web/public/static-data
git commit -m "Refresh static dashboard data"
git push
```

## Short Presenter Script

Use this explanation when showing the dashboard:

```text
This dashboard takes SUMO simulation outputs from our local Data folder and converts them into
an interactive CesiumJS playback. The map shows the road network, moving vehicles and safety
event markers. The right panel summarizes the run with vehicle counts, travel time, TTC,
braking and collision indicators.

The current run is from Data/Nanke/project/高精. It contains 1,951 generated vehicles, 319
completed vehicles, 1,219 critical TTC events and 255 hard-braking events. These numbers help
us inspect the simulation, but they are not calibrated operational safety findings.
```

## Files To Read Next

| File | Why Read It |
| --- | --- |
| `README.md` | How to start the app and run common commands. |
| `docs/code-structure.md` | How the codebase is organized. |
| `docs/local-data.md` | How the local `Data` folder importer works. |
| `docs/dashboard-vs-source-comparison.md` | Direct comparison between dashboard values and the original source files. |
| `docs/architecture.md` | Technical architecture and data flow. |
| `data/runs/local-nanke-project-11d06af0/summary.json` | Exact current summary values. |
| `data/runs/local-nanke-project-11d06af0/source-files.json` | Exact source files and checksums. |
