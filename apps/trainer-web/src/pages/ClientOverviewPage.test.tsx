/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ResponsivenessResponse, WeekReadModel } from "@fitbud/contracts";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "66666666-6666-4666-8666-666666666666";

const api = vi.hoisted(() => ({
  listTrainerNotes: vi.fn(),
  deleteTrainerNote: vi.fn(),
  listMeasurements: vi.fn(),
  getWorkoutAdherence: vi.fn(),
  getMealCompliance: vi.fn(),
  listCheckins: vi.fn(),
}));
const stage1 = vi.hoisted(() => ({
  getWorkspaceWeek: vi.fn(),
  patchTrainerNote: vi.fn(),
  getResponsiveness: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../lib/stage1-api", () => ({ stage1Api: stage1 }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ me: null }) }));
vi.mock("../components/ExceptionDrawer", () => ({ ExceptionDrawer: () => null }));

import { ClientOverviewPage } from "./ClientOverviewPage";

type Lifecycle = "ended" | "active" | "coaching_ready";
type Renewal = "current" | "upcoming" | "due" | "expired" | null;

type WorkspaceOverrides = {
  header?: Record<string, unknown>;
  plan?: Record<string, unknown>;
};

function renderPage(
  onboardingStatus: Lifecycle,
  renewalState: Renewal,
  overrides: WorkspaceOverrides = {},
) {
  const workspace = {
    header: {
      relationshipId: REL_ID,
      traineeDisplayName: "Kavya Menon",
      onboardingStatus,
      renewalState,
      traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
      ...overrides.header,
    },
    overview: {
      openException: null,
      pendingReviewCheckin: null,
      nextCheckin: null,
      recentActivity: [],
      progress: { measurements: [] },
    },
    plan: { plan: null, version: null, ...overrides.plan },
    configuration: { configuration: null },
  };
  const context = {
    workspace,
    openWorkspaceModal: vi.fn(),
    refreshEpoch: 0,
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/overview`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="overview" element={<ClientOverviewPage />} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Rohan-like 14-day reminder history, as `GET …/responsiveness?days=14` returns it. */
const RESPONDS: ResponsivenessResponse = {
  label: "responds",
  counts: { sent: 56, opened: 25, loggedAfter: 19, loggedBefore: 35 },
  categories: {
    workouts: { sent: 6, opened: 2, loggedAfter: 1, loggedOnOwn: 4, notLogged: 1, suppressed: 0 },
    meals: { sent: 48, opened: 21, loggedAfter: 18, loggedOnOwn: 30, notLogged: 0, suppressed: 6 },
    checkins: { sent: 2, opened: 2, loggedAfter: 1, loggedOnOwn: 1, notLogged: 0, suppressed: 0 },
  },
  preferredWorkoutTime: "19:00",
  preferredWorkoutTimeSource: "set",
  pushEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

beforeEach(() => {
  api.listTrainerNotes.mockResolvedValue({ items: [] });
  api.listMeasurements.mockResolvedValue({ items: [], nextCursor: null });
  api.getWorkoutAdherence.mockResolvedValue({ items: [], totals: {} });
  api.getMealCompliance.mockResolvedValue({ items: [], totals: {} });
  api.listCheckins.mockResolvedValue({ items: [], nextCursor: null });
  stage1.getWorkspaceWeek.mockRejectedValue(new Error("no week in unit test"));
  stage1.getResponsiveness.mockResolvedValue(RESPONDS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientOverviewPage renewal link (CE3)", () => {
  it.each(["due", "expired", "upcoming"] as const)(
    "ended client, renewal %s: frame 179's body has no Renewal card or settings link",
    async (renewal) => {
      renderPage("ended", renewal);
      expect(await screen.findByRole("heading", { name: "Your notes" })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Renewal" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
      expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
    },
  );

  it.each([
    ["active", "due"],
    ["active", "expired"],
    ["coaching_ready", "due"],
  ] as const)("%s client, renewal %s: the link still reads Open settings", async (status, renewal) => {
    renderPage(status, renewal);
    const link = await screen.findByRole("link", { name: "Open settings" });
    expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
    fireEvent.click(link);
    expect(await screen.findByText("configure route")).toBeTruthy();
  });

  it("active client, renewal current: no Renewal card", async () => {
    renderPage("active", "current");
    expect(await screen.findByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Renewal" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
  });
});

describe("ClientOverviewPage Reminders card and drawer (03c, 181)", () => {
  it("the card shows the label and the 14-day line from the API", async () => {
    renderPage("active", "current");
    const card = (await screen.findByRole("heading", { name: "Reminders" })).closest("section")!;
    expect(await within(card).findByText("Responds to reminders")).toBeTruthy();
    expect(
      within(card).getByText(
        "Last 14 days · logged 19 of 56 after a reminder · 25 opened · quiet hours 10:00 pm – 7:00 am",
      ),
    ).toBeTruthy();
    expect(within(card).queryByText(/off while coaching is ended/)).toBeNull();
  });

  it("Details opens the drawer over Overview; Close returns focus to Details", async () => {
    renderPage("active", "current");
    const details = await screen.findByRole("button", { name: "Details" });
    details.focus();
    fireEvent.click(details);

    const dialog = await screen.findByRole("dialog", { name: "Reminders · Kavya Menon" });
    expect(screen.getByTestId("screen-TW-31")).toBe(dialog);
    // Overview stays underneath.
    expect(screen.getByTestId("screen-TW-09")).toBeTruthy();
    expect(within(dialog).getByText(/^Last 14 days · \w{3} \d{1,2} \w{3} — \w{3} \d{1,2} \w{3}$/)).toBeTruthy();
    expect(await within(dialog).findByText("Responds to reminders")).toBeTruthy();

    const workouts = within(dialog).getByRole("region", { name: "Workouts" });
    expect(within(workouts).getByText("Not logged")).toBeTruthy();
    expect(within(workouts).queryByText("Suppressed")).toBeNull();
    const meals = within(dialog).getByRole("region", { name: "Meals" });
    expect(within(meals).getByText("6 · quiet hours or already logged")).toBeTruthy();
    expect(within(meals).queryByText("Not logged")).toBeNull();
    const settings = within(dialog).getByRole("region", { name: "Kavya's settings" });
    expect(within(settings).getByText("7:00 pm · set by Kavya")).toBeTruthy();
    expect(within(settings).getByText("10:00 pm – 7:00 am")).toBeTruthy();
    expect(within(settings).getByText("Coming soon")).toBeTruthy();

    const setup = within(dialog).getByRole("link", { name: "Open coaching setup" });
    expect(setup.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
    // Focus moves into the drawer, onto its header Close.
    expect(document.activeElement).toBe(
      within(dialog).getAllByRole("button", { name: "Close" })[0],
    );

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Details" }));
  });

  it("Escape closes the drawer and returns focus to Details", async () => {
    renderPage("active", "current");
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Details" }));
  });

  it("ended client: no Reminders card (frame 179)", async () => {
    renderPage("ended", "current");
    expect(await screen.findByRole("heading", { name: "Your notes" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Reminders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
    expect(stage1.getResponsiveness).not.toHaveBeenCalled();
  });
});

describe("ClientOverviewPage week strip uses WeekCircle (D-W7-10, D-W6-10)", () => {
  function day(date: string, state: WeekReadModel["days"][number]["state"], workoutLabel: string) {
    return { date, state, workoutLabel, mealsAssigned: 4, mealsLogged: 0, mealSlots: [] };
  }

  it("a started past day is partial, today unlogged is To do, a planned past day with no logs is missed", async () => {
    const week: WeekReadModel = {
      start: "2026-11-09",
      workouts: { assigned: 4, completed: 1 },
      meals: { assigned: 28, logged: 9 },
      days: [
        day("2026-11-09", "done", "Upper A"),
        day("2026-11-10", "partial", "Lower A"),
        day("2026-11-11", "missed", "Upper B"),
        day("2026-11-12", "rest", "Rest"),
        day("2026-11-13", "due", "Lower B"),
        day("2026-11-14", "future", "Upper A"),
        day("2026-11-15", "rest", "Rest"),
      ],
      todayNutrition: {
        date: "2026-11-13",
        logged: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        assigned: null,
      },
    };
    stage1.getWorkspaceWeek.mockResolvedValue(week);
    renderPage("active", "current");
    const strip = await screen.findByRole("list", { name: "Week consistency" });
    const states = within(strip)
      .getAllByRole("img")
      .map((el) => [el.getAttribute("data-state"), el.getAttribute("aria-label")]);
    expect(states).toEqual([
      ["done", "Done"],
      ["partial", "Partial"],
      ["missed", "Missed"],
      ["rest", "Rest"],
      ["due", "To do"],
      ["future", "Upcoming"],
      ["rest", "Rest"],
    ]);
    // The started past day is not drawn as rest; today is not drawn as partial.
    const items = within(strip).getAllByRole("listitem");
    expect(items[1]!.querySelector(".week-circle__dash")).toBeNull();
    expect(items[1]!.querySelector(".week-circle__half")).not.toBeNull();
    expect(items[4]!.className).toContain("is-today");
    expect(items[4]!.querySelector(".week-circle__half")).toBeNull();
  });
});

describe("ClientOverviewPage ended client body (frame 179, Z8-20)", () => {
  const ENDED_HEADER = {
    // Mon 6 Jul 10:00 IST and Sat 3 Oct 5:30 pm IST.
    startedAt: "2026-07-06T04:30:00.000Z",
    endedAt: "2026-10-03T12:00:00.000Z",
  };
  const ENDED_PLAN = {
    plan: { id: "77777777-7777-4777-8777-777777777777", title: "Fat loss" },
    version: { versionNumber: 4 },
  };
  const TRAINEE = "88888888-8888-4888-8888-888888888888";

  function weight(id: string, value: number, observedAt: string, checkinId: string | null = null) {
    return {
      id,
      coachingRelationshipId: REL_ID,
      traineeUserId: TRAINEE,
      type: "body_weight_kg",
      value,
      unit: "kg",
      observedAt,
      source: "manual",
      checkinId,
      mediaAssetId: null,
      recordVersion: 1,
      createdAt: observedAt,
      updatedAt: observedAt,
    };
  }
  function workout(localDate: string, status: string, n: number) {
    return {
      assignmentId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      localDate,
      workoutDayName: "Upper A",
      status,
      planVersionId: TRAINEE,
      startedAt: null,
      completedAt: null,
      sessionRpe: null,
    };
  }
  function meal(localDate: string, status: string, n: number) {
    return {
      assignmentId: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      localDate,
      mealName: "Lunch",
      status,
      outcome: null,
      planVersionId: TRAINEE,
      loggedAt: null,
      photoRequired: false,
      hasPhotoIntent: false,
      mediaAssetId: null,
    };
  }
  function checkin(id: string, localDate: string, status: string, bodyWeightKg?: number) {
    return {
      id,
      coachingRelationshipId: REL_ID,
      checkinScheduleId: null,
      localDate,
      windowStartsAt: `${localDate}T00:00:00.000Z`,
      windowEndsAt: `${localDate}T23:59:00.000Z`,
      recordStatus: "active",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: TRAINEE,
      answers: bodyWeightKg != null ? { bodyWeightKg } : null,
      submittedAt: null,
      status,
      review: null,
      createdAt: `${localDate}T00:00:00.000Z`,
      updatedAt: `${localDate}T00:00:00.000Z`,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T06:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Summary, Last week and Your notes from api-client data, and no live week", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [
        // Newest first, as the API returns; one after the end is ignored.
        weight("a0000000-0000-4000-8000-000000000004", 64.0, "2026-10-20T03:00:00.000Z"),
        weight("a0000000-0000-4000-8000-000000000003", 65.1, "2026-10-02T03:00:00.000Z", "c0000000-0000-4000-8000-000000000002"),
        weight("a0000000-0000-4000-8000-000000000002", 66.4, "2026-08-15T03:00:00.000Z"),
        weight("a0000000-0000-4000-8000-000000000001", 68.2, "2026-07-06T05:00:00.000Z"),
      ],
      nextCursor: null,
    });
    api.getWorkoutAdherence.mockResolvedValue({
      items: [
        workout("2026-10-03", "completed", 1),
        workout("2026-10-01", "modified", 2),
        workout("2026-09-29", "missed", 3),
        workout("2026-09-27", "completed", 4),
        workout("2026-09-20", "completed", 5),
        workout("2026-07-07", "skipped", 6),
      ],
      totals: {},
    });
    api.getMealCompliance.mockResolvedValue({
      items: [
        meal("2026-10-03", "confirmed", 1),
        meal("2026-10-02", "logged_later", 2),
        meal("2026-10-01", "overdue", 3),
        meal("2026-09-28", "skipped", 4),
      ],
      totals: {},
    });
    api.listCheckins.mockResolvedValue({
      items: [
        checkin("c0000000-0000-4000-8000-000000000003", "2026-10-09", "scheduled"),
        checkin("c0000000-0000-4000-8000-000000000002", "2026-10-02", "reviewed"),
        checkin("c0000000-0000-4000-8000-000000000001", "2026-09-25", "overdue"),
        checkin("c0000000-0000-4000-8000-000000000000", "2026-07-10", "submitted", 68.0),
      ],
      nextCursor: null,
    });
    api.listTrainerNotes.mockResolvedValue({
      items: [
        {
          id: "d0000000-0000-4000-8000-000000000002",
          coachingRelationshipId: REL_ID,
          trainerUserId: TRAINEE,
          checkinId: null,
          body: "Hit her goal before Diwali.",
          visibility: "private",
          sharedAt: null,
          seenAt: null,
          createdAt: "2026-10-03T13:10:00.000Z",
          updatedAt: "2026-10-03T13:10:00.000Z",
        },
        {
          id: "d0000000-0000-4000-8000-000000000001",
          coachingRelationshipId: REL_ID,
          trainerUserId: TRAINEE,
          checkinId: null,
          body: "Older note",
          visibility: "private",
          sharedAt: null,
          seenAt: null,
          createdAt: "2026-09-01T13:10:00.000Z",
          updatedAt: "2026-09-01T13:10:00.000Z",
        },
      ],
    });

    renderPage("ended", "due", { header: ENDED_HEADER, plan: ENDED_PLAN });

    const summary = (
      await screen.findByRole("heading", { name: "Summary · Mon 6 Jul — Sat 3 Oct" })
    ).closest("section")!;
    const summaryList = await waitFor(() => {
      const el = summary.querySelector<HTMLElement>('dl[aria-label="Summary"]');
      expect(el).not.toBeNull();
      return el!;
    });
    const rows = (list: HTMLElement) =>
      Array.from(list.querySelectorAll("div")).map((row) => [
        row.querySelector("dt")!.textContent,
        row.querySelector("dd")!.textContent,
      ]);
    expect(rows(summaryList)).toEqual([
      ["Weight", "68.2 kg → 65.1 kg · −3.1 kg"],
      ["Workouts", "4 of 6"],
      ["Check-ins", "2 of 3"],
      ["Last plan", "Fat loss · v4"],
    ]);

    const week = screen
      .getByRole("heading", { name: "Last week · Sun 27 Sep — Sat 3 Oct" })
      .closest("section")!;
    expect(within(week).getByText("Read-only")).toBeTruthy();
    expect(rows(week.querySelector<HTMLElement>('dl[aria-label="Last week"]')!)).toEqual([
      ["Workouts", "3 of 4"],
      ["Meals logged", "3 of 4"],
      ["Last check-in", "Fri 2 Oct · 65.1 kg"],
    ]);

    const notes = screen.getByRole("heading", { name: "Your notes" }).closest("section")!;
    expect(await within(notes).findByText("Hit her goal before Diwali.")).toBeTruthy();
    expect(within(notes).getByText("Sat 3 Oct, 6:40 pm")).toBeTruthy();
    expect(within(notes).queryByText("Older note")).toBeNull();

    // The coached range drives every query; the live week is never fetched.
    expect(api.getWorkoutAdherence).toHaveBeenCalledWith(REL_ID, {
      fromDate: "2026-07-06",
      toDate: "2026-10-03",
    });
    expect(api.getMealCompliance).toHaveBeenCalledWith(REL_ID, {
      fromDate: "2026-09-27",
      toDate: "2026-10-03",
    });
    expect(api.listCheckins).toHaveBeenCalledWith(
      REL_ID,
      expect.objectContaining({ fromDate: "2026-07-06", toDate: "2026-10-03" }),
    );
    expect(stage1.getWorkspaceWeek).not.toHaveBeenCalled();

    // No live week, nutrition, activity, reminders, plan or write actions.
    expect(screen.queryByRole("list", { name: "Week consistency" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "This week" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recent activity" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Reminders" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Coach notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|\d{4}-\d{2}-\d{2}/);
  });

  it("Last check-in takes the weigh-in logged that day when the check-in has none", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [
        // 25 Oct 8:00 am IST; not linked to the check-in.
        weight("a0000000-0000-4000-8000-000000000009", 64.7, "2026-09-25T02:30:00.000Z"),
        weight("a0000000-0000-4000-8000-000000000008", 66.0, "2026-09-18T02:30:00.000Z"),
      ],
      nextCursor: null,
    });
    api.listCheckins.mockResolvedValue({
      items: [
        checkin("c0000000-0000-4000-8000-000000000009", "2026-09-25", "reviewed"),
        checkin("c0000000-0000-4000-8000-000000000008", "2026-09-20", "reviewed"),
      ],
      nextCursor: null,
    });
    renderPage("ended", null, { header: ENDED_HEADER });
    expect(await screen.findByText("Fri 25 Sep · 64.7 kg")).toBeTruthy();
  });

  it("leaves out rows with no source and never invents counts", async () => {
    renderPage("ended", null, { header: ENDED_HEADER });
    const summary = (
      await screen.findByRole("heading", { name: "Summary · Mon 6 Jul — Sat 3 Oct" })
    ).closest("section")!;
    expect(
      await within(summary).findByText("Nothing was logged while coaching ran."),
    ).toBeTruthy();
    expect(within(summary).queryByText("Weight")).toBeNull();
    expect(within(summary).queryByText("Last plan")).toBeNull();
    expect(screen.getByText("Nothing was logged in the last week.")).toBeTruthy();
    expect(screen.getByText("No notes yet")).toBeTruthy();
  });

  it("a failed load shows the API's own message with Retry, not empty rows", async () => {
    const { ApiClientError } = await import("@fitbud/api-client");
    api.getWorkoutAdherence.mockRejectedValueOnce(
      new ApiClientError({
        code: "INTERNAL",
        message: "Something went wrong.",
        requestId: "unknown",
        status: 500,
      }),
    );
    renderPage("ended", null, { header: ENDED_HEADER, plan: ENDED_PLAN });
    expect(await screen.findByText(/Something went wrong\./)).toBeTruthy();
    expect(screen.queryByText("Nothing was logged in the last week.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(document.querySelector('dl[aria-label="Summary"]')).not.toBeNull(),
    );
    expect(screen.getByText("Last plan")).toBeTruthy();
    expect(api.getWorkoutAdherence).toHaveBeenCalledTimes(2);
  });

  it("active client keeps the live Overview (This week, activity, Reminders)", async () => {
    renderPage("active", "current", { header: ENDED_HEADER });
    expect(await screen.findByRole("heading", { name: "This week" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reminders" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Summary/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Your notes" })).toBeNull();
    expect(stage1.getWorkspaceWeek).toHaveBeenCalled();
    expect(api.getWorkoutAdherence).not.toHaveBeenCalled();
  });
});
