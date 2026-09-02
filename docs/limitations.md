# Limitations and interpretation

- User-selected OpenStreetMap AOI networks are not manually validated against field geometry,
  signal timing, lane rules, driving-side rules or current construction. The NCKU bbox is a
  fallback/sample, not proof of calibration.
- AOI selection is intentionally limited to compact areas. Large districts, whole cities or
  regional corridors are outside the current runtime, demand and browser-playback scope.
- Demand is random, synthetic and uncalibrated. Low, medium and high are demonstration
  labels, not traffic states measured in Tainan.
- Passenger car-following values are behavioural assumptions, not observed driver traits.
- TTC, DRAC and PET are surrogate safety measures. Display thresholds are analytical choices,
  not universal safety standards; PET is inapplicable to some encounter types.
- Emergency braking is simulated. SUMO safety constraints can make measured acceleration
  differ from the requested command, and the deterministic pair is not a field experiment.
- Collisions, teleports and warnings describe this microscopic model only. Results are not
  suitable for design, enforcement, operational or public road-safety decisions.
- No pedestrians, cyclists, public transport, calibrated signals, live traffic, database,
  authentication, cloud service or city-scale processing are included.
- Token-free OpenStreetMap imagery depends on network availability and the public tile usage
  policy. The ellipsoid, road overlay and demo data remain usable without tiles.
- The recommended visible-vehicle envelope is 500; 1,000 is an experimental interpolation
  fixture and varies with browser and GPU. Visual realism never implies model validity.
