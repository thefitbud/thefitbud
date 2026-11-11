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
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment, Measurement } from "@fitbud/contracts";

const REL = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-11-04T06:30:00.000Z"); // Wed 4 Nov, 12:00 pm IST

const api = vi.hoisted(() => ({
  getMealAssignment: vi.fn(),
  listMeasurements: vi.fn(),
  createMeasurement: vi.fn(),
  request: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { LogEntryRoutes } from "./LogEntryRoutes";
import { ProgressPanel } from "../../components/activity/ProgressPanel";
import { MealPanel } from "../../components/activity/MealPanel";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MEAL_ID = id(11);
const OLD_MEAL_ID = id(12);
const MEASURE_ID = id(21);

function compliance(
  overrides: Partial<NonNullable<MealAssignment["compliance"]>> = {},
): NonNullable<MealAssignment["compliance"]> {
  return {
    id: id(60),
    assignmentId: MEAL_ID,
    coachingRelationshipId: REL,
    planVersionId: id(2),
    traineeUserId: id(4),
    outcome: "confirmed",
    recordVersion: 2,
    loggedAt: "2026-11-03T06:00:00.000Z",
    deviationKind: null,
    notes: null,
    photoRequired: false,
    photoIntent: null,
    mediaAssetId: null,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    createdAt: NOW.toISOString(),
    updatedAt: "2026-11-03T06:00:00.000Z",
    ...overrides,
  };
}

function meal(
  localDate: string,
  mealId: string,
  withCompliance: NonNullable<MealAssignment["compliance"]> | null = null,
): MealAssignment {
  return {
    id: mealId,
    coachingRelationshipId: REL,
    planId: id(1),
    planVersionId: id(2),
    mealPrescriptionId: id(3),
    mealName: "Lunch",
    localDate,
    windowStartsAt: `${localDate}T06:00:00.000Z`,
    windowEndsAt: `${localDate}T08:30:00.000Z`,
    photoRequired: false,
    status: withCompliance ? "confirmed" : "pending",
    scheduleStatus: "scheduled",
    prescription: { items: [] },
    compliance: withCompliance,
    loggingLocked: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  } as unknown as MealAssignment;
}

function measurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: MEASURE_ID,
    coachingRelationshipId: REL,
    traineeUserId: id(4),
    type: "body_weight_kg",
    value: 72.4,
    unit: "kg",
    observedAt: "2026-11-02T05:00:00.000Z",
    source: "trainee_entry",
    checkinId: null,
    mediaAssetId: null,
    recordVersion: 3,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage(path: string, opts?: { ended?: boolean; online?: boolean }) {
  const ended = opts?.ended ?? false;
  const context = {
    workspace: {
      header: {
        relationshipId: REL,
        traineeDisplayName: ended ? "Vikram Singh" : "Rohan Mehta",
        onboardingStatus: ended ? "ended" : "coaching_ready",
        traineeProfile: { displayName: "x", age: null, gender: "male" },
        traineeTimezone: "Asia/Kolkata",
      },
    },
    refreshEpoch: 0,
    relationshipId: REL,
    online: opts?.online ?? true,
    ended,
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route path="log-entry/*" element={<LogEntryRoutes />} />
          <Route path="activity" element={<Where />} />
          <Route path="progress" element={<Where />} />
          <Route path="overview" element={<p>overview route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const mealPath = (mealId: string) => `/clients/${REL}/log-entry/meal/${mealId}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getMealAssignment.mockResolvedValue(meal("2026-11-03", MEAL_ID));
  api.listMeasurements.mockResolvedValue({ items: [measurement()], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("trainer log meal", () => {
  it("logs a followed meal with one PUT, an idempotency key and no recordVersion", async () => {
    api.request.mockResolvedValue(compliance());
    renderPage(mealPath(MEAL_ID));
    expect(await screen.findByRole("heading", { name: "Log meal" })).toBeTruthy();
    expect(screen.getByText(/Tue 3 Nov/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    const [method, path, , options] = api.request.mock.calls[0]!;
    expect(method).toBe("PUT");
    expect(path).toBe(`/meals/compliance/${MEAL_ID}/2026-11-03`);
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.body).toEqual({ outcome: "confirmed", notes: null });
    expect(options.body.recordVersion).toBeUndefined();
    expect((await screen.findByTestId("where")).textContent).toBe(
      `/clients/${REL}/activity?type=meal&item=meal:${MEAL_ID}`,
    );
  });

  it("a changed meal needs what changed, and sends it with the note", async () => {
    api.request.mockResolvedValue(compliance({ outcome: "modified", deviationKind: "substitute" }));
    renderPage(mealPath(MEAL_ID));
    await screen.findByRole("heading", { name: "Log meal" });
    fireEvent.click(screen.getByRole("button", { name: "Modified" }));
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    expect((await screen.findByTestId("log-meal-problem")).textContent).toBe(
      "Pick what changed in this meal.",
    );
    expect(api.request).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Substitute" }));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "  Ate paneer instead  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(api.request.mock.calls[0]![3].body).toEqual({
      outcome: "modified",
      deviationKind: "substitute",
      notes: "Ate paneer instead",
    });
    // The client's own food list is never offered as a kind a trainer can author.
    expect(screen.queryByRole("button", { name: "Logged foods" })).toBeNull();
  });

  it("not saved: keeps the form, and Try again resends the same key and body; a changed form gets a new key", async () => {
    api.request
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(compliance());
    renderPage(mealPath(MEAL_ID));
    await screen.findByRole("heading", { name: "Log meal" });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Light lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));

    const banner = await screen.findByTestId("log-meal-not-saved");
    expect(banner.textContent).toContain("We couldn’t reach FitBud, so nothing was saved.");
    expect((screen.getByLabelText(/Note/) as HTMLTextAreaElement).value).toBe("Light lunch");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    const first = api.request.mock.calls[0]![3];
    const second = api.request.mock.calls[1]![3];
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.body).toEqual(first.body);

    // The trainer changes the form after a failure: a different logical save, a new key.
    await screen.findByTestId("log-meal-not-saved");
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Light lunch, no rice" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(3));
    const third = api.request.mock.calls[2]![3];
    expect(third.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(third.body.notes).toBe("Light lunch, no rice");
  });

  it("edit: shows who logged it, sends the recordVersion read, and a conflict offers Reload that refetches", async () => {
    const trainee = meal("2026-11-03", MEAL_ID, compliance({ recordVersion: 2 }));
    const fresh = meal(
      "2026-11-03",
      MEAL_ID,
      compliance({ recordVersion: 3, outcome: "skipped", lastEditedByRole: "coach" }),
    );
    api.getMealAssignment.mockResolvedValueOnce(trainee).mockResolvedValueOnce(fresh);
    api.request
      .mockRejectedValueOnce(
        new ApiClientError({ code: "VERSION_CONFLICT", message: "This meal changed since it was opened. Reload and try again.", status: 409, requestId: "r1" }),
      )
      .mockResolvedValueOnce(compliance({ recordVersion: 4 }));
    renderPage(mealPath(MEAL_ID));
    expect(await screen.findByRole("heading", { name: "Edit meal" })).toBeTruthy();

    // Nothing changed yet: Save is off.
    expect((screen.getByRole("button", { name: "Save meal" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skipped" }));
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    const firstCall = api.request.mock.calls[0]![3];
    expect(firstCall.body).toEqual({ outcome: "skipped", notes: null, recordVersion: 2 });

    // 409: the button becomes Reload; pressing it must not resend the old body.
    const banner = await screen.findByTestId("log-meal-not-saved");
    expect(banner.textContent).toContain("Reload to see what is saved.");
    expect(api.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(api.getMealAssignment).toHaveBeenCalledTimes(2));
    expect((await screen.findByTestId("log-meal-notice")).textContent).toContain(
      "Your unsaved changes were discarded.",
    );
    expect(screen.getByTestId("log-meal-tag").textContent).toBe("Edited by coach · Tue 3 Nov");
    expect(api.request).toHaveBeenCalledTimes(1);

    // The next save starts from the reloaded version, with a new key.
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    const secondCall = api.request.mock.calls[1]![3];
    expect(secondCall.body.recordVersion).toBe(3);
    expect(secondCall.idempotencyKey).not.toBe(firstCall.idempotencyKey);
  });

  it("tags a coach-logged entry", async () => {
    api.getMealAssignment.mockResolvedValue(
      meal("2026-11-03", MEAL_ID, compliance({ loggedByRole: "coach" })),
    );
    renderPage(mealPath(MEAL_ID));
    expect((await screen.findByTestId("log-meal-tag")).textContent).toBe("Logged by coach");
  });

  it("an entry with the client's food list locks the outcome and keeps the note editable", async () => {
    api.getMealAssignment.mockResolvedValue(
      meal(
        "2026-11-03",
        MEAL_ID,
        compliance({ outcome: "modified", deviationKind: "logged_foods", notes: "Dal and rice" }),
      ),
    );
    api.request.mockResolvedValue(compliance());
    renderPage(mealPath(MEAL_ID));
    await screen.findByTestId("log-meal-food-list");
    expect((screen.getByRole("button", { name: "Skipped" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Dal, rice and curd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(api.request.mock.calls[0]![3].body).toEqual({
      outcome: "modified",
      deviationKind: "logged_foods",
      notes: "Dal, rice and curd",
      recordVersion: 2,
    });
  });

  it("a meal older than 7 days cannot be logged or edited", async () => {
    api.getMealAssignment.mockResolvedValue(meal("2026-10-27", OLD_MEAL_ID));
    renderPage(mealPath(OLD_MEAL_ID));
    const limit = await screen.findByTestId("log-meal-date-limit");
    expect(limit.textContent).toContain("Tue 27 Oct");
    expect(limit.textContent).toContain("Wed 28 Oct is the earliest");
    expect(screen.queryByRole("button", { name: "Save meal" })).toBeNull();
  });

  it("an ended client has no log or edit and nothing is fetched", async () => {
    renderPage(mealPath(MEAL_ID), { ended: true });
    expect(await screen.findByTestId("log-meal-ended")).toBeTruthy();
    expect(screen.getByText("Coaching with Vikram has ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save meal" })).toBeNull();
    expect(api.getMealAssignment).not.toHaveBeenCalled();
  });
});

describe("trainer log measurement", () => {
  it("logs a weight with one key; today is stamped now, an earlier day at noon", async () => {
    api.createMeasurement.mockResolvedValue(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement`);
    expect(await screen.findByRole("heading", { name: "Log measurement" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Mon 2 Nov" }));
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalledTimes(1));
    const [rel, body, key] = api.createMeasurement.mock.calls[0]!;
    expect(rel).toBe(REL);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ type: "body_weight_kg", value: 71.8, unit: "kg" });
    expect(new Date(body.observedAt).toISOString().slice(0, 10)).toBe("2026-11-02");
    expect((await screen.findByTestId("where")).textContent).toBe(`/clients/${REL}/progress`);
  });

  it("a waist is stored in cm", async () => {
    api.createMeasurement.mockResolvedValue(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement`);
    await screen.findByRole("heading", { name: "Log measurement" });
    fireEvent.click(screen.getByRole("button", { name: "Waist" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "84" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalledTimes(1));
    expect(api.createMeasurement.mock.calls[0]![1]).toMatchObject({
      type: "waist_cm",
      value: 84,
      unit: "cm",
    });
  });

  it.each(["0", "-3", "abc", "1001", "70.123", ""])(
    "refuses %j: only a value above 0 is sent",
    async (text) => {
      renderPage(`/clients/${REL}/log-entry/measurement`);
      await screen.findByRole("heading", { name: "Log measurement" });
      fireEvent.change(screen.getByLabelText("Value"), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
      expect(await screen.findByTestId("log-measurement-problem")).toBeTruthy();
      expect(api.createMeasurement).not.toHaveBeenCalled();
    },
  );

  it("retry after a network failure resends the same key AND the same observedAt, even later", async () => {
    api.createMeasurement
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement`);
    await screen.findByRole("heading", { name: "Log measurement" });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    const banner = await screen.findByTestId("log-measurement-not-saved");
    expect(banner.textContent).toContain("We couldn’t reach FitBud, so nothing was saved.");
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("71.8");

    // Today's stamp is "now": a rebuilt body would carry a later instant.
    vi.setSystemTime(new Date(NOW.getTime() + 90_000));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalledTimes(2));
    const [, firstBody, firstKey] = api.createMeasurement.mock.calls[0]!;
    const [, secondBody, secondKey] = api.createMeasurement.mock.calls[1]!;
    expect(secondKey).toBe(firstKey);
    expect(secondBody).toEqual(firstBody);
    expect(secondBody.observedAt).toBe(NOW.toISOString());
  });

  it("changing the value after a failure is a new logical save with a new key", async () => {
    api.createMeasurement
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement`);
    await screen.findByRole("heading", { name: "Log measurement" });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await screen.findByTestId("log-measurement-not-saved");
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalledTimes(2));
    expect(api.createMeasurement.mock.calls[1]![2]).not.toBe(api.createMeasurement.mock.calls[0]![2]);
    expect(api.createMeasurement.mock.calls[1]![1].value).toBe(71.6);
  });

  it("a server error with a code is shown as the API's own message, not as a connection problem", async () => {
    api.createMeasurement.mockRejectedValueOnce(
      new ApiClientError({ code: "BACKDATE_LIMIT", message: "You can log up to 7 days back.", status: 422, requestId: "r2" }),
    );
    renderPage(`/clients/${REL}/log-entry/measurement`);
    await screen.findByRole("heading", { name: "Log measurement" });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    const banner = await screen.findByTestId("log-measurement-not-saved");
    expect(banner.textContent).toContain("You can log up to 7 days back.");
    expect(banner.textContent).not.toContain("reach FitBud");
  });

  it("edit: shows the tag, sends only what changed with the recordVersion, then returns to progress", async () => {
    api.request.mockResolvedValue(measurement({ value: 71.9, recordVersion: 4 }));
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    expect(await screen.findByRole("heading", { name: "Edit measurement" })).toBeTruthy();
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("72.4");
    expect((screen.getByRole("button", { name: "Save measurement" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    const [method, path, , options] = api.request.mock.calls[0]!;
    expect(method).toBe("PATCH");
    expect(path).toBe(`/progress/measurements/${MEASURE_ID}`);
    expect(options.body).toEqual({ recordVersion: 3, value: 71.9 });
    expect((await screen.findByTestId("where")).textContent).toBe(`/clients/${REL}/progress`);
  });

  it("edit conflict: Reload refetches the entry and the next save uses the new version", async () => {
    api.listMeasurements
      .mockResolvedValueOnce({ items: [measurement()], nextCursor: null })
      .mockResolvedValueOnce({
        items: [measurement({ value: 73, recordVersion: 4, lastEditedByRole: "coach" })],
        nextCursor: null,
      });
    api.request
      .mockRejectedValueOnce(
        new ApiClientError({ code: "VERSION_CONFLICT", message: "This measurement changed since it was opened. Reload and try again.", status: 409, requestId: "r3" }),
      )
      .mockResolvedValueOnce(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    await screen.findByRole("heading", { name: "Edit measurement" });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "71.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await screen.findByTestId("log-measurement-not-saved");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(api.listMeasurements).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("73"),
    );
    expect(api.request).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "72.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(api.request.mock.calls[1]![3].body).toEqual({ recordVersion: 4, value: 72.5 });
  });

  it("moving the date sends observedAt; a measurement older than 7 days cannot be edited", async () => {
    api.request.mockResolvedValue(measurement());
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    await screen.findByRole("heading", { name: "Edit measurement" });
    fireEvent.click(screen.getByRole("button", { name: "Tue 3 Nov" }));
    fireEvent.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    const body = api.request.mock.calls[0]![3].body;
    expect(body.value).toBeUndefined();
    expect(new Date(body.observedAt).toISOString().slice(0, 10)).toBe("2026-11-03");
    cleanup();

    api.listMeasurements.mockResolvedValue({
      items: [measurement({ observedAt: "2026-10-25T05:00:00.000Z" })],
      nextCursor: null,
    });
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    const limit = await screen.findByTestId("log-measurement-date-limit");
    expect(limit.textContent).toContain("Sun 25 Oct");
    expect(screen.queryByRole("button", { name: "Save measurement" })).toBeNull();
  });

  it("a check-in measurement is not editable", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [measurement({ source: "checkin", checkinId: id(90) })],
      nextCursor: null,
    });
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    expect(await screen.findByTestId("log-measurement-checkin")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save measurement" })).toBeNull();
  });

  it("tags a coach-edited entry and ended clients have no log or edit", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [measurement({ lastEditedByRole: "coach", updatedAt: "2026-11-03T06:00:00.000Z" })],
      nextCursor: null,
    });
    renderPage(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    expect((await screen.findByTestId("log-measurement-tag")).textContent).toBe(
      "Edited by coach · Tue 3 Nov",
    );
    cleanup();

    renderPage(`/clients/${REL}/log-entry/measurement`, { ended: true });
    expect(await screen.findByTestId("log-measurement-ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save measurement" })).toBeNull();
  });
});

describe("entry points", () => {
  function inRouter(ui: React.ReactNode, ended = false) {
    return render(
      <MemoryRouter initialEntries={[`/clients/${REL}/activity`]}>
        <Routes>
          <Route
            path="/clients/:relationshipId"
            element={<Outlet context={{ ended, online: true }} />}
          >
            <Route path="activity" element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("meal panel: Log meal on an unlogged recent meal, Edit meal on a logged one, nothing when ended or too old", () => {
    inRouter(<MealPanel assignment={meal("2026-11-03", MEAL_ID)} clientTimezone="Asia/Kolkata" />);
    expect(screen.getByRole("link", { name: "Log meal" }).getAttribute("href")).toBe(
      `/clients/${REL}/log-entry/meal/${MEAL_ID}`,
    );
    cleanup();

    inRouter(
      <MealPanel
        assignment={meal("2026-11-03", MEAL_ID, compliance({ loggedByRole: "coach" }))}
        clientTimezone="Asia/Kolkata"
      />,
    );
    expect(screen.getByRole("link", { name: "Edit meal" })).toBeTruthy();
    expect(screen.getByTestId("meal-coach-tag").textContent).toBe("Logged by coach");
    cleanup();

    inRouter(<MealPanel assignment={meal("2026-11-03", MEAL_ID)} clientTimezone="Asia/Kolkata" />, true);
    expect(screen.queryByRole("link", { name: /meal/i })).toBeNull();
    cleanup();

    inRouter(<MealPanel assignment={meal("2026-10-20", MEAL_ID)} clientTimezone="Asia/Kolkata" />);
    expect(screen.queryByRole("link", { name: /meal/i })).toBeNull();
  });

  it("progress panel: Log measurement, Edit only on recent non-check-in entries, none when ended", async () => {
    api.listMeasurements.mockResolvedValue({
      items: [
        measurement({ lastEditedByRole: "coach" }),
        measurement({ id: id(22), observedAt: "2026-10-20T05:00:00.000Z" }),
        measurement({ id: id(23), source: "checkin", checkinId: id(90) }),
      ],
      nextCursor: null,
    });
    inRouter(<ProgressPanel relationshipId={REL} clientTimezone="Asia/Kolkata" ended={false} />);
    expect((await screen.findAllByText(/Body weight · 72.4 kg/, { selector: "strong" })).length).toBe(3);
    expect(screen.getByRole("link", { name: "Log measurement" })).toBeTruthy();
    const edits = screen.getAllByRole("link", { name: /^Edit / });
    expect(edits).toHaveLength(1);
    expect(edits[0]!.getAttribute("href")).toBe(`/clients/${REL}/log-entry/measurement/${MEASURE_ID}`);
    expect(screen.getByText(/Edited by coach/)).toBeTruthy();
    cleanup();

    inRouter(<ProgressPanel relationshipId={REL} clientTimezone="Asia/Kolkata" ended />);
    await screen.findAllByText(/Body weight · 72.4 kg/, { selector: "strong" });
    expect(screen.queryByRole("link", { name: "Log measurement" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
  });
});
