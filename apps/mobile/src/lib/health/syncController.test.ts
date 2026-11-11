import { describe, expect, it } from "vitest";
import { cameToForeground, createStepsSyncController } from "./syncController";
import { loadHealthStepsProvider } from "./provider";
import { createStepsServer, fakeProvider, memoryFlag } from "./testSupport";

const NOW = new Date("2026-11-11T08:00:00.000Z");

function controllerWith(script: Parameters<typeof fakeProvider>[0]) {
  const fake = fakeProvider(script);
  const server = createStepsServer();
  let loads = 0;
  const controller = createStepsSyncController({
    loadProvider: async () => {
      loads += 1;
      return fake.provider;
    },
    memory: memoryFlag(),
    now: () => NOW,
  });
  return { controller, fake, server, loads: () => loads };
}

describe("steps sync controller", () => {
  it("runs the app-start sync once per launch", async () => {
    const { controller, server, fake } = controllerWith({ permission: () => "granted", totals: { "2026-11-11": 700 } });
    const first = controller.syncOnLaunch({ api: server.api, timeZone: "Asia/Kolkata" });
    expect(first).not.toBeNull();
    await first;
    expect(controller.syncOnLaunch({ api: server.api, timeZone: "Asia/Kolkata" })).toBeNull();
    expect(fake.calls.reads).toHaveLength(1);
  });

  it("joins a running sync instead of starting a second one", async () => {
    const { controller, server, fake } = controllerWith({ permission: () => "granted", totals: { "2026-11-11": 700 } });
    const a = controller.sync({ api: server.api, timeZone: "Asia/Kolkata", trigger: "auto" });
    const b = controller.sync({ api: server.api, timeZone: "Asia/Kolkata", trigger: "auto" });
    expect(b).toBe(a);
    await a;
    expect(fake.calls.reads).toHaveLength(1);
    await controller.sync({ api: server.api, timeZone: "Asia/Kolkata", trigger: "auto" });
    expect(fake.calls.reads).toHaveLength(2);
  });

  it("publishes syncing, then the result, and keeps the last syncedAt after a later failure", async () => {
    const { controller, server, fake } = controllerWith({ permission: () => "granted", totals: { "2026-11-11": 700 } });
    const seen: string[] = [];
    const unsubscribe = controller.subscribe(() => seen.push(controller.getSnapshot().status.kind));
    expect(controller.getSnapshot()).toEqual({ status: { kind: "idle" }, syncedAt: null });

    await controller.sync({ api: server.api, timeZone: "Asia/Kolkata", trigger: "auto" });
    expect(controller.getSnapshot()).toEqual({
      status: { kind: "synced", syncedAt: NOW.toISOString(), savedDays: 1 },
      syncedAt: NOW.toISOString(),
    });

    fake.provider.availability = async () => "unavailable";
    await controller.sync({ api: server.api, timeZone: "Asia/Kolkata", trigger: "auto" });
    expect(controller.getSnapshot()).toEqual({ status: { kind: "unavailable" }, syncedAt: NOW.toISOString() });
    expect(seen).toEqual(["syncing", "synced", "syncing", "unavailable"]);
    unsubscribe();
  });

  it("only a change into the active state counts as coming to the foreground", () => {
    expect(cameToForeground("background", "active")).toBe(true);
    expect(cameToForeground("inactive", "active")).toBe(true);
    expect(cameToForeground("active", "active")).toBe(false);
    expect(cameToForeground("active", "background")).toBe(false);
  });

  it("web and tests get the unavailable provider, which never prompts or reads", async () => {
    const provider = await loadHealthStepsProvider();
    expect(await provider.availability()).toBe("unavailable");
  });
});
