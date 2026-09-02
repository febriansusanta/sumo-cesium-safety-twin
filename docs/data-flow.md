# Data flow and artefact lineage

1. The dashboard or CLI submits a small AOI bbox and driving side. YAML defaults remain a
   fallback/sample only.
2. The API validates AOI area/span limits and registers a deterministic `networkId`.
3. The direct OpenStreetMap map API response is size-guarded, attributed and cached by
   extent and content checksum under `data/networks/{network_id}/`.
4. `netconvert` clips passenger roads, applies `--lefthand` for left-hand traffic when
   requested, retains projection metadata and produces a validated SUMO network plus client
   GeoJSON.
5. `randomTrips.py` generates deterministic trips and `duarouter` routes them with the
   explicit passenger type. Intervention runs add a named pair on a deterministic route.
6. `POST /api/runs` references the selected `networkId`; the single API worker prepares and
   executes libsumo, retaining FCD, trip, statistics,
   collision, SSM and structured logs in an isolated run directory.
7. Parsers stream or read raw outputs into compact trajectories, safety events, TTC points
   and the summary. Commanded interventions and observed acceleration remain separate.
8. FastAPI serves validated JSON. The browser validates it again with Zod and synchronises
   Cesium, charts, tables and controls through one playback store.
9. Fixed-metadata ZIP archives carry run artefacts and checksum manifests. Imports reject
   paths, nesting and excessive expanded sizes before exposing a run.

Timestamps and run IDs identify executions but do not enter scenario or semantic demand
checksums. Raw generated XML may contain SUMO generation timestamps; semantic checksums and
compact results exclude those comments.
