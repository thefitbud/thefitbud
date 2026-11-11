/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { GLOBAL_CHECKIN_FORM_V2_FIELDS } from "@fitbud/core";
import {
  checkinFormVersionSchema,
  checkinSchema,
  progressEntrySchema,
  progressMetricsQuerySchema,
  progressMetricsResponseSchema,
  strengthQuerySchema,
  strengthReadModelSchema,
  type ProgressMetricKey,
  type ProgressMetricPoint,
  type ProgressMetricsQuery,
  type StrengthQuery,
  type StrengthReadModel,
} from "@fitbud/contracts";

const REL_ID = "77777777-7777-4777-8777-777777777777";
const CHECKIN_1 = "11111111-1111-4111-8111-111111111111";
const CHECKIN_2 = "22222222-2222-4222-8222-222222222222";
const CHECKIN_3 = "33333333-3333-4333-8333-333333333333";

const api = vi.hoisted(() => ({
  getProgressMetrics: vi.fn(),
  listProgressEntries: vi.fn(),
  getStrength: vi.fn(),
  getDownloadTarget: vi.fn(),
  getCheckinForm: vi.fn(),
}));

vi.mock("../lib/api", () => ({ apiClient: api }));

import { ClientProgressPage } from "./ClientProgressPage";

type Lifecycle = "ended" | "active" | "coaching_ready" | "onboarding_submitted";
type Fixture = Partial<Record<ProgressMetricKey, ProgressMetricPoint[]>>;

const UNIT: Record<ProgressMetricKey, "kg" | "cm" | null> = {
  weight: "kg",
  waist: "cm",
  hips: "cm",
  chest: "cm",
  arm: "cm",
  thigh: "cm",
  energy: null,
  sleep_quality: null,
  stress: null,
  hunger: null,
};

function point(
  localDate: string,
  value: number,
  checkinId: string | null = null,
) {
  return { localDate, value, checkinId };
}

/** Rohan-like data: weekly check-ins with weight, waist, hip and three ratings. */
const ROHAN: Fixture = {
  weight: [
    point("2026-08-24", 89.1, CHECKIN_1),
    point("2026-09-04", 88.4, CHECKIN_2),
    point("2026-10-16", 86.4, CHECKIN_3),
  ],
  waist: [point("2026-08-24", 98, CHECKIN_1), point("2026-10-09", 94)],
  hips: [point("2026-08-24", 104, CHECKIN_1), point("2026-10-09", 102)],
  energy: [
    point("2026-09-04", 4, CHECKIN_2),
    point("2026-10-16", 3, CHECKIN_3),
  ],
  sleep_quality: [
    point("2026-09-04", 3, CHECKIN_2),
    point("2026-10-16", 2, CHECKIN_3),
  ],
  stress: [point("2026-10-16", 3, CHECKIN_3)],
};

/** The API through its own contract: at most two keys, ranges validated by the query schema. */
function serveMetrics(fixture: Fixture, recentOnly: Fixture = fixture) {
  api.getProgressMetrics.mockImplementation(
    async (relationshipId: string, query: ProgressMetricsQuery) => {
      const parsed = progressMetricsQuerySchema.parse(query);
      const source = parsed.range === "all" ? fixture : recentOnly;
      return progressMetricsResponseSchema.parse({
        relationshipId,
        range: parsed.range,
        from: parsed.range === "all" ? null : (parsed.from ?? "2026-07-27"),
        to: parsed.to ?? "2026-10-18",
        timezone: "Asia/Kolkata",
        series: parsed.keys.map((key) => ({
          key,
          unit: UNIT[key],
          points: source[key] ?? [],
        })),
      });
    },
  );
}

const NO_STRENGTH: StrengthReadModel = {
  exercises: [],
  workoutsPerWeek: [],
  notCharted: { sets: 0, items: [] },
};

/**
 * Rohan-like strength history as the strength API returns it (Z6-5, Z8-13): a back
 * squat charted by kg, pull-ups charted by reps (D-W8-7) and two text-load sets.
 */
const ROHAN_STRENGTH: StrengthReadModel = {
  exercises: [
    {
      exerciseId: "ex-squat",
      name: "Back squat",
      chartBy: "load_kg",
      sessions: 3,
      plannedSessions: 4,
      points: [
        { localDate: "2026-09-02", topLoadKg: 60, reps: 8, totalReps: 24, volumeKg: 1440 },
        { localDate: "2026-09-09", topLoadKg: 62.5, reps: 8, totalReps: 24, volumeKg: 1500 },
        { localDate: "2026-10-14", topLoadKg: 67.5, reps: 6, totalReps: 18, volumeKg: 1215 },
      ],
    },
    {
      exerciseId: "ex-pull",
      name: "Pull-up",
      chartBy: "reps",
      sessions: 2,
      plannedSessions: 2,
      points: [
        { localDate: "2026-10-07", topLoadKg: null, reps: 8, totalReps: 14, volumeKg: null },
        { localDate: "2026-10-14", topLoadKg: null, reps: 12, totalReps: 22, volumeKg: null },
      ],
    },
  ],
  workoutsPerWeek: [
    { weekStart: "2026-08-31", count: 1, planned: 2 },
    { weekStart: "2026-09-07", count: 1, planned: 2 },
    { weekStart: "2026-09-14", count: 0, planned: 2 },
    { weekStart: "2026-10-05", count: 1, planned: 2 },
    { weekStart: "2026-10-12", count: 1, planned: 3 },
  ],
  notCharted: {
    sets: 2,
    items: [
      { localDate: "2026-10-14", exerciseName: "Band row", loadLabel: "red band", reps: 12 },
      { localDate: "2026-10-07", exerciseName: "Back squat", loadLabel: "RPE 8", reps: 5 },
    ],
  },
};

/** The strength API through its own contract; `all` gets the full model. */
function serveStrength(all: StrengthReadModel, recent: StrengthReadModel = all) {
  api.getStrength.mockImplementation(
    async (_relationshipId: string, query: Partial<StrengthQuery>) => {
      const parsed = strengthQuerySchema.parse(query);
      return strengthReadModelSchema.parse(
        parsed.range === "all" && !parsed.from ? all : recent,
      );
    },
  );
}

function strengthCalls(): Partial<StrengthQuery>[] {
  return api.getStrength.mock.calls.map(
    (call) => call[1] as Partial<StrengthQuery>,
  );
}

type Extras = {
  /** Header fields on top of the Rohan-like default (startedAt, endedAt, effectivePlan, …). */
  header?: Record<string, unknown>;
  /** Workspace overview (next check-in). */
  overview?: Record<string, unknown>;
};

function renderPage(onboardingStatus: Lifecycle = "active", extras: Extras = {}) {
  const context = {
    workspace: {
      overview: extras.overview,
      header: {
        relationshipId: REL_ID,
        traineeDisplayName: "Rohan Mehta",
        onboardingStatus,
        renewalState: null,
        traineeProfile: {
          displayName: "Rohan Mehta",
          age: null,
          gender: "male",
        },
        traineeTimezone: "Asia/Kolkata",
        hasCustomMealTimes: false,
        trainerWhatsappE164: null,
        clientWhatsappE164: null,
        ...extras.header,
      },
    },
    refreshEpoch: 0,
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/progress`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="progress" element={<ClientProgressPage />} />
          <Route path="configure" element={<p>configure route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function calls(): ProgressMetricsQuery[] {
  return api.getProgressMetrics.mock.calls.map(
    (call) => call[1] as ProgressMetricsQuery,
  );
}

function expectNoBannedText(container: HTMLElement) {
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(text).not.toMatch(/%/);
  expect(text).not.toMatch(/streak/i);
  expect(text).not.toMatch(/sleep_quality|body_weight_kg/);
}

beforeEach(() => {
  // Dates in the copy omit the year only in the current year: pin "now" to the fixture year.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T04:00:00.000Z"));
  serveMetrics({});
  serveStrength(NO_STRENGTH);
  api.listProgressEntries.mockResolvedValue({ items: [] });
  api.getDownloadTarget.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ClientProgressPage no-weigh-ins link (CE3)", () => {
  it("ended client: the link reads View coaching setup and only navigates", async () => {
    renderPage("ended");
    expect(
      await screen.findByRole("heading", { name: "No progress data yet" }),
    ).toBeTruthy();
    const link = await screen.findByRole("link", {
      name: "View coaching setup",
    });
    expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
    expect(
      screen.queryByRole("link", { name: "Open check-in settings" }),
    ).toBeNull();
    fireEvent.click(link);
    expect(await screen.findByText("configure route")).toBeTruthy();
  });

  it.each(["active", "coaching_ready", "onboarding_submitted"] as const)(
    "%s client: the link still reads Open check-in settings",
    async (status) => {
      renderPage(status);
      const link = await screen.findByRole("link", {
        name: "Open check-in settings",
      });
      expect(link.getAttribute("href")).toBe(`/clients/${REL_ID}/configure`);
      expect(
        screen.queryByRole("link", { name: "View coaching setup" }),
      ).toBeNull();
    },
  );

  it("ended client with weigh-ins: no empty-state link", async () => {
    serveMetrics({ weight: [point("2026-10-01", 61.2)] });
    renderPage("ended");
    expect(await screen.findByRole("tab", { name: /Weight/ })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "View coaching setup" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open check-in settings" }),
    ).toBeNull();
  });
});

describe("ClientProgressPage metric picker (frames 160, 160b, 160c)", () => {
  it("asks the metrics API for every standard key, at most two per call", async () => {
    serveMetrics(ROHAN);
    renderPage();
    await screen.findByRole("tab", { name: /Weight/ });
    const asked = calls();
    for (const query of asked) expect(query.keys.length).toBeLessThanOrEqual(2);
    const allTime = asked
      .filter((query) => query.range === "all")
      .flatMap((q) => q.keys);
    expect(new Set(allTime)).toEqual(
      new Set([
        "weight",
        "waist",
        "hips",
        "chest",
        "arm",
        "thigh",
        "energy",
        "sleep_quality",
        "stress",
        "hunger",
      ]),
    );
  });

  it("rail lists keys with data by name and latest value; keys without data or a form question are left out", async () => {
    serveMetrics(ROHAN);
    const { container } = renderPage();
    await screen.findByRole("tab", { name: /Weight/ });
    const rail = screen.getByRole("complementary", { name: "Metrics" });
    expect(
      within(rail)
        .getAllByRole("tablist")
        .map((list) => list.getAttribute("aria-labelledby")),
    ).toEqual([
      "pg-rail-weight",
      "pg-rail-body",
      "pg-rail-ratings",
      "pg-rail-photos",
    ]);
    const tabs = within(rail)
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Weight86.4 kg",
      "Waist94 cm",
      "Hip102 cm",
      "Energy3 of 5",
      "Sleep quality2 of 5",
      "Stress3 of 5",
      "Progress photosNo entries",
    ]);
    expect(
      within(rail).queryByRole("tab", { name: /Chest|Arm|Hunger/ }),
    ).toBeNull();
    expectNoBannedText(container);
  });

  it("weight: start, latest, change and entries from the series, newest entries first", async () => {
    serveMetrics(ROHAN);
    const { container } = renderPage();
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Weight" });
    expect(within(panel).getByText("Start · Mon 24 Aug")).toBeTruthy();
    expect(
      within(panel).getByText("Start · Mon 24 Aug").nextElementSibling
        ?.textContent,
    ).toBe("89.1 kg");
    expect(within(panel).getByText("Latest · Fri 16 Oct")).toBeTruthy();
    expect(within(panel).getByText("−2.7 kg")).toBeTruthy();
    expect(within(panel).getByText("since Mon 24 Aug")).toBeTruthy();
    expect(
      within(panel).getByRole("img", { name: /Weight, 3 entries/ }),
    ).toBeTruthy();
    const rows = within(panel).getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("Fri 16 Oct");
    const link = within(rows[0]!).getByRole("link", { name: "From check-in" });
    expect(link.getAttribute("href")).toBe(
      `/clients/${REL_ID}/check-ins/${CHECKIN_3}`,
    );
    expectNoBannedText(container);
  });

  it("ratings: 1 to 5 axis, focused key first, checkbox adds and removes lines", async () => {
    serveMetrics(ROHAN);
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Sleep quality/ }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Ratings, 1 to 5" });
    const legend = within(panel).getByRole("list", { name: "Chart key" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Sleep quality · solid", "Energy · dashed", "Stress · dotted"]);
    const chart = within(panel).getByRole("img");
    const axis = [...chart.querySelectorAll("text")].map(
      (node) => node.textContent,
    );
    expect(axis.slice(0, 5)).toEqual(["1", "2", "3", "4", "5"]);
    expect(
      within(panel).getAllByText("of 5 · Fri 16 Oct", { exact: false })[0],
    ).toBeTruthy();

    const stress = screen.getByRole("checkbox", {
      name: "Show Stress on the chart",
    });
    fireEvent.click(stress);
    await waitFor(() =>
      expect(within(legend).queryByText("Stress · dotted")).toBeNull(),
    );
    expect(chart.querySelector('[data-series="stress"]')).toBeNull();
    fireEvent.click(stress);
    await waitFor(() =>
      expect(chart.querySelector('[data-series="stress"]')).toBeTruthy(),
    );
  });

  it("measurements: several lines together with start, latest and change per key", async () => {
    serveMetrics(ROHAN);
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Waist/ }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Body measurements" });
    const chart = within(panel).getByRole("img");
    expect(chart.querySelector('[data-series="waist"]')).toBeTruthy();
    expect(chart.querySelector('[data-series="hips"]')).toBeTruthy();
    const waist = within(panel).getByRole("row", { name: /^Waist/ });
    expect(waist.textContent).toContain("98 cm");
    expect(waist.textContent).toContain("94 cm");
    expect(waist.textContent).toContain("−4 cm");
    const hip = within(panel).getByRole("row", { name: /^Hip/ });
    expect(hip.textContent).toContain("−2 cm");
  });

  it("ranges: 4 w and All ask the API by range; the chart shows what comes back", async () => {
    serveMetrics(ROHAN, {
      weight: [
        point("2026-10-09", 86.9, CHECKIN_2),
        point("2026-10-16", 86.4, CHECKIN_3),
      ],
    });
    renderPage();
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByText("Start · Fri 9 Oct");
    expect(
      calls().some((q) => q.range === "12w" && q.keys.includes("weight")),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "4 w" }));
    await waitFor(() =>
      expect(calls().some((q) => q.range === "4w")).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: "4 w" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await within(panel).findByText("Start · Mon 24 Aug");
  });

  it("custom range: from after to is refused before calling the API; a valid pair is sent", async () => {
    serveMetrics(ROHAN);
    renderPage();
    await screen.findByRole("tabpanel");
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }));
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    fireEvent.change(from, { target: { value: "2026-10-10" } });
    fireEvent.change(to, { target: { value: "2026-10-01" } });
    const before = calls().length;
    fireEvent.click(screen.getByRole("button", { name: "Show range" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The start date must be on or before the end date.",
    );
    expect(calls().length).toBe(before);

    fireEvent.change(from, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Show range" }));
    await waitFor(() =>
      expect(
        calls().some(
          (q) =>
            q.range === "custom" &&
            q.from === "2026-09-01" &&
            q.to === "2026-10-01",
        ),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: "Tue 1 Sep to Thu 1 Oct" }),
    ).toBeTruthy();
  });

  it("rail tab lists hold only tabs; the line checkboxes sit outside them", async () => {
    serveMetrics(ROHAN);
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Sleep quality/ }));
    await screen.findByRole("heading", { name: "Ratings, 1 to 5" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    for (const list of screen.getAllByRole("tablist")) {
      expect(list.querySelector("input, label, p")).toBeNull();
      for (const child of Array.from(list.children)) {
        expect(child.getAttribute("role")).toBe("tab");
      }
    }
    const checks = screen.getByRole("group", {
      name: "Ratings 1 to 5 · standard: lines on the chart",
    });
    expect(within(checks).getAllByRole("checkbox")).toHaveLength(3);
  });

  it("photo dates are counted on the client's calendar, not in UTC", async () => {
    serveMetrics(ROHAN);
    const photo = (id: string, observedAt: string) =>
      progressEntrySchema.parse({
        id,
        coachingRelationshipId: REL_ID,
        traineeUserId: "88888888-8888-4888-8888-888888888888",
        entryType: "progress_photo",
        title: null,
        body: null,
        observedAt,
        mediaAssetId: "99999999-9999-4999-8999-99999999999" + id.slice(-1),
        recordVersion: 0,
        createdAt: observedAt,
        updatedAt: observedAt,
      });
    api.listProgressEntries.mockResolvedValue({
      items: [
        // 01:30 and 15:30 on Mon 12 Oct in Kolkata; the first is still 11 Oct in UTC.
        photo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "2026-10-11T20:00:00.000Z"),
        photo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "2026-10-12T10:00:00.000Z"),
      ],
    });
    renderPage();
    const tab = await screen.findByRole("tab", { name: /Progress photos/ });
    await waitFor(() => expect(tab.textContent).toBe("Progress photos1 date"));
  });
});

describe("ClientProgressPage compare (frame 160d)", () => {
  it("puts two metrics on two labelled scales and removes the second", async () => {
    serveMetrics(ROHAN);
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Weight" });
    fireEvent.click(screen.getByRole("button", { name: /Compare with/ }));
    const options = screen.getByRole("list", { name: "Compare with" });
    // Weight is on the left scale already, so it is not offered.
    expect(
      within(options)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Waist", "Hip", "Energy", "Sleep quality", "Stress"]);
    fireEvent.click(within(options).getByRole("button", { name: "Sleep quality" }));

    const panel = screen.getByRole("tabpanel");
    await within(panel).findByRole("heading", {
      name: "Weight compared with Sleep quality",
    });
    await waitFor(() =>
      expect(
        calls().some(
          (q) =>
            q.range === "12w" &&
            q.keys.join() === "weight,sleep_quality",
        ),
      ).toBe(true),
    );
    expect(panel.textContent).toContain(
      "Two scales: kg on the left, sleep quality rating on the right. Shown side by side only; FitBud doesn't link cause and effect.",
    );
    const legend = within(panel).getByRole("list", { name: "Chart key" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Weight (kg) · solid", "Sleep quality (1 to 5) · dashed"]);
    const chart = within(panel).getByRole("img", {
      name: /Weight \(kg\) on the left scale and Sleep quality \(1 to 5\) on the right scale/,
    });
    const right = [...chart.querySelectorAll(".pg-chart-right-tick")].map(
      (node) => node.textContent,
    );
    expect(right).toEqual(["1 of 5", "2 of 5", "3 of 5", "4 of 5", "5 of 5"]);
    expect(chart.querySelector('[data-series="weight"]')).toBeTruthy();
    expect(chart.querySelector('[data-series="sleep_quality"]')).toBeTruthy();

    expect(within(panel).getByText("Weight change")).toBeTruthy();
    expect(within(panel).getByText("−2.7 kg")).toBeTruthy();
    const low = within(panel).getByText("Check-ins with sleep quality 2 or lower");
    expect(low.nextElementSibling?.textContent).toBe("1 of 2 answered");

    expect(
      screen.getByRole("button", { name: /Compare: Sleep quality/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /Sleep quality/ }).className,
    ).toContain("is-compared");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expectNoBannedText(container);

    fireEvent.click(
      within(panel).getByRole("button", { name: "Remove Sleep quality" }),
    );
    await within(panel).findByRole("heading", { name: "Weight" });
    expect(screen.getByRole("button", { name: /Compare with/ })).toBeTruthy();
  });

  it("breaks the lines over a long gap and names it", async () => {
    const weekly = (values: number[], dates: string[]) =>
      dates.map((date, index) => point(date, values[index]!));
    const dates = [
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-19",
      "2026-10-26",
    ];
    vi.setSystemTime(new Date("2026-10-27T04:00:00.000Z"));
    serveMetrics({
      weight: weekly([89, 88.8, 88.5, 88.1, 87.2, 86.9], dates),
      sleep_quality: weekly([3, 3, 2, 3, 4, 2], dates),
    });
    renderPage();
    await screen.findByRole("heading", { name: "Weight" });
    fireEvent.click(screen.getByRole("button", { name: /Compare with/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sleep quality" }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByRole("heading", {
      name: "Weight compared with Sleep quality",
    });
    const chart = within(panel).getByRole("img");
    await waitFor(() =>
      expect(chart.querySelector(".pg-chart-gap")?.textContent).toBe(
        "no check-in",
      ),
    );
    const path = chart
      .querySelector('[data-series="weight"] path')!
      .getAttribute("d")!;
    expect(path.match(/M/g)).toHaveLength(2);
  });

  it("choosing the compared metric in the rail ends the compare", async () => {
    serveMetrics(ROHAN);
    renderPage();
    await screen.findByRole("heading", { name: "Weight" });
    fireEvent.click(screen.getByRole("button", { name: /Compare with/ }));
    fireEvent.click(screen.getByRole("button", { name: "Waist" }));
    await screen.findByRole("heading", { name: "Weight compared with Waist" });
    fireEvent.click(screen.getByRole("tab", { name: /Waist/ }));
    await screen.findByRole("heading", { name: "Body measurements" });
    expect(screen.getByRole("button", { name: /Compare with/ })).toBeTruthy();
  });
});

describe("ClientProgressPage workouts from logs (frame 160e, D-W8-7)", () => {
  it("rail rows show workouts completed of planned and the number of lifts", async () => {
    serveMetrics(ROHAN);
    serveStrength(ROHAN_STRENGTH);
    renderPage();
    const completed = await screen.findByRole("tab", { name: /Workouts completed/ });
    expect(completed.textContent).toBe("Workouts completed4 of 11");
    expect(
      screen.getByRole("tab", { name: /Exercise progress/ }).textContent,
    ).toBe("Exercise progress2 lifts");
    expect(strengthCalls()).toContainEqual({ range: "all" });
  });

  it("top set by kg, then a bodyweight lift by reps, with totals and uncharted sets", async () => {
    serveMetrics(ROHAN);
    serveStrength(ROHAN_STRENGTH);
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Exercise progress/ }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Exercise progress" });
    expect(strengthCalls()).toContainEqual({ range: "12w" });

    // Back squat opens first: it has the most charted sessions.
    const exercise = within(panel).getByRole("combobox", { name: "Exercise" });
    expect((exercise as HTMLSelectElement).value).toBe("ex-squat");
    expect(panel.textContent).toContain(
      "Heaviest logged set per session · kg read from the logged load",
    );
    const first = within(panel).getByText("First in range · Wed 2 Sep");
    expect(first.nextElementSibling?.textContent).toBe("60 kg × 8");
    const latest = within(panel).getByText("Latest · Wed 14 Oct");
    expect(latest.nextElementSibling?.textContent).toBe("67.5 kg × 6");
    const sessions = within(panel).getByText("Sessions with this lift");
    expect(sessions.nextElementSibling?.textContent).toBe("3 of 4 planned");
    let chart = within(panel).getByRole("img", { name: /Back squat, top set in kg/ });
    expect(chart.querySelectorAll("circle")).toHaveLength(3);

    fireEvent.click(within(panel).getByRole("button", { name: "Total reps × kg" }));
    chart = within(panel).getByRole("img", { name: /Back squat, total in kg/ });
    expect(chart.querySelector("circle title")?.textContent).toContain("1,440 kg");

    // Pull-ups carry no kg: charted by reps (D-W8-7).
    fireEvent.change(exercise, { target: { value: "ex-pull" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Top set" }));
    expect(panel.textContent).toContain(
      "Most reps in one set per session · bodyweight lift, charted by reps",
    );
    expect(
      within(panel).getByText("First in range · Wed 7 Oct").nextElementSibling
        ?.textContent,
    ).toBe("8 reps");
    expect(
      within(panel).getByText("Latest · Wed 14 Oct").nextElementSibling
        ?.textContent,
    ).toBe("12 reps");
    chart = within(panel).getByRole("img", { name: /Pull-up, top set in reps/ });
    const ticks = [...chart.querySelectorAll(".pg-chart-grid text")].map(
      (node) => node.textContent ?? "",
    );
    expect(ticks.some((tick) => tick.endsWith(" reps"))).toBe(true);
    expect(within(panel).getByRole("button", { name: "Total reps" })).toBeTruthy();

    // Uncharted sets: count, the frame's copy, and the list on demand.
    expect(panel.textContent).toContain(
      '2 sets not charted: load logged as text ("RPE 8", "red band"). Bodyweight lifts chart reps instead.',
    );
    const see = within(panel).getByRole("button", { name: "See sets" });
    expect(see.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(see);
    const items = within(panel)
      .getByRole("list")
      .querySelectorAll("li");
    expect([...items].map((li) => li.textContent)).toEqual([
      "Wed 14 OctBand rowred band × 12",
      "Wed 7 OctBack squatRPE 8 × 5",
    ]);

    // Workouts per week: totals for the range and this week, one bar group per week.
    expect(within(panel).getByText("4 of 11 in 12 weeks · 1 of 3 this week")).toBeTruthy();
    const bars = within(panel).getByRole("img", { name: /Workouts completed per week/ });
    expect(
      [...bars.querySelectorAll("title")].map((node) => node.textContent),
    ).toContain("This week: 1 of 3 planned workouts completed");
    expectNoBannedText(container);
  });

  it("a client with workout logs and no check-in answers opens on the workouts panel", async () => {
    serveStrength(ROHAN_STRENGTH);
    renderPage();
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Exercise progress" });
    expect(
      screen.queryByRole("heading", { name: "No progress data yet" }),
    ).toBeNull();
    // Range All reuses the all-time model.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await within(panel).findByText("First logged · Wed 2 Sep");
    expect(within(panel).getByText("4 of 11 since start · 1 of 3 this week")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Z8-14: photos compare (160f), sparse (160g), empty (161), ended (160h), loading (160i)
// ---------------------------------------------------------------------------

const TRAINEE_ID = "88888888-8888-4888-8888-888888888888";
const FORM_TEMPLATE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NEXT_CHECKIN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function photoEntry(n: number, observedAt: string) {
  const suffix = String(n).padStart(12, "0");
  return progressEntrySchema.parse({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`,
    coachingRelationshipId: REL_ID,
    traineeUserId: TRAINEE_ID,
    entryType: "progress_photo",
    title: null,
    body: null,
    observedAt,
    mediaAssetId: `bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`,
    recordVersion: 0,
    createdAt: observedAt,
    updatedAt: observedAt,
  });
}

/** The client's pinned form, as the check-in form endpoint returns it. */
function serveForm(keys: string[]) {
  api.getCheckinForm.mockResolvedValue(
    checkinFormVersionSchema.parse({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      templateId: FORM_TEMPLATE_ID,
      key: "standard_checkin",
      version: 2,
      scope: "global",
      fields: GLOBAL_CHECKIN_FORM_V2_FIELDS.filter((field) =>
        keys.includes(field.key),
      ),
      createdAt: "2026-09-01T00:00:00.000Z",
    }),
  );
}

/** A scheduled next check-in whose window opens Sun 25 Oct in Kolkata. */
const NEXT_CHECKIN = checkinSchema.parse({
  id: NEXT_CHECKIN_ID,
  coachingRelationshipId: REL_ID,
  checkinScheduleId: null,
  localDate: "2026-10-25",
  windowStartsAt: "2026-10-24T18:30:00.000Z",
  windowEndsAt: "2026-10-26T18:29:59.000Z",
  recordStatus: "draft",
  recordVersion: 0,
  definitionVersion: 2,
  checkinFormVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  answers: null,
  submittedAt: null,
  status: "scheduled",
  review: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
});

const PLAN = {
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  title: "Fat loss, phase 1",
  effectiveFrom: "2026-10-12T00:00:00.000Z",
};

describe("ClientProgressPage photos compare (frame 160f)", () => {
  const PHOTOS = [
    // Client days in Kolkata: Fri 28 Aug, Fri 18 Sep (two photos), Fri 16 Oct.
    photoEntry(1, "2026-08-28T03:00:00.000Z"),
    photoEntry(2, "2026-09-18T03:00:00.000Z"),
    photoEntry(3, "2026-09-18T03:05:00.000Z"),
    photoEntry(4, "2026-10-16T03:00:00.000Z"),
  ];

  it("opens from the rail, compares the first and last dates, and a picked date replaces the older pick", async () => {
    serveMetrics({
      weight: [point("2026-08-28", 88.9, CHECKIN_1), point("2026-10-16", 86.4, CHECKIN_3)],
    });
    api.listProgressEntries.mockResolvedValue({ items: PHOTOS });
    const { container } = renderPage();
    const tab = await screen.findByRole("tab", { name: /Progress photos/ });
    expect(tab.textContent).toBe("Progress photos3 dates");
    expect(tab.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("tab", { name: /Weight/ }).getAttribute("aria-selected"),
    ).toBe("false");

    const panel = screen.getByRole("tabpanel");
    within(panel).getByRole("heading", { name: "Progress photos" });
    expect(within(panel).getByText("Only you and Rohan see these")).toBeTruthy();
    // The chip carries the weight entered that day; no pose switch (no pose on stored photos).
    const pair = within(panel).getByTestId("photo-compare");
    expect(
      [...pair.querySelectorAll("figcaption")].map((node) => node.textContent),
    ).toEqual(["Fri 28 Aug · 88.9 kg", "Fri 16 Oct · 86.4 kg"]);
    expect(within(panel).queryByRole("button", { name: "Front" })).toBeNull();
    expect(
      within(panel).getByText(
        "3 dates with photos · Fri 18 Sep has 2 photos, the first is shown",
      ),
    ).toBeTruthy();
    // Each date's photo loads through the authorized download target.
    expect(api.getDownloadTarget).toHaveBeenCalledWith(PHOTOS[0]!.mediaAssetId);
    expect(api.getDownloadTarget).not.toHaveBeenCalledWith(PHOTOS[2]!.mediaAssetId);

    const strip = within(panel).getByRole("list", {
      name: "Pick two dates to compare",
    });
    const thumbs = within(strip).getAllByRole("button");
    expect(thumbs.map((t) => t.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "true",
    ]);
    fireEvent.click(thumbs[1]!);
    // Fri 28 Aug was picked first, so it gives way; oldest stays on the left.
    expect(
      [...pair.querySelectorAll("figcaption")].map((node) => node.textContent),
    ).toEqual(["Fri 18 Sep", "Fri 16 Oct · 86.4 kg"]);
    expect(thumbs.map((t) => t.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "true",
    ]);
    expectNoBannedText(container);
  });

  it("a client with only photos opens on them; one date shows alone", async () => {
    api.listProgressEntries.mockResolvedValue({ items: [PHOTOS[0]] });
    renderPage();
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Progress photos" });
    expect(within(panel).getByText("A second date makes a compare")).toBeTruthy();
    expect(within(panel).getByText("1 date with photos")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "No progress data yet" }),
    ).toBeNull();
  });

  it("with no photos the rail row says No entries and cannot be opened", async () => {
    serveMetrics(ROHAN);
    renderPage();
    const tab = await screen.findByRole("tab", { name: /Progress photos/ });
    expect(tab.textContent).toBe("Progress photosNo entries");
    expect(tab.hasAttribute("disabled")).toBe(true);
  });
});

describe("ClientProgressPage sparse data (frame 160g)", () => {
  it("two weigh-ins: points without a change, and the panel says why", async () => {
    serveMetrics({
      weight: [point("2026-10-05", 72.4), point("2026-10-18", 71.8, CHECKIN_1)],
      waist: [point("2026-10-05", 81)],
      energy: [point("2026-10-18", 3, CHECKIN_1)],
    });
    serveForm(["weight", "waist", "hips", "chest", "arm", "energy", "sleep_quality"]);
    const { container } = renderPage("active", {
      overview: { nextCheckin: NEXT_CHECKIN },
    });
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Weight" });
    expect(
      within(panel).getByText("1 from a check-in, 1 measurement entry"),
    ).toBeTruthy();
    expect(within(panel).getByText("Start · Mon 5 Oct")).toBeTruthy();
    expect(within(panel).getByText("Latest · Sun 18 Oct")).toBeTruthy();
    expect(within(panel).queryByText("Change")).toBeNull();
    expect(within(panel).getByText("Entries")).toBeTruthy();
    expect(
      within(panel).getByText(
        "Two weigh-ins so far. The trend line gets useful after a few more check-ins.",
      ),
    ).toBeTruthy();
    expect(
      within(panel).queryByRole("button", { name: /data table/ }),
    ).toBeNull();
    // Questions the form asks with no answers yet stay listed, and cannot be opened.
    const rail = screen.getByRole("complementary", { name: "Metrics" });
    await waitFor(() =>
      expect(within(rail).getByRole("tab", { name: /Hip/ }).textContent).toBe(
        "HipNo entries",
      ),
    );
    expect(api.getCheckinForm).toHaveBeenCalledWith(NEXT_CHECKIN_ID);
    const tabs = within(rail)
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Weight71.8 kg",
      "Waist81 cm",
      "HipNo entries",
      "ChestNo entries",
      "ArmNo entries",
      "Energy3 of 5",
      "Sleep qualityNo entries",
      "Progress photosNo entries",
    ]);
    expect(
      within(rail).getByRole("tab", { name: /Chest/ }).hasAttribute("disabled"),
    ).toBe(true);
    // Thigh and Hunger are not in this client's form.
    expect(within(rail).queryByRole("tab", { name: /Thigh|Hunger/ })).toBeNull();
    expectNoBannedText(container);
  });

  it("three weigh-ins read as a trend again: change and the data table", async () => {
    serveMetrics(ROHAN);
    renderPage();
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByText("Change");
    expect(within(panel).queryByText(/so far/)).toBeNull();
    expect(within(panel).getByRole("button", { name: "Show data table" })).toBeTruthy();
  });
});

describe("ClientProgressPage empty (frame 161)", () => {
  it("rail and toolbar stay; the panel explains where data comes from", async () => {
    serveForm(["weight", "waist", "hips", "chest", "arm", "energy", "sleep_quality", "stress", "hunger"]);
    const { container } = renderPage("active", {
      header: { effectivePlan: PLAN, traineeProfile: { displayName: "Priya Sharma", age: null, gender: "female" }, traineeDisplayName: "Priya Sharma" },
      overview: { nextCheckin: NEXT_CHECKIN },
    });
    const heading = await screen.findByRole("heading", {
      name: "No progress data yet",
    });
    const panel = heading.closest("section")!;
    expect(
      within(panel).getByText(
        "Charts follow the standard questions in her check-in form: weight, the measurements you picked, ratings and photos. Her next check-in opens Sun 25 Oct. Workout progress appears after Priya logs a workout.",
      ),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: "Open check-in settings" })
        .getAttribute("href"),
    ).toBe(`/clients/${REL_ID}/configure`);
    expect(
      (
        await within(panel).findByRole("link", { name: "See her check-in form" })
      ).getAttribute("href"),
    ).toBe(`/templates/checkins/${FORM_TEMPLATE_ID}`);

    const rail = screen.getByRole("complementary", { name: "Metrics" });
    await waitFor(() =>
      expect(within(rail).getAllByRole("tab")).toHaveLength(12),
    );
    const tabs = within(rail).getAllByRole("tab");
    expect(tabs[0]!.textContent).toBe("WeightNo entries");
    expect(
      tabs.slice(1).every((tab) => tab.textContent!.endsWith("No entries")),
    ).toBe(true);
    expect(
      within(rail).getByRole("tab", { name: /Workouts completed/ }).textContent,
    ).toBe("Workouts completedNo entries");
    expect(screen.getByRole("button", { name: "12 w" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Compare with/ }).hasAttribute("disabled"),
    ).toBe(true);
    expectNoBannedText(container);
  });
});

describe("ClientProgressPage ended (frame 160h)", () => {
  const ENDED = {
    startedAt: "2026-07-06T04:30:00.000Z",
    endedAt: "2026-10-03T10:00:00.000Z",
    traineeDisplayName: "Kavya Nair",
    traineeProfile: { displayName: "Kavya Nair", age: null, gender: "female" },
  };

  it("read-only banner, coached period, last entry and change; nothing to edit", async () => {
    serveMetrics({
      weight: [
        point("2026-07-06", 68.2, CHECKIN_1),
        point("2026-08-14", 66.8, CHECKIN_2),
        point("2026-10-02", 65.1, CHECKIN_3),
      ],
    });
    const { container } = renderPage("ended", { header: ENDED });
    const banner = await screen.findByRole("note");
    expect(banner.textContent).toBe(
      "Coaching with Kavya ended Sat 3 Oct. Her progress is read-only and stays here for her records.",
    );
    const panel = await screen.findByRole("tabpanel");
    await within(panel).findByRole("heading", { name: "Weight" });
    expect(
      within(panel).getByText("Coached period Mon 6 Jul — Sat 3 Oct · 3 entries"),
    ).toBeTruthy();
    expect(within(panel).getByText("Start")).toBeTruthy();
    // The whole coached period: ended clients open on All.
    expect(
      screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(panel).getByText("Last · Fri 2 Oct")).toBeTruthy();
    expect(within(panel).getByText("−3.1 kg")).toBeTruthy();
    expect(within(panel).queryByText(/since/)).toBeNull();
    expect(within(panel).queryByText("Entries")).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: /data table/ }),
    ).toBeNull();
    // No form is read for an ended client (no next check-in), and no edit or log action shows.
    expect(api.getCheckinForm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Log|Edit|Add|Upload/ })).toBeNull();
    expectNoBannedText(container);
  });
});

describe("ClientProgressPage loading (frame 160i)", () => {
  it("keeps the toolbar and shows skeleton rows until data arrives", async () => {
    let release: () => void = () => {};
    api.listProgressEntries.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ items: [] });
      }),
    );
    serveMetrics(ROHAN);
    renderPage();
    expect(await screen.findByTestId("progress-skeleton")).toBeTruthy();
    expect(screen.getByText("Loading progress…")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "12 w" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("complementary", { name: "Metrics" })).toBeNull();
    release();
    await screen.findByRole("complementary", { name: "Metrics" });
    expect(screen.queryByTestId("progress-skeleton")).toBeNull();
  });
});
