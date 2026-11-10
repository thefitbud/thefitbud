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
import {
  progressMetricsQuerySchema,
  progressMetricsResponseSchema,
  type ProgressMetricKey,
  type ProgressMetricPoint,
  type ProgressMetricsQuery,
} from "@fitbud/contracts";

const REL_ID = "77777777-7777-4777-8777-777777777777";
const CHECKIN_1 = "11111111-1111-4111-8111-111111111111";
const CHECKIN_2 = "22222222-2222-4222-8222-222222222222";
const CHECKIN_3 = "33333333-3333-4333-8333-333333333333";

const api = vi.hoisted(() => ({
  getProgressMetrics: vi.fn(),
  listProgressEntries: vi.fn(),
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

function renderPage(onboardingStatus: Lifecycle = "active") {
  const context = {
    workspace: {
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
  api.listProgressEntries.mockResolvedValue({ items: [] });
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
      await screen.findByText(
        "No weigh-ins yet. Weight is collected in check-ins.",
      ),
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

  it("rail lists keys with data by name and latest value; keys without data are left out", async () => {
    serveMetrics(ROHAN);
    const { container } = renderPage();
    const rail = await screen.findByRole("tablist", { name: "Metric" });
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
});
