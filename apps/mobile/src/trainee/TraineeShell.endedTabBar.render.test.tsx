/**
 * Z12-49fu: ended coaching (TR-22a) keeps the trainee tab bar — the shell
 * must not replace itself with a fullscreen EndedCoaching overlay.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  type CoachingRelationship,
} from "@fitbud/contracts";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const endedRelationship: CoachingRelationship = coachingRelationshipSchema.parse({
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "ended",
  onboardingStatus: "ended",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: "2026-10-31T06:00:00.000Z",
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-10-31T06:00:00.000Z",
  trainerDisplayName: "Rahul Verma",
  pendingReactivation: null,
});

const neverSettles = new Promise<never>(() => undefined);

const shellApi = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "getEffectivePlan") return () => neverSettles;
      if (key === "getRelationship")
        return async () => ({ ...endedRelationship, pendingReactivation: null });
      if (key === "getProgressSummary")
        return async () => ({ measurements: [], entries: [], media: [] });
      if (key === "getMeWeek" || key === "getMeDay") return async () => null;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "then") return undefined;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  const { mockAuth } = await import("../test/render");
  const auth = mockAuth({
    api: shellApi,
    me: {
      id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
      email: "kavya.ended@demo.fitbud.test",
      timezone: "Asia/Kolkata",
      permittedRoles: ["trainee"],
    },
  });
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
      enqueue: async () => undefined,
    }),
  };
});

vi.mock("../sync/useSyncStatus", () => ({
  useSyncView: () => ({
    rows: [],
    status: {
      waiting: 0,
      sending: 0,
      failed: 0,
      waitingReason: null,
      lastSentAt: null,
    },
  }),
  useApiReachable: () => true,
}));

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({
      config: null,
      loading: false,
      refresh: async () => undefined,
    }),
  };
});

vi.mock("../realtime/useRealtimeHints", () => ({
  useRealtimeHints: () => undefined,
}));

vi.mock("./notifications/ForegroundBanner", () => ({
  ForegroundBanner: () =>
    React.createElement("Text", { testID: "foreground-banner" }),
}));

describe("TraineeShell when coaching has ended (TR-22a)", () => {
  it("keeps the tab bar and embeds the ended landing on Today", async () => {
    const { render, screen, waitFor } = await import("../test/render");
    const { TraineeShell } = await import("./TraineeShell");
    render(<TraineeShell relationship={endedRelationship} />);
    await waitFor(() => {
      expect(screen.getByTestId("ended-coaching")).toBeTruthy();
    });
    expect(screen.getByTestId("ended-coaching-embedded")).toBeTruthy();
    expect(screen.getByTestId("tab-today")).toBeTruthy();
    expect(screen.getByTestId("tab-workout")).toBeTruthy();
    expect(screen.getByTestId("tab-diet")).toBeTruthy();
    expect(screen.getByTestId("tab-progress")).toBeTruthy();
    expect(screen.getByTestId("tab-more")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(
      screen.getByText(/Coaching with Rahul ended/),
    ).toBeTruthy();
    // Meal / coach-note banners stay off — ended coaching is read-only (TR-22).
    expect(screen.queryByTestId("foreground-banner")).toBeNull();
  });
});
