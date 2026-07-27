# Data flow and artefact lineage

1. Validated YAML and environment overrides define the small NCKU bounding box.
2. The direct OpenStreetMap map API response is size-guarded, attributed and cached by
   extent and content checksum.
3. `netconvert` clips passenger roads, retains projection metadata and produces a validated
   SUMO network plus client GeoJSON.
4. `randomTrips.py` generates deterministic trips and `duarouter` routes them with the
   explicit passenger type. Intervention runs add a named pair on a deterministic route.
5. The single API worker prepares and executes libsumo, retaining FCD, trip, statistics,
   collision, SSM and structured logs in an isolated run directory.
6. Parsers stream or read raw outputs into compact trajectories, safety events, TTC points
   and the summary. Commanded interventions and observed acceleration remain separate.
7. FastAPI serves validated JSON. The browser validates it again with Zod and synchronises
   Cesium, charts, tables and controls through one playback store.
8. Fixed-metadata ZIP archives carry run artefacts and checksum manifests. Imports reject
   paths, nesting and excessive expanded sizes before exposing a run.

Timestamps and run IDs identify executions but do not enter scenario or semantic demand
checksums. Raw generated XML may contain SUMO generation timestamps; semantic checksums and
compact results exclude those comments.
