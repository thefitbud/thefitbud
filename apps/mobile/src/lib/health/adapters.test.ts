import { describe, expect, it, vi } from "vitest";
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
    aggregateStepsByDay: vi.fn(async () => []),
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

  it("aggregates by day over the seven windows and maps each period by its local date", async () => {
    const windows = recentDayWindows(IST, NOW);
    const port = hcPort({
      aggregateStepsByDay: vi.fn(async () => [
        { startTime: "2026-11-10T00:00", result: { COUNT_TOTAL: 0, dataOrigins: [] } },
        { startTime: "2026-11-11T00:00", result: { COUNT_TOTAL: 0, dataOrigins: ["com.google.android.apps.fitness"] } },
        { startTime: "2026-11-12T00:00", result: { COUNT_TOTAL: 2345, dataOrigins: ["com.google.android.apps.fitness"] } },
      ]),
    });
    const totals = await createHealthConnectProvider(port).readDailyTotals(windows);
    expect(port.aggregateStepsByDay).toHaveBeenCalledWith(windows[0]!.start, windows[6]!.end);
    expect(totals.slice(4)).toEqual([
      // No data origin and zero: nothing recorded that day.
      { localDate: "2026-11-10", steps: null },
      // A recorded zero is a reading.
      { localDate: "2026-11-11", steps: 0 },
      { localDate: "2026-11-12", steps: 2345 },
    ]);
  });

  it("a failed initialize is an error, not a denial", async () => {
    const provider = createHealthConnectProvider(hcPort({ initialize: async () => false }));
    await expect(provider.permission(false)).rejects.toThrow("Health Connect did not initialize");
  });
});
