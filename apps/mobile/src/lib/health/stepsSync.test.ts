import { afterEach, describe, expect, it, vi } from "vitest";
import { setErrorReporter } from "../reportError";
import { recentDayWindows, windowContaining } from "./dayWindows";
import { runStepsSync, type StepsSyncInput } from "./stepsSync";
import { createStepsServer, fakeProvider, memoryFlag, TRAINEE_TOKEN, type FakeProviderScript } from "./testSupport";

// 01:30 on Thu 12 Nov in India, still Wed 11 Nov in UTC.
const NOW = new Date("2026-11-11T20:00:00.000Z");
const IST = "Asia/Kolkata";
const IST_WEEK = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];

function setup(
  script: FakeProviderScript,
  opts: { asked?: boolean; failDates?: string[]; relationship?: "active" | "ended" | "missing"; trigger?: "auto" | "user"; timeZone?: string; now?: Date } = {},
) {
  const server = createStepsServer({ failDates: opts.failDates, relationship: opts.relationship });
  const fake = fakeProvider(script);
  const memory = memoryFlag(opts.asked ?? false);
  const input: StepsSyncInput = {
    provider: fake.provider,
    api: server.api,
    timeZone: opts.timeZone ?? IST,
    now: () => opts.now ?? NOW,
    memory,
    trigger: opts.trigger ?? "auto",
  };
  return { server, fake, memory, run: () => runStepsSync(input) };
}

afterEach(() => {
  setErrorReporter(null);
  vi.restoreAllMocks();
});

describe("runStepsSync permission states", () => {
  it("asks once on the first automatic run, then reads and saves seven days", async () => {
    const totals = Object.fromEntries(IST_WEEK.map((d, i) => [d, 1000 * (i + 1)]));
    const { run, fake, memory, server } = setup({ permission: (asked) => (asked ? "denied" : "not_requested"), afterPrompt: "granted", totals });

    const result = await run();

    expect(fake.calls.prompts).toBe(1);
    expect(memory.asked).toBe(true);
    expect(result).toEqual({ kind: "synced", syncedAt: NOW.toISOString(), savedDays: 7 });
    expect([...server.days.keys()].sort()).toEqual(IST_WEEK);
    expect(server.days.get("2026-11-12")).toEqual({ localDate: "2026-11-12", steps: 7000, source: "health_connect", syncedAt: NOW.toISOString() });
  });

  it("does not ask again after a denial; the run reports denied and saves nothing", async () => {
    const { run, fake, server } = setup({ permission: (asked) => (asked ? "denied" : "not_requested"), afterPrompt: "denied", totals: { "2026-11-12": 500 } });

    expect(await run()).toEqual({ kind: "denied" });
    expect(await run()).toEqual({ kind: "denied" });
    expect(fake.calls.prompts).toBe(1);
    expect(fake.calls.reads).toHaveLength(0);
    // Nothing saved, so GET /me/steps/today stays null and the chip shows "Set up steps".
    expect(server.requests).toHaveLength(0);
  });

  it("an automatic run never prompts when the app already asked", async () => {
    const { run, fake } = setup({ permission: () => "not_requested" }, { asked: true });
    expect(await run()).toEqual({ kind: "not_requested" });
    expect(fake.calls.prompts).toBe(0);
  });

  it("a user-started run (setup screen) asks again after a denial", async () => {
    const { run, fake, server } = setup(
      { permission: (asked) => (asked ? "denied" : "not_requested"), afterPrompt: "granted", totals: { "2026-11-12": 4200 } },
      { asked: true, trigger: "user" },
    );
    expect(await run()).toMatchObject({ kind: "synced", savedDays: 1 });
    expect(fake.calls.prompts).toBe(1);
    expect(server.days.get("2026-11-12")?.steps).toBe(4200);
  });

  it("an already granted permission syncs without a prompt", async () => {
    const { run, fake } = setup({ permission: () => "granted", totals: { "2026-11-12": 10 } });
    expect(await run()).toMatchObject({ kind: "synced" });
    expect(fake.calls.prompts).toBe(0);
  });

  it.each(["unavailable", "not_installed", "needs_update"] as const)(
    "stops before asking when the store is %s",
    async (availability) => {
      const { run, fake, server, memory } = setup({ availability });
      expect(await run()).toEqual({ kind: availability });
      expect(fake.calls.prompts).toBe(0);
      expect(memory.asked).toBe(false);
      expect(server.requests).toHaveLength(0);
    },
  );

  it("HealthKit after a prompt (answer hidden) with no samples saves nothing", async () => {
    const { run, server } = setup({ source: "apple_health", permission: () => "not_requested", afterPrompt: "requested", totals: {} });
    expect(await run()).toEqual({ kind: "no_data" });
    expect(server.requests).toHaveLength(0);
  });

  it("a native failure while checking permission is reported with a code, not a guess", async () => {
    const reports: { where: string; name: string; message: string }[] = [];
    setErrorReporter((where, err) => reports.push({ where, name: err.name, message: err.message }));
    const { run, fake } = setup({});
    fake.provider.permission = async () => {
      throw new Error("module missing");
    };
    expect(await run()).toEqual({ kind: "error", code: "STEPS-NATIVE" });
    expect(reports).toEqual([{ where: "steps.sync.native", name: "Error", message: "module missing" }]);
  });

  it("an automatic run prompts when HealthKit says it should, even with the app's flag set", async () => {
    // The keychain flag survives a reinstall; HealthKit then asks afresh.
    const { run, fake } = setup(
      { source: "apple_health", permission: () => "not_requested", afterPrompt: "requested", totals: { "2026-11-12": 900 } },
      { asked: true },
    );
    expect(await run()).toMatchObject({ kind: "synced", savedDays: 1 });
    expect(fake.calls.prompts).toBe(1);
  });

  it("a read failure returns STEPS-READ and saves nothing", async () => {
    const reports: string[] = [];
    setErrorReporter((where) => reports.push(where));
    const { run, server } = setup({ readError: new Error("read failed") });
    expect(await run()).toEqual({ kind: "error", code: "STEPS-READ" });
    expect(reports).toEqual(["steps.sync.read"]);
    expect(server.requests).toHaveLength(0);
  });
});

describe("runStepsSync upserts", () => {
  it("saves one PUT per day with data, oldest first, all with the same syncedAt and source", async () => {
    const { run, server } = setup({ source: "apple_health", permission: () => "requested", totals: { "2026-11-08": 6500, "2026-11-10": 0, "2026-11-12": 1200 } });

    expect(await run()).toEqual({ kind: "synced", syncedAt: NOW.toISOString(), savedDays: 3 });
    expect(server.requests.map((r) => r.localDate)).toEqual(["2026-11-08", "2026-11-10", "2026-11-12"]);
    for (const request of server.requests) {
      expect(request.auth).toBe(`Bearer ${TRAINEE_TOKEN}`);
      expect(request.body).toEqual(expect.objectContaining({ source: "apple_health", syncedAt: NOW.toISOString() }));
    }
  });

  it("days without data are skipped; today is saved as 0 only when access is confirmed", async () => {
    const granted = setup({ permission: () => "granted", totals: { "2026-11-09": 3000 } });
    await granted.run();
    expect(granted.server.requests.map((r) => [r.localDate, (r.body as { steps: number }).steps])).toEqual([
      ["2026-11-09", 3000],
      ["2026-11-12", 0],
    ]);

    const hidden = setup({ source: "apple_health", permission: () => "requested", totals: { "2026-11-09": 3000 } });
    await hidden.run();
    expect(hidden.server.requests.map((r) => r.localDate)).toEqual(["2026-11-09"]);
  });

  it("a total the server would reject (over the daily maximum) is skipped, not clamped", async () => {
    const { run, server } = setup({ permission: () => "granted", totals: { "2026-11-11": 250000, "2026-11-12": 900 } });
    expect(await run()).toMatchObject({ kind: "synced", savedDays: 1 });
    expect(server.requests.map((r) => r.localDate)).toEqual(["2026-11-12"]);
  });

  it("a failed day does not stop the others, and the run reports STEPS-SAVE", async () => {
    const reports: string[] = [];
    setErrorReporter((where) => reports.push(where));
    const { run, server } = setup({ permission: () => "granted", totals: { "2026-11-10": 100, "2026-11-11": 200, "2026-11-12": 300 } }, { failDates: ["2026-11-11"] });
    expect(await run()).toEqual({ kind: "error", code: "STEPS-SAVE" });
    expect(reports).toEqual(["steps.sync.save"]);
    expect([...server.days.keys()].sort()).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it.each([
    { relationship: "ended" as const, status: 409 },
    { relationship: "missing" as const, status: 404 },
  ])("a $relationship relationship ($status) stops at the first PUT, is not an error and is not reported", async ({ relationship }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const reports: string[] = [];
    setErrorReporter((where) => reports.push(where));
    const { run, server } = setup(
      { permission: () => "granted", totals: { "2026-11-10": 100, "2026-11-11": 200, "2026-11-12": 300 } },
      { relationship },
    );
    expect(await run()).toEqual({ kind: "ended" });
    expect(server.requests.map((r) => r.localDate)).toEqual(["2026-11-10"]);
    expect(server.days.size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(reports).toEqual([]);
  });

  it("a repeated sync is idempotent and a later reading replaces the stored total", async () => {
    const server = createStepsServer();
    const totals: Record<string, number> = { "2026-11-12": 1000 };
    const fake = fakeProvider({ permission: () => "granted", totals });
    let now = NOW;
    const input: StepsSyncInput = { provider: fake.provider, api: server.api, timeZone: IST, now: () => now, memory: memoryFlag(true), trigger: "auto" };

    await runStepsSync(input);
    await runStepsSync(input);
    expect(server.days.get("2026-11-12")?.steps).toBe(1000);

    totals["2026-11-12"] = 2500;
    now = new Date(NOW.getTime() + 60 * 60 * 1000);
    await runStepsSync(input);
    expect(server.days.get("2026-11-12")).toMatchObject({ steps: 2500, syncedAt: now.toISOString() });
  });
});

describe("timezone day boundaries", () => {
  it("days are the trainee's local days, not UTC days", async () => {
    const { run, fake, server } = setup({ permission: () => "granted", totals: { "2026-11-12": 50 } });
    await run();
    const windows = fake.calls.reads[0]!;
    expect(windows.map((w) => w.localDate)).toEqual(IST_WEEK);
    // Thu 12 Nov in India starts at 18:30 UTC on Wed 11 Nov.
    expect(windows[6]!.start.toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(windows[6]!.end.toISOString()).toBe("2026-11-12T18:30:00.000Z");
    expect(server.days.has("2026-11-12")).toBe(true);
  });

  it("the same instant in UTC is still Wed 11 Nov", () => {
    const windows = recentDayWindows("UTC", NOW);
    expect(windows[6]).toEqual({
      localDate: "2026-11-11",
      start: new Date("2026-11-11T00:00:00.000Z"),
      end: new Date("2026-11-12T00:00:00.000Z"),
    });
  });

  it("windows are contiguous and a DST change gives a 25-hour day", () => {
    // US clocks went back on Sun 1 Nov 2026.
    const windows = recentDayWindows("America/New_York", new Date("2026-11-04T15:00:00.000Z"));
    expect(windows.map((w) => w.localDate)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.start.getTime()).toBe(windows[i - 1]!.end.getTime());
    }
    const hours = windows.map((w) => (w.end.getTime() - w.start.getTime()) / 3_600_000);
    expect(hours).toEqual([24, 24, 24, 25, 24, 24, 24]);
  });

  it("an instant exactly at local midnight belongs to the new day", () => {
    const windows = recentDayWindows(IST, NOW);
    expect(windowContaining(windows, new Date("2026-11-11T18:30:00.000Z"))?.localDate).toBe("2026-11-12");
    expect(windowContaining(windows, new Date("2026-11-11T18:29:59.999Z"))?.localDate).toBe("2026-11-11");
    expect(windowContaining(windows, new Date("2026-11-12T18:30:00.000Z"))).toBeUndefined();
  });
});
