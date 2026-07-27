import type { TimeSeries } from "../api";
import type { PlaybackStore } from "../simulation/playback-store";

const width = 280;
const height = 92;
/** Break the line where no conflict is active for longer than this (seconds). */
const GAP_SECONDS = 0.6;

// Each render subscribes to playback for the cursor; track the previous
// unsubscribe per container so repeated renders don't leak listeners.
const cursorCleanups = new WeakMap<HTMLElement, () => void>();

export function renderTtcChart(
  container: HTMLElement,
  series: TimeSeries | undefined,
  playback: PlaybackStore,
): void {
  cursorCleanups.get(container)?.();

  // Dozens of conflicts overlap in time, so a per-conflict spaghetti plot is
  // unreadable at this size. Collapse to the minimum TTC across all active
  // conflicts at each instant — the "closest call" envelope over time.
  const minByTime = new Map<number, number>();
  for (const point of series?.points ?? []) {
    if (point.value === null || point.value > 10) continue;
    const current = minByTime.get(point.t);
    if (current === undefined || point.value < current) minByTime.set(point.t, point.value);
  }
  const samples = [...minByTime.entries()]
    .map(([t, value]) => ({ t, value }))
    .sort((a, b) => a.t - b.t);

  const maxTime = Math.max(playback.value.duration, 1);
  const maxValue = Math.max(...samples.map((sample) => sample.value), 4);
  const scaleX = (t: number): number => (t / maxTime) * width;
  const scaleY = (value: number): number => height - (value / maxValue) * height;

  // Split into continuous segments, starting a new one across any gap.
  const segments: { t: number; value: number }[][] = [];
  let previousT = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (sample.t - previousT > GAP_SECONDS) segments.push([]);
    segments.at(-1)?.push(sample);
    previousT = sample.t;
  }

  const paths: string[] = [];
  const dots: string[] = [];
  for (const segment of segments) {
    if (segment.length === 1) {
      const only = segment[0]!;
      dots.push(`<circle class="ttc-point" cx="${scaleX(only.t).toFixed(1)}" cy="${scaleY(only.value).toFixed(1)}" r="1.6" />`);
      continue;
    }
    const path = segment
      .map((sample, index) => `${index === 0 ? "M" : "L"}${scaleX(sample.t).toFixed(1)},${scaleY(sample.value).toFixed(1)}`)
      .join(" ");
    paths.push(`<path class="ttc-line" d="${path}" />`);
  }

  const thresholdY = scaleY(3).toFixed(1);
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="ttc-title ttc-desc">
    <title id="ttc-title">Minimum TTC over simulation time</title>
    <desc id="ttc-desc">The lowest time-to-collision across all active conflicts at each moment, from the SUMO SSM device. Dips toward the dashed threshold mark the closest calls.</desc>
    <line class="threshold" x1="0" x2="${width}" y1="${thresholdY}" y2="${thresholdY}" />
    ${paths.join("\n    ")}
    ${dots.join("\n    ")}
    <line id="ttc-cursor" class="cursor" x1="0" x2="0" y1="0" y2="${height}" />
  </svg>`;

  const cursor = container.querySelector<SVGLineElement>("#ttc-cursor");
  const unsubscribe = playback.subscribe((snapshot) => {
    const x = (snapshot.time / Math.max(snapshot.duration, 1)) * width;
    cursor?.setAttribute("x1", String(x));
    cursor?.setAttribute("x2", String(x));
  });
  cursorCleanups.set(container, unsubscribe);
}
