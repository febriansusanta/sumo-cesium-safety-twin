# Scenario model

All scenarios are synthetic, uncalibrated demonstrations with controlled passenger-vehicle
parameters. Seed 42 and the baseline vehicle definition remain fixed unless a preset says
otherwise. TTC thresholds classify displayed SSM results; they do not control vehicles and
are not universal safety standards.

## Presets

- **Baseline** uses a two-second random-trip period and no intervention.
- **Lead-vehicle emergency braking** adds a named pair on a deterministic route, resolves a
  valid live trigger in a preparation pass, and commands the lead vehicle to decelerate.
  SUMO safety checks remain active, so commanded and observed accelerations can differ.
- **Reduced reaction margin** changes only Krauss `tau` from 1.0 to 0.7 seconds. In SUMO a
  lower value represents a smaller desired following time gap; it remains above the
  0.1-second simulation step.
- **High demand** changes only the demonstrative random-trip period from two seconds to one.

The intervention pair, resolved time, command and observed lead/follower minima are retained
with each intervention run. Normal, hard and emergency braking are derived from measured FCD
acceleration using 4.5 and 8.0 m/s² thresholds. Collision and teleport counts remain SUMO
outputs rather than inferred braking categories.

These presets do not represent observed demand, driver populations or validated road-safety
experiments. Comparisons are useful only for demonstrating controlled simulation workflows.
