import { describe, expect, it } from "vitest";
import { PlaybackStore } from "../src/simulation/playback-store";

describe("PlaybackStore", () => {
  it("advances, clamps and restarts synchronized time", () => {
    const store = new PlaybackStore(10);
    store.setSpeed(2);
    store.play();
    store.tick(1_000);
    store.tick(2_500);
    expect(store.value.time).toBe(3);
    store.setTime(20);
    expect(store.value.time).toBe(10);
    store.restart();
    expect(store.value).toMatchObject({ time: 0, playing: false });
  });
});
