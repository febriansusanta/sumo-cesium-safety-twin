# Dashboard Versus Source Data Comparison

This document compares the values shown by the local Cesium dashboard with the original
SUMO output files in the local `Data` folder.

## Compared Run

| Item | Value |
| --- | --- |
| Dashboard run ID | `local-nanke-project-11d06af0` |
| Source dataset | `Data/Nanke/project/高精` |
| Processed run folder | `data/runs/local-nanke-project-11d06af0/` |
| Dashboard summary source | `data/runs/local-nanke-project-11d06af0/summary.json` |
| Raw source record | `data/runs/local-nanke-project-11d06af0/source-files.json` |

The dashboard/API summary matches the imported `summary.json` values. The comparison below
checks whether those values match the original SUMO files.

## Summary

Most dashboard values match the local folder data directly. The main differences are:

1. The route file contains SUMO `flow` definitions with a nominal demand of 2,405 vehicles,
   but the dashboard counts the 1,951 vehicles that actually appear in `fcd.xml`.
2. The raw SSM file contains 2,706 conflict records, while the dashboard shows 2,705
   conflict events because one overlapping warning-level SSM conflict is deduplicated.
3. Hard-braking events are derived by the dashboard from trajectory acceleration; there is no
   separate raw braking-event XML file in the source folder.
4. The raw `tripinfo.xml` is not fully well-formed, so the dashboard uses the valid tripinfo
   rows only. Those valid rows match the dashboard summary.

## Network Layer

| Measure | Raw `selaya_19ga.net.xml` | Dashboard |
| --- | ---: | ---: |
| Regular SUMO edges | `51` | Not displayed directly |
| All SUMO edges, including internal connectors | `111` | Not displayed directly |
| Regular lanes | `178` | Not displayed directly |
| All lanes, including internal junction lanes | `370` | Not displayed directly |
| Junctions | `50` | Not displayed directly |
| GeoJSON display features | Derived from `.net.xml` | `228` |

Interpretation:

The dashboard network count is a display-layer count, not a one-to-one count of regular SUMO
edges. It comes from the exported GeoJSON used by Cesium.

## Vehicles And Trajectories

| Measure | Source Folder | Dashboard / Processed Run | Match |
| --- | ---: | ---: | --- |
| Route flow definitions in `random.rou.xml` | `20` | Not shown | Different concept |
| Nominal vehicles implied by route flows | `2,405` | Not shown | Different concept |
| Vehicles appearing in `fcd.xml` | `1,951` | `1,951` generated/routed vehicles | Yes |
| FCD vehicle samples | `82,600` | `82,600` trajectory samples | Yes |
| FCD time range | `0.0-3599.0 s` | `0.0-3599.0 s` | Yes |

Interpretation:

The dashboard uses the vehicles that actually appear in the FCD playback file. The route file
uses traffic flows, so its nominal demand is not the same as the number of vehicles that
successfully appeared in the FCD output.

## Tripinfo Metrics

| Measure | Source `tripinfo.xml` Valid Rows | Dashboard | Match |
| --- | ---: | ---: | --- |
| Parsed valid tripinfo rows | `319` | Used by importer | Yes |
| Completed vehicles | `319` | `319` | Yes |
| Mean travel time | `42.57993730407524 s` | `42.57993730407524 s` | Yes |
| Mean delay | `32.77228840125392 s` | `32.77228840125393 s` | Yes |

Interpretation:

The tiny mean-delay difference is only floating-point formatting. The values are effectively
the same. The dashboard also records a warning that `tripinfo.xml` was not fully well-formed.

## SSM / TTC Safety Events

| Measure | Source `ssm.xml` | Dashboard / Processed Run | Match |
| --- | ---: | ---: | --- |
| Raw SSM conflict records | `2,706` | `2,705` conflict events | Almost |
| Normal TTC records | `4` | `4` | Yes |
| Warning TTC records | `1,483` | `1,482` | Off by 1 |
| Critical TTC records | `1,219` | `1,219` | Yes |
| Minimum TTC | `0.43 s` | `0.43 s` | Yes |

Interpretation:

The dashboard removes one overlapping warning-level SSM conflict during event processing.
Critical TTC count and minimum TTC are unchanged.

## Collisions

| Measure | Source `collisions.xml` | Dashboard | Match |
| --- | ---: | ---: | --- |
| Collision records | `0` | `0` | Yes |

Interpretation:

The source file contains no collision records, and the dashboard correctly shows zero
collisions.

## Braking Events

| Measure | Source Folder | Dashboard |
| --- | --- | ---: |
| Separate braking-event source file | None | Not applicable |
| Hard-braking events | Derived from FCD acceleration/speed samples | `255` |
| Emergency-braking events | Derived from FCD acceleration/speed samples | `0` |

Interpretation:

Braking events are calculated by the dashboard importer from trajectory samples. They are not
a direct raw XML count from the source folder.

## Final Conclusion

The dashboard is using your local source data. Vehicle playback, tripinfo metrics, collision
count and minimum TTC match the source folder. The two important interpretation notes are:

- route-flow demand in `random.rou.xml` is nominal, while the dashboard vehicle count is based
  on actual FCD vehicles;
- one warning-level SSM conflict is deduplicated during dashboard event processing.

The dashboard should still be described as an exploratory visualization of simulated,
uncalibrated SUMO outputs.

