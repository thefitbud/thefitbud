/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ResponsivenessResponse, WeekReadModel } from "@fitbud/contracts";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

const REL_ID = "66666666-6666-4666-8666-666666666666";

const api = vi.hoisted(() => ({
  listTrainerNotes: vi.fn(),
  deleteTrainerNote: vi.fn(),
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

function renderPage(onboardingStatus: Lifecycle, renewalState: Renewal) {
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
    },
    overview: {
      openException: null,
      pendingReviewCheckin: null,
      nextCheckin: null,
      recentActivity: [],
      progress: { measurements: [] },
    },
    plan: { plan: null, version: null },
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
  stage1.getWorkspaceWeek.mockRejectedValue(new Error("no week in unit test"));
  stage1.getResponsiveness.mockResolvedValue(RESPONDS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClientOverviewPage renewal link (CE3)", () => {
  it.each(["due", "expired", "upcoming"] as const)(
    "ended client, renewal %s: the link reads View coaching setup and only navigates",
    async (renewal) => {
      renderPage("ended", renewal);
      const link = await screen.findByRole("link", { name: "View coaching setup" });
      expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
      expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
      fireEvent.click(link);
      expect(await screen.findByText("configure route")).toBeTruthy();
      expect(api.deleteTrainerNote).not.toHaveBeenCalled();
      expect(stage1.patchTrainerNote).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
  });

  it.each([
    ["ended", "current"],
    ["ended", null],
    ["active", "current"],
  ] as const)("%s client, renewal %s: no Renewal card", async (status, renewal) => {
    renderPage(status, renewal);
    expect(await screen.findByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Renewal" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open settings" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View coaching setup" })).toBeNull();
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

  it("ended client: the compact card says reminders are off", async () => {
    renderPage("ended", "current");
    const card = (await screen.findByRole("heading", { name: "Reminders" })).closest("section")!;
    expect(
      await within(card).findByText("Reminders are off while coaching is ended."),
    ).toBeTruthy();
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

  it("ended client: the drawer offers only a view of coaching setup", async () => {
    renderPage("ended", "current");
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "View coaching setup" })).toBeTruthy();
    expect(within(dialog).queryByRole("link", { name: "Open coaching setup" })).toBeNull();
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
