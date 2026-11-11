import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppleHealthProvider, type AppleHealthPort } from "./appleHealth";
import { recentDayWindows } from "./dayWindows";
import { createHealthConnectProvider, HEALTH_CONNECT_SDK, READ_STEPS_PERMISSION, type HealthConnectPort } from "./healthConnect";

const IST = "Asia/Kolkata";
const NOW = new Date("2026-11-11T20:00:00.000Z"); // Thu 12 Nov, 01:30 in India

function applePort(overrides: Partial<AppleHealthPort> = {}): AppleHealthPort {
  return {
    isHealthDataAvailable: vi.fn(async () => true),
    requestStatus: vi.fn(async () => "should_request" as const),
    requestAuthorization: vi.fn(async () => true),
    dailyStepStatistics: vi.fn(async () => []),
    ...overrides,
  };
}

function hcPort(overrides: Partial<HealthConnectPort> = {}): HealthConnectPort {
  return {
    getSdkStatus: vi.fn(async () => HEALTH_CONNECT_SDK.AVAILABLE),
    initialize: vi.fn(async () => true),
    getGrantedPermissions: vi.fn(async () => []),
    requestPermission: vi.fn(async () => [READ_STEPS_PERMISSION]),
    aggregateSteps: vi.fn(async () => ({ COUNT_TOTAL: 0, dataOrigins: [] })),
    ...overrides,
  };
}

describe("Apple Health adapter", () => {
  it("maps availability and the request status (read denials are hidden)", async () => {
    const port = applePort();
    const provider = createAppleHealthProvider(port);
    expect(provider.source).toBe("apple_health");
    expect(await provider.availability()).toBe("available");
    expect(await provider.permission(false)).toBe("not_requested");
    vi.mocked(port.requestStatus).mockResolvedValue("unnecessary");
    expect(await provider.requestPermission()).toBe("requested");
    expect(port.requestAuthorization).toHaveBeenCalledTimes(1);

    const noHealth = createAppleHealthProvider(applePort({ isHealthDataAvailable: async () => false }));
    expect(await noHealth.availability()).toBe("unavailable");
  });

  it("runs one daily collection query anchored at the first local midnight and maps buckets to days", async () => {
    const windows = recentDayWindows(IST, NOW);
    const port = applePort({
      dailyStepStatistics: vi.fn(async () => [
        { sumQuantity: { quantity: 4321.6, startDate: "2026-11-09T00:00:00.000+05:30" } },
        { sumQuantity: null },
        { sumQuantity: { quantity: 812, startDate: "2026-11-11T18:30:00.000Z" } },
        // Outside the window: ignored.
        { sumQuantity: { quantity: 99, startDate: "2026-11-01T00:00:00.000+05:30" } },
      ]),
    });
    const totals = await createAppleHealthProvider(port).readDailyTotals(windows);

    expect(port.dailyStepStatistics).toHaveBeenCalledWith(windows[0]!.start, windows[0]!.start, windows[6]!.end);
    expect(windows[0]!.start.toISOString()).toBe("2026-11-05T18:30:00.000Z");
    expect(totals).toEqual([
      { localDate: "2026-11-06", steps: null },
      { localDate: "2026-11-07", steps: null },
      { localDate: "2026-11-08", steps: null },
      { localDate: "2026-11-09", steps: 4322 },
      { localDate: "2026-11-10", steps: null },
      { localDate: "2026-11-11", steps: null },
      { localDate: "2026-11-12", steps: 812 },
    ]);
  });
});

describe("Health Connect adapter", () => {
  it.each([
    [HEALTH_CONNECT_SDK.AVAILABLE, "available"],
    [HEALTH_CONNECT_SDK.PROVIDER_UPDATE_REQUIRED, "needs_update"],
    [HEALTH_CONNECT_SDK.UNAVAILABLE, "not_installed"],
  ] as const)("getSdkStatus %i is %s", async (status, expected) => {
    const provider = createHealthConnectProvider(hcPort({ getSdkStatus: async () => status }));
    expect(await provider.availability()).toBe(expected);
  });

  it("tells never asked from denied with the app's own record, and asks for READ_STEPS only", async () => {
    const port = hcPort();
    const provider = createHealthConnectProvider(port);
    expect(await provider.permission(false)).toBe("not_requested");
    expect(await provider.permission(true)).toBe("denied");
    expect(await provider.requestPermission()).toBe("granted");
    expect(port.requestPermission).toHaveBeenCalledWith([{ accessType: "read", recordType: "Steps" }]);
    expect(port.initialize).toHaveBeenCalledTimes(1);

    vi.mocked(port.getGrantedPermissions).mockResolvedValue([{ accessType: "read", recordType: "Steps" }]);
    expect(await provider.permission(true)).toBe("granted");
    vi.mocked(port.requestPermission).mockResolvedValue([]);
    expect(await provider.requestPermission()).toBe("denied");
  });

  it("a write permission or another record type is not read access to steps", async () => {
    const provider = createHealthConnectProvider(
      hcPort({ getGrantedPermissions: async () => [{ accessType: "write", recordType: "Steps" }, { accessType: "read", recordType: "Distance" }] }),
    );
    expect(await provider.permission(true)).toBe("denied");
  });

  it("aggregates each trainee-local day by its own instant range", async () => {
    const windows = recentDayWindows(IST, NOW);
    const port = hcPort({
      aggregateSteps: vi.fn(async (start: Date) => {
        const iso = start.toISOString();
        // Wed 11 Nov: a recorded zero. Thu 12 Nov: steps. Other days: nothing recorded.
        if (iso === "2026-11-10T18:30:00.000Z") return { COUNT_TOTAL: 0, dataOrigins: ["com.google.android.apps.fitness"] };
        if (iso === "2026-11-11T18:30:00.000Z") return { COUNT_TOTAL: 2345.4, dataOrigins: ["com.google.android.apps.fitness"] };
        return { COUNT_TOTAL: 0, dataOrigins: [] };
      }),
    });
    const totals = await createHealthConnectProvider(port).readDailyTotals(windows);
    expect(vi.mocked(port.aggregateSteps).mock.calls).toEqual(windows.map((w) => [w.start, w.end]));
    expect(totals.slice(4)).toEqual([
      { localDate: "2026-11-10", steps: null },
      { localDate: "2026-11-11", steps: 0 },
      { localDate: "2026-11-12", steps: 2345 },
    ]);
  });

  describe("when the device zone is not the trainee's stored zone", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("files each step under the trainee-local day it happened on", async () => {
      // Phone set to California, trainee stored as India. Version 3.5.3's
      // period grouping would cut Pacific days and file them by Pacific date.
      process.env.TZ = "America/Los_Angeles";
      const samples = [
        { at: "2026-11-11T19:00:00.000Z", count: 1000 }, // 00:30 Thu 12 Nov in India, still Wed 11 Nov in California
        { at: "2026-11-11T12:00:00.000Z", count: 400 }, // 17:30 Wed 11 Nov in India
        { at: "2026-11-11T18:29:59.000Z", count: 50 }, // 23:59:59 Wed 11 Nov in India
      ];
      const port = hcPort({
        // Health Connect sums the records inside an instant range, whatever the device zone.
        aggregateSteps: vi.fn(async (start: Date, end: Date) => {
          const inside = samples.filter((x) => {
            const t = Date.parse(x.at);
            return t >= start.getTime() && t < end.getTime();
          });
          const count = inside.reduce((sum, x) => sum + x.count, 0);
          return { COUNT_TOTAL: count, dataOrigins: inside.length > 0 ? ["com.google.android.apps.fitness"] : [] };
        }),
      });
      const totals = await createHealthConnectProvider(port).readDailyTotals(recentDayWindows(IST, NOW));
      expect(totals.slice(5)).toEqual([
        { localDate: "2026-11-11", steps: 450 },
        { localDate: "2026-11-12", steps: 1000 },
      ]);
    });
  });

  it("a failed initialize is an error, not a denial", async () => {
    const provider = createHealthConnectProvider(hcPort({ initialize: async () => false }));
    await expect(provider.permission(false)).rejects.toThrow("Health Connect did not initialize");
  });
});
