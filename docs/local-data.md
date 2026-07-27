# Local Data Folder Import

The project supports a sibling local data directory, normally `../Data`, for existing SUMO
projects. Set `APP_LOCAL_DATA_DIR` when the folder is somewhere else.

```powershell
.\.venv\Scripts\python.exe .\scripts\import_local_data.py --list
.\.venv\Scripts\python.exe .\scripts\import_local_data.py DATASET_ID
```

The importer looks for project folders with `.sumocfg` and `.net.xml` files. A dataset is
playback-ready when it also has an FCD XML file. If no `DATASET_ID` is supplied, the
highest-scoring playback-ready dataset is imported first; datasets with SSM output are
preferred because they provide TTC events.

Imported outputs are written under `data/runs/local-*` and `data/network/`:

- `trajectories.json` contains WGS84 vehicle playback samples.
- `safety-events.json` contains SSM conflicts, collisions and braking events where source
  files are available.
- `timeseries.json` contains TTC points when SSM output exists.
- `summary.json` contains the dashboard metrics.
- `source-files.json` records checksums and relative paths back to the local Data folder.

For the current folder layout, `Data\Nanke\project\高精` is a good first dataset because it
has a network, routes, FCD, SSM, tripinfo and collisions. `random_collision_project_20260601_v4`
also has FCD and many collision records, but no SSM file, so TTC charts are empty for that
import.

These imported results are still simulation artefacts. They are not calibrated operational
road-safety findings.
