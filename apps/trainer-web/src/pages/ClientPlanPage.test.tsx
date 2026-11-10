/**
 * @vitest-environment happy-dom
 *
 * Z8-8: the Plan tab shows one current program card (frame 150) with its
 * workout part, nutrition part and a versions row, and the no-plan state of
 * frame 151.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { NUTRIENT_SCALE, type PlanContent } from "@fitbud/contracts";

const REL = "11111111-1111-4111-8111-111111111111";
const PLAN = "22222222-2222-4222-8222-222222222222";
const V2 = "33333333-3333-4333-8333-333333333332";
const V1 = "33333333-3333-4333-8333-333333333331";
const NEXT_PLAN = "44444444-4444-4444-8444-444444444444";
const NEXT_V1 = "55555555-5555-4555-8555-555555555551";

const api = vi.hoisted(() => ({
  listPlans: vi.fn(),
  listPlanTemplates: vi.fn(),
  getPlanVersion: vi.fn(),
  getPlanConsistency: vi.fn(),
  createPlanDraftFromVersion: vi.fn(),
  createPlan: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ me: null }) }));

import { ClientPlanPage } from "./ClientPlanPage";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function food(kcal: number) {
  const scaled = kcal * NUTRIENT_SCALE;
  return {
    snapshotKind: "legacy" as const,
    name: "Dal and rice",
    classification: null,
    basis: null,
    canonical: null,
    serving: { label: "1 bowl", unit: "bowl", conversionScaled: null },
    quantityScaled: NUTRIENT_SCALE,
    calculated: {
      energyKcalScaled: scaled,
      proteinScaled: 10 * NUTRIENT_SCALE,
      carbsScaled: 30 * NUTRIENT_SCALE,
      fatScaled: 5 * NUTRIENT_SCALE,
      partial: false,
    },
  };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

/** Fat loss phase 2: 4 sessions, 4 meals a day, 1,950 kcal Mon–Fri and 1,800 at the weekend. */
function content(): PlanContent {
  const day = (n: number, name: string, weekday: number) => ({
    id: uuid(100 + n),
    order: n,
    name,
    weekday,
    required: true,
    instructions: null,
    exercises: [],
  });
  const meal = (n: number, name: string, weekdays: number[], kcal: number) => ({
    id: uuid(200 + n),
    order: n,
    name,
    mealType: null,
    applicableWeekdays: weekdays,
    localTime: null,
    required: true,
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    items: [food(kcal)],
  });
  return {
    workoutDays: [
      day(1, "Upper A", 1),
      day(2, "Lower A", 2),
      day(3, "Upper B", 4),
      day(4, "Lower B", 5),
    ],
    mealPrescriptions: [
      meal(1, "Breakfast", ALL_DAYS, 450),
      meal(2, "Lunch", ALL_DAYS, 600),
      meal(3, "Snack", ALL_DAYS, 300),
      meal(4, "Dinner", WEEKDAYS, 600),
      meal(5, "Light dinner", [0, 6], 450),
    ],
  } as unknown as PlanContent;
}

function version(over: Record<string, unknown>) {
  return {
    planId: PLAN,
    recordVersion: 0,
    creationSource: "template",
    sourceTemplateId: null,
    createdAt: "2026-09-19T06:00:00.000Z",
    updatedAt: "2026-09-19T06:00:00.000Z",
    ...over,
  };
}

const effective = version({
  id: V2,
  versionNumber: 2,
  status: "effective",
  publishedAt: "2026-09-19T06:00:00.000Z",
  effectiveFrom: "2026-09-20T18:30:00.000Z",
  effectiveTo: "2026-11-15T18:30:00.000Z",
});

function listPlansFor(query: { versionStatus?: string }) {
  if (query.versionStatus === "draft") return { nextCursor: null, items: [] };
  const scheduled = {
    plan: { id: NEXT_PLAN, coachingRelationshipId: REL, title: "Fat loss · phase 3" },
    versions: [
      version({
        id: NEXT_V1,
        planId: NEXT_PLAN,
        versionNumber: 1,
        status: "scheduled",
        publishedAt: "2026-10-17T06:00:00.000Z",
        effectiveFrom: "2026-11-15T18:30:00.000Z",
        effectiveTo: null,
      }),
    ],
  };
  if (query.versionStatus === "scheduled") return { nextCursor: null, items: [scheduled] };
  return {
    nextCursor: null,
    items: [
      scheduled,
      {
        plan: { id: PLAN, coachingRelationshipId: REL, title: "Fat loss · phase 2" },
        versions: [
          effective,
          version({
            id: V1,
            versionNumber: 1,
            status: "superseded",
            publishedAt: "2026-09-01T06:00:00.000Z",
            effectiveFrom: "2026-09-01T18:30:00.000Z",
            effectiveTo: "2026-09-20T18:30:00.000Z",
          }),
        ],
      },
    ],
  };
}

function renderPage(opts: { plan: boolean; ended?: boolean; gender?: string }) {
  const workspace = {
    header: {
      relationshipId: REL,
      traineeDisplayName: "Rohan Mehta",
      onboardingStatus: opts.ended ? "ended" : "active",
      traineeTimezone: "Asia/Kolkata",
      traineeProfile: { displayName: "Rohan Mehta", age: 29, gender: opts.gender ?? "male" },
      mealTimeOverrides: [],
    },
    plan: opts.plan
      ? {
          plan: { id: PLAN, coachingRelationshipId: REL, title: "Fat loss · phase 2" },
          version: { ...effective, content: content() },
        }
      : { plan: null, version: null },
    configuration: { configuration: null, subscription: null },
  };
  const context = {
    workspace,
    workspaceLoading: false,
    workspaceError: null,
    refreshEpoch: 0,
    reloadWorkspace: () => {},
    online: true,
    ended: opts.ended ?? false,
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL}/plan`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="plan" element={<ClientPlanPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Wed 21 Oct 2026, 10:00 IST: week 5 of the 21 Sep → 16 Nov block.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T04:30:00.000Z"));
  api.listPlans.mockImplementation(async (_rel: string, query: { versionStatus?: string }) =>
    listPlansFor(query),
  );
  api.getPlanConsistency.mockResolvedValue({ acknowledged: false, fingerprint: "" });
  api.listPlanTemplates.mockResolvedValue({ nextCursor: null, items: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ClientPlanPage current program card (frame 150)", () => {
  it("shows one card with header, workout part and nutrition part", async () => {
    renderPage({ plan: true });
    const card = screen.getByRole("region", { name: "Fat loss · phase 2" });
    expect(within(card).getByText("Rohan's current program")).toBeTruthy();
    // Plan status `effective` reads "Active" through labelFor.
    expect(within(card).getByText("Active")).toBeTruthy();
    expect(within(card).getByTestId("plan-effective-line").textContent).toBe(
      "Effective since Mon 21 Sep · v2 · ends Mon 16 Nov",
    );
    expect(card.textContent).toContain("Week 5 of 8 · ");
    expect(card.textContent).toContain("what Rohan sees in his app today");

    const workout = within(card).getByRole("heading", { level: 3, name: "4 sessions a week" });
    expect(workout).toBeTruthy();
    expect(
      within(card).getByRole("heading", { level: 3, name: "1,800–1,950 kcal · 4 meals a day" }),
    ).toBeTruthy();
    expect(within(card).getAllByText("Fat loss · phase 2 · v2 · since Mon 21 Sep")).toHaveLength(2);

    const builders = within(card).getAllByRole("link", { name: /Open builder/ });
    expect(builders.map((link) => link.getAttribute("href"))).toEqual([
      `/clients/${REL}/plan/${PLAN}/versions/${V2}/edit?tab=workout`,
      `/clients/${REL}/plan/${PLAN}/versions/${V2}/edit?tab=nutrition`,
    ]);
  });

  it("lists the week Monday first with each day's session and meals, marking today", async () => {
    renderPage({ plan: true });
    const days = within(screen.getByTestId("week-strip")).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    const text = days.map((day) => day.textContent);
    expect(text[0]).toBe("MonUpper AMon4 meals1,950 kcal");
    expect(text[2]).toBe("Wed (today)RestWed4 meals1,950 kcal");
    expect(text[6]).toBe("SunRestSun4 meals1,800 kcal");
    expect(days[2]!.getAttribute("aria-current")).toBe("date");
    expect(days.filter((day) => day.getAttribute("aria-current"))).toHaveLength(1);
  });

  it("shows the next scheduled version as a chip with a civil date", async () => {
    renderPage({ plan: true });
    expect((await screen.findByTestId("plan-next-version")).textContent).toBe(
      "Next: Fat loss · phase 3 from Mon 16 Nov",
    );
  });

  it("keeps Adjust plan and Replace from template beside the Plans / Coaching setup switch", () => {
    renderPage({ plan: true });
    const nav = screen.getByRole("navigation", { name: "Plan sections" });
    expect(within(nav).getByRole("link", { name: "Plans" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Coaching setup" }).getAttribute("href")).toBe(
      `/clients/${REL}/configure`,
    );
    expect(screen.getByRole("button", { name: "Adjust plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace from template" })).toBeTruthy();
  });

  it("opens the versions row with plan, version, status and civil effective dates", async () => {
    const view = renderPage({ plan: true });
    expect(view.container.querySelector(".versions-table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Versions/ }));
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Fat loss · phase 3v1ScheduledFrom Mon 16 NovYou · Sat 17 OctView Fat loss · phase 3 v1",
      "Fat loss · phase 2v2ActiveMon 21 Sep — Mon 16 NovYou · Sat 19 SepView Fat loss · phase 2 v2",
      "Fat loss · phase 2v1SupersededWed 2 Sep — Mon 21 SepYou · Tue 1 SepView Fat loss · phase 2 v1",
    ]);
    expect(screen.getByTestId("versions-count").textContent).toBe("3 of 3");
    expect(table.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|effective|superseded|%/);
  });

  it("filters versions by status through the API", async () => {
    renderPage({ plan: true });
    fireEvent.click(screen.getByRole("button", { name: /Versions/ }));
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "scheduled" },
    });
    await waitFor(() =>
      expect(api.listPlans).toHaveBeenLastCalledWith(REL, {
        cursor: undefined,
        limit: 20,
        versionStatus: "scheduled",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("versions-count").textContent).toBe("1 of 1"));
  });

  it("is read-only for an ended client: no adjust actions, no app-today copy", () => {
    renderPage({ plan: true, ended: true });
    expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace from template" })).toBeNull();
    expect(screen.getByText("Coaching has ended. This plan is read-only.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("sees in his app today");
  });
});

describe("ClientPlanPage empty state (frame 151)", () => {
  it("explains what the client sees and offers template or scratch", () => {
    renderPage({ plan: false });
    expect(screen.getByRole("heading", { name: "No plan yet" })).toBeTruthy();
    expect(
      screen.getByText(
        "Start from a template or build from scratch. Rohan sees nothing in the app until you publish. Finish Coaching setup first so his expectations are set.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start from a template" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build from scratch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Versions/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adjust plan" })).toBeNull();
  });

  it("uses a neutral pronoun when gender is not known", () => {
    renderPage({ plan: false, gender: "" });
    expect(document.body.textContent).toContain("so their expectations are set.");
  });

  it("shows no actions for an ended client", () => {
    renderPage({ plan: false, ended: true });
    expect(screen.getByText("Coaching has ended, and there was no plan.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start from a template" })).toBeNull();
  });
});
