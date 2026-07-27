import {
  CallbackProperty,
  Cartesian3,
  Entity,
  HeightReference,
  VerticalOrigin,
  Viewer,
} from "cesium";
import type { SafetyEvent } from "../api";
import type { PlaybackStore } from "../simulation/playback-store";

export const EVENT_COLORS: Record<SafetyEvent["severity"], string> = {
  normal: "#8aa5ab",
  warning: "#f1b65b",
  critical: "#ff5c52",
};

const TYPE_LABELS: Record<string, string> = {
  emergency_braking: "Emergency braking",
  hard_braking: "Hard braking",
  forced_intervention: "Forced lead braking",
  observed_response: "Follower response",
  following_follower: "Rear-end (follower)",
  following_leader: "Rear-end (leader)",
  merging_follower: "Merging (follower)",
  merging_leader: "Merging (leader)",
  crossing_follower: "Crossing (follower)",
  crossing_leader: "Crossing (leader)",
  oncoming_ego: "Oncoming (ego)",
  oncoming_foe: "Oncoming (foe)",
};

/** Human-readable label for a SUMO/SSM event type code. */
export function humanizeEventType(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Appear this long before startTime so a located event is on screen immediately. */
const EVENT_LEAD = 1;
/** Keep instantaneous events visible for at least this long. */
const EVENT_MIN_VISIBLE = 2.5;

/** Time window (in simulation seconds) during which an event marker is shown. */
export function eventWindow(event: SafetyEvent): [start: number, end: number] {
  return [event.startTime - EVENT_LEAD, Math.max(event.endTime, event.startTime + EVENT_MIN_VISIBLE)];
}

/** Duration of the pop-in when a marker first appears. */
const POP_DURATION = 0.45;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const u = t - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/**
 * Scale multiplier for a marker: eases in with a slight overshoot when it first
 * appears, then critical events keep a gentle pulse to hold attention.
 */
export function markerScale(time: number, start: number, severity: SafetyEvent["severity"]): number {
  const elapsed = time - start;
  if (elapsed <= 0) return 0;
  const base = elapsed < POP_DURATION ? Math.max(0, easeOutBack(elapsed / POP_DURATION)) : 1;
  if (severity === "critical") return base * (1 + 0.09 * Math.sin(elapsed * Math.PI * 2.2));
  return base;
}

/** Warning-triangle marker as an inline SVG data URI, tinted by severity. */
function eventIcon(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">` +
    `<path d="M15 3 L28 26 L2 26 Z" fill="${fill}" stroke="#0b181d" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<rect x="13.6" y="11" width="2.8" height="8" rx="1.4" fill="#0b181d"/>` +
    `<circle cx="15" cy="22.5" r="1.6" fill="#0b181d"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Render safety events as billboards that only appear while the event is active
 * on the playback timeline. `isLayerVisible` gates the whole layer on top of the
 * temporal window, so the show/hide toggle and the timeline compose cleanly.
 */
export function renderSafetyEvents(
  viewer: Viewer,
  events: SafetyEvent[],
  playback: PlaybackStore,
  isLayerVisible: () => boolean,
): Map<string, Entity> {
  const entities = new Map<string, Entity>();
  for (const event of events) {
    if (event.longitude === null || event.latitude === null) continue;
    const size = event.severity === "critical" ? 34 : 26;
    const [start, end] = eventWindow(event);
    const entity = viewer.entities.add({
      id: `event-${event.eventId}`,
      name: `${event.severity} ${event.type}`,
      position: Cartesian3.fromDegrees(event.longitude, event.latitude, 0),
      billboard: {
        show: new CallbackProperty(() => {
          if (!isLayerVisible()) return false;
          const time = playback.value.time;
          return time >= start && time <= end;
        }, false),
        image: eventIcon(EVENT_COLORS[event.severity]),
        width: size,
        height: size,
        scale: new CallbackProperty(
          () => markerScale(playback.value.time, start, event.severity),
          false,
        ),
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { eventId: event.eventId, vehicleIds: event.vehicleIds },
    });
    entities.set(event.eventId, entity);
  }
  return entities;
}
