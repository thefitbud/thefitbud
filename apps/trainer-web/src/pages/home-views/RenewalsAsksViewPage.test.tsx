/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import {
  coachAskListResponseSchema,
  subscriptionAttentionResponseSchema,
  type CoachAsk,
  type SubscriptionAttentionResponse,
} from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  listCoachAsks: vi.fn(),
  listSubscriptionAttention: vi.fn(),
  listClients: vi.fn(),
}));

vi.mock("../../lib/stage1-api", () => ({
  stage1Api: { listCoachAsks: api.listCoachAsks },
}));
vi.mock("../../lib/api", () => ({
  apiClient: {
    listClients: api.listClients,
    listSubscriptionAttention: api.listSubscriptionAttention,
  },
}));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));
// The drawer has its own tests; here only what the view hands it matters.
vi.mock("../../components/CoachAskDrawer", () => ({
  CoachAskDrawer: (props: {
    askId: string;
    clientName: string;
    onClose: () => void;
    onChanged?: () => void;
  }) => (
    <div role="dialog" aria-label={`Ask from ${props.clientName}`}>
      <span data-testid="drawer-ask">{props.askId}</span>
      <button type="button" onClick={() => props.onChanged?.()}>
        Mark answered
      </button>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  ),
}));

import { RenewalsViewPage, renewalChipLabel } from "./RenewalsViewPage";
import { AsksViewPage, askedWhen } from "./AsksViewPage";

const ROHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const MEERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const NEHA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03";
const PRIYA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04";

// Tue 3 Nov 2026, 11:30 am in Asia/Kolkata.
const NOW = new Date("2026-11-03T06:00:00.000Z");

function clients() {
  return {
    items: [
      { relationshipId: ROHAN, traineeDisplayName: "Rohan Mehta", status: "active" },
      { relationshipId: MEERA, traineeDisplayName: "Meera Iyer", status: "active" },
      { relationshipId: NEHA, traineeDisplayName: "Neha Reddy", status: "active" },
      { relationshipId: PRIYA, traineeDisplayName: "Priya Sharma", status: "active" },
    ],
    facets: { status: {}, adherence: {}, renewal: {} },
    nextCursor: null,
  };
}

function renewals(): SubscriptionAttentionResponse {
  const sub = (
    rid: string,
    n: number,
    renewsOn: string,
    renewalState: "upcoming" | "due" | "expired",
    planName: string,
  ) => ({
    coachingRelationshipId: rid,
    traineeUserId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb0${n}`,
    planName,
    paymentFrequency: "monthly" as const,
    renewsOn,
    renewalState,
    versionNumber: 1,
  });
  return subscriptionAttentionResponseSchema.parse({
    items: [
      sub(ROHAN, 1, "2026-10-31", "expired", "Strength coaching"),
      sub(NEHA, 3, "2026-11-08", "upcoming", "Fat loss"),
      sub(MEERA, 2, "2026-11-03", "due", "Strength coaching"),
    ],
  });
}

function asks(): CoachAsk[] {
  const ask = (
    n: number,
    rid: string,
    topic: string,
    askedAt: string,
    extra: Partial<CoachAsk> = {},
  ) => ({
    id: `cccccccc-cccc-4ccc-8ccc-cccccccccc0${n}`,
    relationshipId: rid,
    itemType: "meal_assignment",
    itemId: `dddddddd-dddd-4ddd-8ddd-dddddddddd0${n}`,
    topic,
    status: "open",
    askCount: 1,
    askedAt,
    lastAskedAt: askedAt,
    ...extra,
  });
  return coachAskListResponseSchema.parse({
    items: [
      ask(1, PRIYA, "substitute", "2026-11-03T02:10:00.000Z", {
        itemLabel: "Breakfast",
        itemDate: "2026-11-03",
      }),
      ask(2, NEHA, "timing", "2026-11-01T04:00:00.000Z", {
        itemType: "workout_assignment",
        itemLabel: null,
      }),
      ask(3, ROHAN, "pain", "2026-11-02T15:35:00.000Z", {
        itemType: "workout_assignment",
        itemLabel: "Lower body A",
        itemDate: "2026-11-02",
      }),
    ],
  }).items;
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>
      <div data-testid="nav-type">{navigationType}</div>
    </>
  );
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/home/renewals" element={<RenewalsViewPage />} />
        <Route path="/home/asks" element={<AsksViewPage />} />
        <Route path="/clients/:rid/configure" element={<div>Configure page</div>} />
        <Route path="/" element={<div>Home page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function assertNoLeaks() {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(text).not.toMatch(/meal_assignment|workout_assignment|upcoming|monthly\b/);
  expect(text).not.toContain("%");
  expect(text).not.toMatch(/streak/i);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.listCoachAsks.mockReset();
  api.listSubscriptionAttention.mockReset();
  api.listClients.mockReset();
  api.listClients.mockResolvedValue(clients());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RenewalsViewPage", () => {
  it("lists every renewal grouped expired first, with names and civil dates", async () => {
    api.listSubscriptionAttention.mockResolvedValue(renewals());
    renderAt("/home/renewals");

    const expired = await screen.findByRole("region", { name: /Expired/ });
    const week = screen.getByRole("region", { name: /Due in the next 7 days/ });

    const expiredRows = within(expired).getAllByRole("link");
    expect(expiredRows).toHaveLength(1);
    await waitFor(() => expect(expiredRows[0]?.textContent).toContain("Rohan Mehta"));
    expect(expiredRows[0]?.textContent).toContain("Ended Sat 31 Oct");
    expect(expiredRows[0]?.textContent).toContain("Strength coaching · Monthly");

    const weekRows = within(week).getAllByRole("link");
    expect(weekRows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Meera Iyer"),
      expect.stringContaining("Neha Reddy"),
    ]);
    expect(weekRows[0]?.textContent).toContain("Due Tue 3 Nov");
    expect(weekRows[0]?.textContent).toContain("Due today");
    expect(weekRows[1]?.textContent).toContain("Due Sun 8 Nov");
    expect(weekRows[1]?.textContent).toContain("Due in 5 d");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Renewals due\s*3/);
    expect(screen.getByText(/FitBud does not charge clients/)).toBeTruthy();
    assertNoLeaks();
  });

  it("a row opens that client's subscription (D14 interim)", async () => {
    api.listSubscriptionAttention.mockResolvedValue(renewals());
    renderAt("/home/renewals");
    const row = await screen.findByRole("link", { name: /^Neha Reddy\./ });
    expect(row.getAttribute("href")).toBe(`/clients/${NEHA}/configure#subscription`);
    fireEvent.click(row);
    expect(await screen.findByText("Configure page")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(
      `/clients/${NEHA}/configure#subscription`,
    );
  });

  it("filters with the chips and keeps the filter in the URL", async () => {
    api.listSubscriptionAttention.mockResolvedValue(renewals());
    renderAt("/home/renewals");
    await screen.findByRole("region", { name: /Expired/ });

    const chip = screen.getByRole("button", { name: /Next 7 days\s*2/ });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("region", { name: /Expired/ })).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/home/renewals?when=week");
  });

  it("shows the empty state", async () => {
    api.listSubscriptionAttention.mockResolvedValue({ items: [] });
    renderAt("/home/renewals");
    expect(
      await screen.findByRole("heading", { name: "No renewals in the next 7 days" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /All/ })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Back to Home" }));
    expect(await screen.findByText("Home page")).toBeTruthy();
  });

  it("shows the error state when the first load fails", async () => {
    api.listSubscriptionAttention.mockRejectedValue(new Error("offline"));
    renderAt("/home/renewals");
    expect(
      await screen.findByRole("heading", { name: "Couldn't load renewals" }),
    ).toBeTruthy();
  });

  it("pops back to the Home entry it was opened from", async () => {
    api.listSubscriptionAttention.mockResolvedValue(renewals());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/home/renewals" element={<RenewalsViewPage />} />
          <Route
            path="/"
            element={
              <div data-testid="screen-TW-04">
                <Link to="/home/renewals">Renewals due 3</Link>
              </div>
            }
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Renewals due 3" }));
    await screen.findByRole("region", { name: /Expired/ });
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    await screen.findByTestId("screen-TW-04");
    expect(screen.getByTestId("nav-type").textContent).toBe("POP");
  });
});

describe("AsksViewPage", () => {
  it("lists every open ask with the client's name, pain first, then newest", async () => {
    api.listCoachAsks.mockResolvedValue({ items: asks() });
    renderAt("/home/asks");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Rohan Mehta\./ })).toBeTruthy(),
    );
    const list = screen.getByRole("list", { name: "Open questions" });
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Rohan Mehta"),
      expect.stringContaining("Priya Sharma"),
      expect.stringContaining("Neha Reddy"),
    ]);
    expect(rows[0]?.textContent).toContain("Asked about Lower body A · Mon 2 Nov");
    expect(rows[0]?.textContent).toContain("Pain");
    expect(rows[0]?.textContent).toContain("Yesterday, 9:05 pm");
    expect(rows[1]?.textContent).toContain("Asked about Breakfast · Tue 3 Nov");
    expect(rows[1]?.textContent).toContain("Today, 7:40 am");
    expect(rows[2]?.textContent).toContain("Asked about Workout");
    expect(rows[2]?.textContent).toContain("Sun 1 Nov");

    expect(api.listCoachAsks).toHaveBeenCalledWith({ status: "open" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /Asked you on WhatsApp\s*3/,
    );
    expect(screen.getByText(/Pain questions are marked red/)).toBeTruthy();
    assertNoLeaks();
  });

  it("a row opens the ask drawer with the client's name; answering removes it", async () => {
    api.listCoachAsks.mockResolvedValueOnce({ items: asks() });
    renderAt("/home/asks");
    const row = await screen.findByRole("button", { name: /^Priya Sharma\./ });
    fireEvent.click(row);

    const drawer = await screen.findByRole("dialog", { name: "Ask from Priya Sharma" });
    expect(screen.getByTestId("location").textContent).toBe(
      `/home/asks?ask=${asks()[0]!.id}`,
    );
    // Opening the drawer replaces the entry, so Back still goes Home.
    expect(screen.getByTestId("nav-type").textContent).toBe("REPLACE");

    api.listCoachAsks.mockResolvedValue({
      items: asks().filter((a) => a.relationshipId !== PRIYA),
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Mark answered" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Priya Sharma\./ })).toBeNull(),
    );
    // The drawer keeps the name after the row leaves the list.
    expect(screen.getByRole("dialog", { name: "Ask from Priya Sharma" })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/home/asks");
  });

  it("shows the empty state", async () => {
    api.listCoachAsks.mockResolvedValue({ items: [] });
    renderAt("/home/asks");
    expect(await screen.findByRole("heading", { name: "No open questions" })).toBeTruthy();
    expect(screen.getByText(/Ask coach on WhatsApp/)).toBeTruthy();
    expect(screen.queryByText(/Pain questions/)).toBeNull();
  });

  it("shows the error state when the first load fails", async () => {
    api.listCoachAsks.mockRejectedValue(new Error("offline"));
    renderAt("/home/asks");
    expect(
      await screen.findByRole("heading", { name: "Couldn't load asked-coach items" }),
    ).toBeTruthy();
  });
});

describe("labels", () => {
  it("renewal chips read Expired, Due today and Due in N d", () => {
    const [expired, upcoming, due] = renewals().items;
    expect(renewalChipLabel(expired!, "2026-11-03")).toBe("Expired");
    expect(renewalChipLabel(upcoming!, "2026-11-03")).toBe("Due in 5 d");
    expect(renewalChipLabel(due!, "2026-11-03")).toBe("Due today");
  });

  it("ask times read Today, Yesterday or a civil date in the trainer's zone", () => {
    expect(askedWhen("2026-11-03T02:10:00.000Z", "Asia/Kolkata", NOW)).toBe("Today, 7:40 am");
    expect(askedWhen("2026-11-02T15:35:00.000Z", "Asia/Kolkata", NOW)).toBe("Yesterday, 9:05 pm");
    expect(askedWhen("2026-11-01T04:00:00.000Z", "Asia/Kolkata", NOW)).toBe("Sun 1 Nov");
  });
});
