export interface PlaybackSnapshot {
  time: number;
  duration: number;
  speed: number;
  playing: boolean;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

export class PlaybackStore {
  private snapshot: PlaybackSnapshot;
  private listeners = new Set<Listener>();
  private lastFrame: number | undefined;

  constructor(duration = 0) {
    this.snapshot = { time: 0, duration, speed: 1, playing: false };
  }

  get value(): Readonly<PlaybackSnapshot> {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setDuration(duration: number): void {
    this.update({ duration: Math.max(0, duration), time: 0, playing: false });
  }

  setTime(time: number): void {
    this.update({ time: Math.min(this.snapshot.duration, Math.max(0, time)) });
  }

  setSpeed(speed: number): void {
    this.update({ speed: Math.max(0.1, speed) });
  }

  play(): void {
    if (this.snapshot.time >= this.snapshot.duration) this.setTime(0);
    this.lastFrame = undefined;
    this.update({ playing: true });
  }

  pause(): void {
    this.update({ playing: false });
  }

  restart(): void {
    this.update({ time: 0, playing: false });
  }

  tick(timestamp: number): void {
    if (!this.snapshot.playing) {
      this.lastFrame = timestamp;
      return;
    }
    const elapsed = this.lastFrame === undefined ? 0 : (timestamp - this.lastFrame) / 1000;
    this.lastFrame = timestamp;
    const next = this.snapshot.time + elapsed * this.snapshot.speed;
    if (next >= this.snapshot.duration) {
      this.update({ time: this.snapshot.duration, playing: false });
    } else {
      this.update({ time: next });
    }
  }

  private update(change: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
