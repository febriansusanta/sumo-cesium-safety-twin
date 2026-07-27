import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  Entity,
  HeadingPitchRoll,
  Math as CesiumMath,
  Transforms,
  Viewer,
} from "cesium";
import type { Trajectory } from "../api";
import type { PlaybackStore } from "../simulation/playback-store";

const CAR_LENGTH = 4.6;
const CAR_WIDTH = 2.0;
const CAR_HEIGHT = 1.5;

export const VEHICLE_COLOR = "#38bdf8";
export const VEHICLE_HIGHLIGHT_COLOR = "#facc15";

const CAR_DIMENSIONS = new Cartesian3(CAR_LENGTH, CAR_WIDTH, CAR_HEIGHT);

export function positionAt(trajectory: Trajectory, time: number): Cartesian3 | undefined {
  const samples = trajectory.samples;
  const firstSample = samples[0];
  const lastSample = samples.at(-1);
  if (!firstSample || !lastSample || time < firstSample.t || time > lastSample.t) return undefined;
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle]!.t <= time) low = middle;
    else high = middle;
  }
  const first = samples[low];
  const second = samples[Math.min(low + 1, samples.length - 1)];
  if (!first || !second) return undefined;
  const span = second.t - first.t;
  const ratio = span <= 0 ? 0 : (time - first.t) / span;
  return Cartesian3.fromDegrees(
    first.longitude + (second.longitude - first.longitude) * ratio,
    first.latitude + (second.latitude - first.latitude) * ratio,
    CAR_HEIGHT / 2,
  );
}

/** Nearest-sample heading in degrees (SUMO convention: clockwise from north). */
export function headingAt(trajectory: Trajectory, time: number): number {
  const samples = trajectory.samples;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return 0;
  if (time <= first.t) return first.angle;
  if (time >= last.t) return last.angle;
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle]!.t <= time) low = middle;
    else high = middle;
  }
  const before = samples[low]!;
  const after = samples[Math.min(low + 1, samples.length - 1)]!;
  return time - before.t <= after.t - time ? before.angle : after.angle;
}

/** Highlight or reset a vehicle box when it participates in a selected event. */
export function highlightVehicle(entity: Entity, active: boolean): void {
  if (!entity.box) return;
  entity.box.material = new ColorMaterialProperty(
    Color.fromCssColorString(active ? VEHICLE_HIGHLIGHT_COLOR : VEHICLE_COLOR),
  );
}

export function renderVehicles(
  viewer: Viewer,
  trajectories: Trajectory[],
  playback: PlaybackStore,
): Entity[] {
  return trajectories.map((trajectory) =>
    viewer.entities.add({
      id: trajectory.vehicleId,
      name: trajectory.vehicleId,
      position: new CallbackPositionProperty(
        () => positionAt(trajectory, playback.value.time),
        false,
      ),
      orientation: new CallbackProperty(() => {
        const position = positionAt(trajectory, playback.value.time);
        if (!position) return undefined;
        const heading = CesiumMath.toRadians(headingAt(trajectory, playback.value.time) - 90);
        return Transforms.headingPitchRollQuaternion(
          position,
          new HeadingPitchRoll(heading, 0, 0),
        );
      }, false),
      box: {
        dimensions: CAR_DIMENSIONS,
        material: new ColorMaterialProperty(Color.fromCssColorString(VEHICLE_COLOR)),
        outline: true,
        outlineColor: Color.fromCssColorString("#071014").withAlpha(0.7),
      },
      properties: { sampleCount: trajectory.samples.length },
    }),
  );
}
