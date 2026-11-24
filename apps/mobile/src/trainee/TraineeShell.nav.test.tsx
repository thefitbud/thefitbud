/**
 * Z14-25 (D-W14-24): Android back in the trainee shell, one test per row of
 * the back-target table in docs/specs/Z14-25.md that the render harness can
 * reach. Sheets (Modals) close themselves through `onRequestClose` and the
 * live workout keeps its own handler; neither is the shell's, so they are
 * covered by their own tests and the F31 device flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coachingRelationshipSchema, type CoachingRelationship } from "@fitbud/contracts";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const shellRelationship: CoachingRelationship = coachingRelationshipSchema.parse({
  id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return () => new Promise<never>(() => undefined);
      if (key === "getProgressSummary") {
        return async () => ({ measurements: [], entries: [], media: [] });
      }
      if (key === "getMeDay" || key === "getMeWeek") return async () => null;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  const { mockAuth } = await import("../test/render");
  const auth = mockAuth({
    api: shellApi,
    me: {
      id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
      email: "aarav.ontrack@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainee"],
    },
  });
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  const engine = {
    pullAndApply: async () => undefined,
    store: {
      upsertLocal: async () => undefined,
      listLocal: async () => [],
      listOutbox: async () => [],
      getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
    },
    enqueue: async () => undefined,
    subscribe: () => () => undefined,
  };
  return { ...actual, useSyncEngine: () => engine };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({ useRealtimeHints: () => undefined }));

const { BackHandler, Platform } = await import("react-native");
const { clearDayViews } = await import("./dataCache");
const { act, fireEvent, render, screen, waitFor } = await import("../test/render");
const { TraineeShell } = await import("./TraineeShell");

/** A fake Android Back: the listeners the app registered, newest asked first. */
const listeners: Array<() => boolean | null | undefined> = [];
const realOS = Platform.OS;

function pressBack(): boolean {
  let consumed = false;
  act(() => {
    consumed = [...listeners].reverse().some((listener) => listener() === true);
  });
  return consumed;
}

const paneShown = (id: string) =>
  screen.getByTestId(`trainee-pane-${id}`).getAttribute("aria-hidden") !== "true";

async function openShell() {
  render(<TraineeShell relationship={shellRelationship} />);
  await waitFor(() => expect(screen.getByTestId("tab-progress")).toBeTruthy());
}

beforeEach(() => {
  listeners.length = 0;
  clearDayViews();
  vi.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    listener: () => boolean | null | undefined,
  ) => {
    listeners.push(listener);
    return {
      remove: () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      },
    };
  }) as typeof BackHandler.addEventListener);
  (Platform as { OS: string }).OS = "android";
  // The harness's gesture-handler stub warns about refs on "android"; only
  // that warning is allowed.
  const real = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Function components cannot be given refs")) return;
    real(...args);
  });
});

afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});

describe("TraineeShell Android back (Z14-25)", () => {
  it("Today with nothing open: back is not consumed, so Android leaves the app", async () => {
    await openShell();
    expect(paneShown("today")).toBe(true);
    expect(pressBack()).toBe(false);
  });

  it("Diet tab: back shows Today; then back leaves", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(paneShown("diet")).toBe(true));
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("a tab left by the tab bar stays mounted hidden and never answers back", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-diet"));
    await waitFor(() => expect(paneShown("diet")).toBe(true));
    fireEvent.click(screen.getByTestId("tab-progress"));
    await waitFor(() => expect(paneShown("progress")).toBe(true));
    // Diet is kept (hidden); only the shell's one dispatcher is registered.
    expect(screen.getByTestId("trainee-pane-diet").getAttribute("aria-hidden")).toBe("true");
    expect(listeners).toHaveLength(1);
    // Back goes to Today, not into the hidden Diet pane.
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
  });

  it("More -> Account -> Password: back returns to Account, then More, then Today", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-more"));
    await waitFor(() => expect(paneShown("more")).toBe(true));
    fireEvent.click(await screen.findByText("Account"));
    await screen.findByTestId("trainee-overlay-account");
    fireEvent.click(await screen.findByText("Password"));
    await screen.findByTestId("trainee-overlay-password");
    // Account stays mounted underneath, so the swipe shows the real screen.
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-password")).toBeNull());
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-account")).toBeNull());
    // An overlay opened from a tab goes back to that tab as it was left.
    expect(paneShown("more")).toBe(true);

    expect(pressBack()).toBe(true);
    await waitFor(() => expect(paneShown("today")).toBe(true));
    expect(pressBack()).toBe(false);
  });

  it("the on-screen back (Cancel on an edit page) does what hardware back does", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-more"));
    fireEvent.click(await screen.findByText("Account"));
    await screen.findByTestId("trainee-overlay-account");
    fireEvent.click(await screen.findByText("Password"));
    await screen.findByTestId("trainee-overlay-password");
    // Password is an edit page (TR-20b): its on-screen back is Cancel, which
    // calls the same pop as hardware back.
    const top = screen.getByTestId("trainee-overlay-password");
    const cancel = Array.from(top.querySelectorAll("[role=button]")).find(
      (node) => node.textContent?.trim() === "Cancel",
    );
    expect(cancel).toBeTruthy();
    fireEvent.click(cancel as Element);
    await waitFor(() => expect(screen.queryByTestId("trainee-overlay-password")).toBeNull());
    expect(screen.getByTestId("trainee-overlay-account")).toBeTruthy();
  });
});
