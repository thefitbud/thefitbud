import { describe, expect, it } from "vitest";
import {
  durationMinutesFromExecution,
  elapsedSeconds,
  formatElapsedClock,
} from "./workoutDuration";

describe("elapsedSeconds across pause, resume and a relaunch (Z12-44)", () => {
  const startedAt = "2026-11-14T13:00:00.000Z";
  const at = (iso: string) => Date.parse(iso);

  it("counts from the server's start while running", () => {
    expect(
      elapsedSeconds({ startedAt, pausedAt: null, completedAt: null }, at("2026-11-14T13:23:14.000Z")),
    ).toBe(23 * 60 + 14);
  });

  it("stands still while paused, whatever the clock says", () => {
    const paused = { startedAt, pausedAt: "2026-11-14T13:10:00.000Z", completedAt: null };
    expect(elapsedSeconds(paused, at("2026-11-14T13:12:00.000Z"))).toBe(600);
    expect(elapsedSeconds(paused, at("2026-11-14T14:00:00.000Z"))).toBe(600);
  });

  it("carries on from the start after a resume (the server clears pausedAt)", () => {
    // Paused 13:10–13:20, resumed: wall-clock time from the start, the same
    // rule as the finished duration, so the two never disagree.
    const resumed = { startedAt, pausedAt: null, completedAt: null };
    expect(elapsedSeconds(resumed, at("2026-11-14T13:30:00.000Z"))).toBe(30 * 60);
  });

  it("is the same after a kill and relaunch: nothing is held in memory", () => {
    const snapshot = { startedAt, pausedAt: "2026-11-14T13:10:00.000Z", completedAt: null };
    // A relaunch is a fresh call on the same server snapshot.
    expect(elapsedSeconds({ ...snapshot }, at("2026-11-14T15:00:00.000Z"))).toBe(
      elapsedSeconds(snapshot, at("2026-11-14T13:11:00.000Z")),
    );
  });

  it("stops at the finish and agrees with the summary's minutes", () => {
    const done = { startedAt, pausedAt: null, completedAt: "2026-11-14T13:52:00.000Z" };
    expect(elapsedSeconds(done, at("2026-11-14T20:00:00.000Z"))).toBe(52 * 60);
    expect(durationMinutesFromExecution(done)).toBe(52);
  });

  it("never goes negative on a clock behind the server", () => {
    expect(
      elapsedSeconds({ startedAt, pausedAt: null, completedAt: null }, at("2026-11-14T12:59:00.000Z")),
    ).toBe(0);
  });

  it("formats as m:ss, and h:mm:ss past an hour", () => {
    expect(formatElapsedClock(23 * 60 + 14)).toBe("23:14");
    expect(formatElapsedClock(5)).toBe("0:05");
    expect(formatElapsedClock(3725)).toBe("1:02:05");
  });
});

describe("durationMinutesFromExecution", () => {
  it("returns bounded duration from start/complete", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-10-18T07:00:00.000Z",
        completedAt: "2026-10-18T07:48:00.000Z",
      }),
    ).toBe(48);
  });

  it("returns null when not completed", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-10-18T07:00:00.000Z",
        completedAt: null,
      }),
    ).toBeNull();
  });

  it("returns null for absurd unbounded durations", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-09-01T07:00:00.000Z",
        completedAt: "2026-10-18T07:00:00.000Z",
      }),
    ).toBeNull();
  });
});
