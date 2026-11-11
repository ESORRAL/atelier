import { describe, expect, it } from "vitest";
import type { NowPlaying } from "../../ipc/music";
import { displaySub, displayTitle, fmtDuration, pollInterval, progress } from "./player";

const np = (o: Partial<NowPlaying> = {}): NowPlaying => ({
  player: "p", name: "Spotify", status: "playing", title: "T", artist: "A", album: "B",
  lengthMs: 200000, positionMs: 50000, volume: 0.5, canGoNext: true, canGoPrevious: true, canControl: true, ...o,
});

describe("player", () => {
  it("polls only when visible and not idle", () => {
    expect(pollInterval(true, false)).toBe(1000);
    expect(pollInterval(false, false)).toBeNull();
    expect(pollInterval(true, true)).toBeNull();
  });
  it("formats durations", () => {
    expect(fmtDuration(102000)).toBe("01:42");
    expect(fmtDuration(3723000)).toBe("1:02:03");
    expect(fmtDuration(null)).toBe("--:--");
  });
  it("clamps progress", () => {
    expect(progress(np())).toBe(0.25);
    expect(progress(np({ positionMs: 999999 }))).toBe(1);
    expect(progress(np({ lengthMs: null }))).toBe(0);
  });
  it("falls back on missing metadata", () => {
    expect(displayTitle(np({ title: null }))).toBe("Titre inconnu");
    expect(displaySub(np())).toBe("A — B");
    expect(displaySub(np({ artist: null, album: null }))).toBe("Spotify");
  });
});
