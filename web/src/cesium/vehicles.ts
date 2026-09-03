import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  Color,
  ColorBlendMode,
  ConstantProperty,
  Entity,
  HeadingPitchRoll,
  Math as CesiumMath,
  ShadowMode,
  Transforms,
  Viewer,
} from "cesium";
import type { Trajectory } from "../api";
import type { PlaybackStore } from "../simulation/playback-store";
import { lowPolyCarModelUri } from "./low-poly-car";

const CAR_GROUND_CLEARANCE = 0.08;
const MODEL_HEADING_OFFSET_DEGREES = 90;

export const VEHICLE_COLOR = "#38bdf8";
export const VEHICLE_HIGHLIGHT_COLOR = "#facc15";

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
    CAR_GROUND_CLEARANCE,
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

/** Highlight or reset a vehicle model when it participates in a selected event. */
export function highlightVehicle(entity: Entity, active: boolean): void {
  const color = Color.fromCssColorString(active ? VEHICLE_HIGHLIGHT_COLOR : VEHICLE_COLOR);
  if (entity.model) {
    entity.model.color = new ConstantProperty(color);
    entity.model.silhouetteColor = new ConstantProperty(
      Color.fromCssColorString(active ? VEHICLE_HIGHLIGHT_COLOR : "#071014"),
    );
    entity.model.silhouetteSize = new ConstantProperty(active ? 3 : 0);
  }
}

export function renderVehicles(
  viewer: Viewer,
  trajectories: Trajectory[],
  playback: PlaybackStore,
): Entity[] {
  const modelUri = lowPolyCarModelUri();
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
        const heading = CesiumMath.toRadians(
          headingAt(trajectory, playback.value.time) + MODEL_HEADING_OFFSET_DEGREES,
        );
        return Transforms.headingPitchRollQuaternion(
          position,
          new HeadingPitchRoll(heading, 0, 0),
        );
      }, false),
      model: {
        uri: modelUri,
        scale: 1,
        minimumPixelSize: 11,
        maximumScale: 5,
        shadows: ShadowMode.DISABLED,
        color: Color.fromCssColorString(VEHICLE_COLOR),
        colorBlendMode: ColorBlendMode.MIX,
        colorBlendAmount: 0.16,
        silhouetteColor: Color.fromCssColorString("#071014"),
        silhouetteSize: 0,
      },
      properties: { sampleCount: trajectory.samples.length },
    }),
  );
}
