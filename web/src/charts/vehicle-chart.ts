import type { Trajectory } from "../api";
import type { PlaybackStore } from "../simulation/playback-store";

export function renderVehicleChart(
  container: HTMLElement,
  trajectory: Trajectory | undefined,
  playback: PlaybackStore,
): void {
  if (!trajectory) {
    container.textContent = "Select a vehicle to inspect speed and acceleration.";
    return;
  }
  const width = 280;
  const height = 82;
  const duration = Math.max(playback.value.duration, 1);
  const maxSpeed = Math.max(...trajectory.samples.map((sample) => sample.speed), 1);
  const maxAcceleration = Math.max(
    ...trajectory.samples.map((sample) => Math.abs(sample.acceleration)),
    1,
  );
  const pathFor = (value: (index: number) => number, maximum: number): string =>
    trajectory.samples
      .map((sample, index) => {
        const x = (sample.t / duration) * width;
        const y = height - ((value(index) + maximum) / (2 * maximum)) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const speed = pathFor((index) => trajectory.samples[index]?.speed ?? 0, maxSpeed);
  const acceleration = pathFor(
    (index) => trajectory.samples[index]?.acceleration ?? 0,
    maxAcceleration,
  );
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Speed and acceleration for ${trajectory.vehicleId}">
    <path class="speed-line" d="${speed}"/><path class="acceleration-line" d="${acceleration}"/>
    <line id="vehicle-cursor" class="cursor" x1="0" x2="0" y1="0" y2="${height}" />
  </svg><p class="legend"><span>Speed</span><span>Acceleration</span></p>`;
  const cursor = container.querySelector<SVGLineElement>("#vehicle-cursor");
  playback.subscribe((snapshot) => {
    const x = (snapshot.time / Math.max(snapshot.duration, 1)) * width;
    cursor?.setAttribute("x1", String(x));
    cursor?.setAttribute("x2", String(x));
  });
}
