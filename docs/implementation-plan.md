# Implementation checklist

- [x] Phase 0 — environment and repository
- [x] Phase 1 — OSM to SUMO automation
- [x] Phase 2 — random demand and baseline run
- [x] Phase 3 — trajectory extraction and Cesium playback
- [x] Phase 4 — TTC and SSM output
- [x] Phase 5 — emergency-braking scenarios
- [x] Phase 6 — dashboard refinement
- [x] Phase 7 — reproducibility and collaborator package
- [x] Local Data folder import for existing SUMO outputs
- [x] GitHub Pages static dashboard export and deployment workflow
- [x] Global AOI network registry and dashboard Study Area revision

Every checked phase has been built, tested, run and inspected. Phase 0 was restarted after
the project changed from a container architecture to a host-native one. The global AOI
revision added explicit `/api/networks` build/status/GeoJSON endpoints, `data/networks`
registry storage, `networkId`-bound generated runs, right/left driving-side support and the
dashboard `Study area` controls while preserving local-data import and static playback
compatibility. See Git history and README verification notes for exact commands and
observed outputs.
