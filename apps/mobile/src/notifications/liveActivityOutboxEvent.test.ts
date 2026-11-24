import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

import type {
  LiveActivityNativeModule,
  NativeOutboxRowEvent,
} from "../../modules/live-activity";
import {
  createLiveActivityModuleAccess,
  subscribeLiveActivityOutbox,
} from "./liveActivityNative";

/**
 * Z14-5 (D-W14-12): the native module tells JS when a lock-screen Log button
 * appended a row, so a running app can drain at once (Z14-8 wires the drain).
 */

type Listener = (event: NativeOutboxRowEvent) => void;

function emittingModule(supported = true) {
  const listeners = new Set<Listener>();
  const mod = {
    isSupported: vi.fn(() => supported),
    start: vi.fn(async () => "activity-1"),
    update: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    restState: vi.fn(() => ({ running: false })),
    addListener: vi.fn((eventName: "onOutboxRow", listener: Listener) => {
      expect(eventName).toBe("onOutboxRow");
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
  } satisfies LiveActivityNativeModule;
  const emit = (count: number) => {
    for (const listener of [...listeners]) listener({ count });
  };
  return { mod, emit, listeners };
}

describe("subscribeLiveActivityOutbox", () => {
  it("passes each row count to the listener until unsubscribed", () => {
    const { mod, emit, listeners } = emittingModule();
    const access = createLiveActivityModuleAccess({ platformOS: "ios", loadModule: () => mod });
    const counts: number[] = [];

    const unsubscribe = subscribeLiveActivityOutbox(access, (count) => counts.push(count));
    emit(1);
    emit(2);
    unsubscribe();
    emit(3);

    expect(counts).toEqual([1, 2]);
    expect(listeners.size).toBe(0);
  });

  it("listens on Android too, and even when the activity is turned off (rows still drain)", () => {
    const { mod, emit } = emittingModule(false);
    const access = createLiveActivityModuleAccess({ platformOS: "android", loadModule: () => mod });
    const counts: number[] = [];
    subscribeLiveActivityOutbox(access, (count) => counts.push(count));
    emit(1);
    expect(counts).toEqual([1]);
  });

  it("never calls back on web or with a build that has no event, and never throws", () => {
    const { mod } = emittingModule();
    const web = createLiveActivityModuleAccess({ platformOS: "web", loadModule: () => mod });
    expect(() => subscribeLiveActivityOutbox(web, () => undefined)()).not.toThrow();
    expect(mod.addListener).not.toHaveBeenCalled();

    const olderBuild: LiveActivityNativeModule = { ...emittingModule().mod };
    delete olderBuild.addListener;
    const old = createLiveActivityModuleAccess({ platformOS: "ios", loadModule: () => olderBuild });
    expect(() => subscribeLiveActivityOutbox(old, () => undefined)()).not.toThrow();
  });

  it("a listener or native error is warned by name only, not thrown", () => {
    const warn = vi.fn();
    const { mod, emit } = emittingModule();
    const access = createLiveActivityModuleAccess({ platformOS: "ios", loadModule: () => mod });
    subscribeLiveActivityOutbox(
      access,
      () => {
        throw new TypeError("Romanian deadlift set 3 failed");
      },
      warn,
    );
    expect(() => emit(1)).not.toThrow();
    expect(warn).toHaveBeenCalledWith("[liveActivity] outbox listener failed: TypeError");

    const broken = {
      ...mod,
      addListener: vi.fn(() => {
        throw new Error("no emitter");
      }),
    };
    const brokenAccess = createLiveActivityModuleAccess({
      platformOS: "ios",
      loadModule: () => broken,
    });
    expect(() => subscribeLiveActivityOutbox(brokenAccess, () => undefined, warn)()).not.toThrow();
    expect(warn).toHaveBeenCalledWith("[liveActivity] addListener failed: Error");
  });
});
