# Client performance envelope

The Phase 6 deterministic interpolation benchmark uses 20 samples per vehicle and computes
one Cesium Cartesian position for a representative frame. On the verified Windows 11 x64
host with Node 22.20.0, observed timings were:

| Vehicles | Interpolation time |
| ---: | ---: |
| 100 | 0.807 ms |
| 500 | 0.749 ms |
| 1,000 | 1.545 ms |

The benchmark is automated in `web/tests/vehicle-performance.test.ts`. It isolates the
per-frame trajectory lookup and coordinate work, so it is not a substitute for GPU/WebGL
render timing. Browser smoke execution loaded the real network, 47 intervention trajectories,
SSM markers, summary and charts without client request failures.

The practical first-version recommendation is at most 500 simultaneously visible vehicle
entities. One thousand remains an experimental upper fixture: interpolation is inexpensive,
but model rendering, labels, event markers, imagery, hardware and browser composition can
dominate. The dashboard uses a very small generated low-poly glTF car; detailed external car
models remain out of scope.
