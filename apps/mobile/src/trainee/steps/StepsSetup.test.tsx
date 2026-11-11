/**
 * Steps setup screens (Z9-10). The health provider is scripted with Z9-9's
 * `fakeProvider`; the sync controller, its permission rules and the
 * `/me/steps/days` contract stand-in are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Linking } from "react-native";
import { createStepsSyncController } from "../../lib/health/syncController";
import { createStepsServer, fakeProvider, memoryFlag } from "../../lib/health/testSupport";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";

const NOW = new Date("2026-11-11T08:00:00.000Z");
const hoisted = vi.hoisted(() => ({
  current: null as null | { provider: unknown; controller: unknown },
  api: null as unknown,
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => mockAuth({ api: hoisted.api, me: { timezone: "Asia/Kolkata" } }),
}));

vi.mock("../../lib/health", async () => {
  const actual = await vi.importActual<typeof import("../../lib/health")>("../../lib/health");
  const { useSyncExternalStore } = await import("react");
  return {
    ...actual,
    loadHealthStepsProvider: async () => hoisted.current!.provider,
    stepsSyncController: new Proxy({}, { get: (_t, k) => (hoisted.current!.controller as never)[k] }),
    useStepsSyncStatus: () => {
      const c = hoisted.current!.controller as ReturnType<typeof createStepsSyncController>;
      return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
    },
  };
});

import { StepsSetupScreen, devPreview } from "./StepsSetupScreen";
import { noticeForResult } from "./useStepsSetup";

function setup(script: Parameters<typeof fakeProvider>[0]) {
  const fake = fakeProvider(script);
  const server = createStepsServer();
  hoisted.api = server.api;
  hoisted.current = {
    provider: fake.provider,
    controller: createStepsSyncController({
      loadProvider: async () => fake.provider,
      memory: memoryFlag(),
      now: () => NOW,
    }),
  };
  return { fake, server };
}

function renderScreen() {
  const onBack = vi.fn();
  render(<StepsSetupScreen coachName="Rahul" onBack={onBack} />);
  return onBack;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("steps setup", () => {
  it("iOS: shows the Apple Health card and Connect asks for permission, then shows Connected", async () => {
    const { fake, server } = setup({
      source: "apple_health",
      permission: () => "not_requested",
      afterPrompt: "requested",
      totals: { "2026-11-11": 4200 },
    });
    renderScreen();
    await screen.findByText("See your steps on Today");
    expect(screen.getByText(/FitBud reads your step count from Apple Health/).textContent).toContain(
      "aren't shared with Rahul.",
    );
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
    expect(fake.calls.prompts).toBe(1);
    expect(server.requests.map((r) => r.localDate)).toContain("2026-11-11");
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("iOS: no steps after the prompt stays Not connected with a settings hint, never claims Connected", async () => {
    setup({ source: "apple_health", permission: () => "not_requested", afterPrompt: "requested", totals: {} });
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
    await screen.findByText(/turn on Steps for FitBud in Settings/);
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("Android: a missing Health Connect shows the install screen and opens the Play Store listing", async () => {
    setup({ availability: "not_installed" });
    const open = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen();
    await screen.findByText("Install Health Connect");
    fireEvent.click(screen.getByRole("button", { name: "Install Health Connect from Play Store" }));
    expect(open).toHaveBeenCalledWith("market://details?id=com.google.android.apps.healthdata");
  });

  it("Android: an outdated Health Connect asks for an update", async () => {
    setup({ availability: "needs_update" });
    renderScreen();
    await screen.findByText("Update Health Connect");
  });

  it("Android: Open Health Connect requests steps access and then shows steps connected", async () => {
    const { fake } = setup({ permission: () => "not_requested", afterPrompt: "granted", totals: { "2026-11-11": 900 } });
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Open Health Connect" }));
    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
    expect(fake.calls.prompts).toBe(1);
  });

  it("Android: a denial is shown as fixed text, not as an error", async () => {
    setup({ permission: () => "not_requested", afterPrompt: "denied" });
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Open Health Connect" }));
    await screen.findAllByText(/Steps access is off/);
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("back goes to More", async () => {
    setup({ permission: () => "not_requested" });
    const onBack = renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Back to More" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows only fixed text for a failed attempt, with the short code", () => {
    expect(noticeForResult({ kind: "error", code: "STEPS-READ" }, "android")).toBe(
      "Something went wrong (STEPS-READ). Try again.",
    );
    expect(noticeForResult({ kind: "synced", syncedAt: "x", savedDays: 1 }, "ios")).toBeNull();
  });

  it("the dev preview reads only known states", () => {
    expect(devPreview("?stepsSetupPreview=android_install")?.state.kind).toBe("install");
    expect(devPreview("?stepsSetupPreview=nope")).toBeNull();
    expect(devPreview("")).toBeNull();
  });
});
