/**
 * iOS sheet sequencing: the next modal opens from Modal onDismiss (or the
 * fallback), never on a fixed 900 ms timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "ios" as string }));

vi.mock("react-native", () => ({
  Platform: platform,
}));

import {
  MODAL_CLOSE_FALLBACK_MS,
  createModalCloseGate,
} from "./modalCloseGate";

describe("createModalCloseGate", () => {
  beforeEach(() => {
    platform.OS = "ios";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs at once when not on iOS", () => {
    platform.OS = "android";
    const gate = createModalCloseGate();
    const open = vi.fn();
    gate.afterClose(open);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("on iOS waits for notifyClosed, not a fixed 900 ms delay", () => {
    const gate = createModalCloseGate();
    const open = vi.fn();
    gate.afterClose(open);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(open).not.toHaveBeenCalled();
    gate.notifyClosed();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("on iOS falls back once if onDismiss never fires", () => {
    const gate = createModalCloseGate();
    const open = vi.fn();
    gate.afterClose(open);
    vi.advanceTimersByTime(MODAL_CLOSE_FALLBACK_MS - 1);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a queued open without running it", () => {
    const gate = createModalCloseGate();
    const open = vi.fn();
    gate.afterClose(open);
    gate.cancel();
    gate.notifyClosed();
    vi.advanceTimersByTime(MODAL_CLOSE_FALLBACK_MS + 50);
    expect(open).not.toHaveBeenCalled();
  });
});
