/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiClientError } from "@fitbud/api-client";
import type { ResponsivenessResponse } from "@fitbud/contracts";

const REL_ID = "c422296e-ed7b-4196-a2b4-647096af3002";

const stage1 = vi.hoisted(() => ({ getResponsiveness: vi.fn() }));
vi.mock("../../lib/stage1-api", () => ({ stage1Api: stage1 }));
const api = vi.hoisted(() => ({ getReminderRules: vi.fn(), saveReminderRules: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../lib/config", () => ({
  useConfig: () => ({ config: null, loading: false, error: null }),
  isWhatsAppAutomationEnabled: () => false,
}));

import { RemindersSection } from "./RemindersSection";

const COUNTS = { sent: 6, opened: 4, loggedAfter: 3, loggedOnOwn: 2, notLogged: 1, suppressed: 0 };
const DATA: ResponsivenessResponse = {
  label: "responds",
  counts: { sent: 6, opened: 4, loggedAfter: 3, loggedBefore: 2 },
  categories: { workouts: COUNTS, meals: { ...COUNTS, opened: null }, checkins: COUNTS },
  pushEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  preferredWorkoutTime: "19:00",
  preferredWorkoutTimeSource: "set",
};

function renderSection({ ended = false, onToast = vi.fn(), onEndedElsewhere = vi.fn() } = {}) {
  stage1.getResponsiveness.mockResolvedValue(DATA);
  api.getReminderRules.mockResolvedValue({
    items: [
      { reminderType: "workout_reminder", enabled: true },
      { reminderType: "meal_reminder", enabled: false },
      { reminderType: "checkin_reminder", enabled: true },
    ],
  });
  render(
    <RemindersSection
      relationshipId={REL_ID}
      firstName="Rohan"
      gender="male"
      ended={ended}
      online
      refreshEpoch={0}
      onToast={onToast}
      onEndedElsewhere={onEndedElsewhere}
    />,
  );
  return { onToast, onEndedElsewhere };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings › Reminders (W13-10, frame W-181; was the Reminders drawer)", () => {
  it("shows the facts the drawer showed: label, 14-day counts, per category, quiet hours, workout time, footnote", async () => {
    renderSection();
    const summary = await screen.findByTestId("cs-reminders-summary");
    expect(within(summary).getByText("Responds to reminders")).toBeTruthy();
    expect(within(summary).getByText("Logged 3 of 6 after a reminder · 4 opened")).toBeTruthy();
    expect(screen.getByTestId("cs-reminder-row-workouts").textContent).toContain(
      "6 sent · 4 opened · 3 logged after · 2 logged on own · 1 not logged",
    );
    // Opened is not tracked for meals: left out, never shown as 0.
    expect(screen.getByTestId("cs-reminder-row-meals").textContent).not.toContain("opened");
    expect(screen.getByText("10:00 pm – 7:00 am")).toBeTruthy();
    expect(screen.getByText("7:00 pm · set by Rohan")).toBeTruthy();
    expect(screen.getByText(/Reminders are timed by FitBud/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/nudg|%/i);
  });

  it.each(["female", "male", null])("footnote names Rohan and no pronoun for gender %s (D-W14-37)", async (gender) => {
    stage1.getResponsiveness.mockResolvedValue(DATA);
    api.getReminderRules.mockResolvedValue({ items: [] });
    render(
      <RemindersSection
        relationshipId={REL_ID}
        firstName="Rohan"
        gender={gender}
        ended={false}
        online
        refreshEpoch={0}
        onToast={vi.fn()}
        onEndedElsewhere={vi.fn()}
      />,
    );
    const note = await screen.findByText(/Reminders are timed by FitBud/);
    expect(note.textContent).toContain("never in Rohan's quiet hours. Rohan controls the notification settings.");
    expect(note.textContent).not.toMatch(/\b(he|she|his|her|hers|him)\b/i);
  });

  it("each switch saves its one rule, as Coaching setup did", async () => {
    const { onToast } = renderSection();
    await waitFor(() => expect(api.getReminderRules).toHaveBeenCalled());
    const meals = await screen.findByRole("switch", { name: "Meals" });
    await waitFor(() => expect(meals.getAttribute("aria-checked")).toBe("false"));
    api.saveReminderRules.mockResolvedValue({
      items: [{ reminderType: "meal_reminder", enabled: true }],
    });
    fireEvent.click(meals);
    await waitFor(() =>
      expect(api.saveReminderRules).toHaveBeenCalledWith(REL_ID, {
        rules: [{ reminderType: "meal_reminder", enabled: true }],
      }),
    );
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("Meals reminders on"));
    expect(meals.getAttribute("aria-checked")).toBe("true");
  });

  it("a switch refused with 409 RELATIONSHIP_ENDED reverts and reports the ended state", async () => {
    const { onEndedElsewhere, onToast } = renderSection();
    const workouts = await screen.findByRole("switch", { name: "Workouts" });
    await waitFor(() => expect(workouts.getAttribute("aria-checked")).toBe("true"));
    api.saveReminderRules.mockRejectedValue(
      new ApiClientError({
        code: "RELATIONSHIP_ENDED",
        message: "Coaching relationship has ended.",
        requestId: "req-2",
        status: 409,
      }),
    );
    fireEvent.click(workouts);
    await waitFor(() => expect(onEndedElsewhere).toHaveBeenCalled());
    expect(workouts.getAttribute("aria-checked")).toBe("true");
    expect(onToast).not.toHaveBeenCalled();
  });

  it("ended client: read-only, no switches, reminders are off", async () => {
    renderSection({ ended: true });
    await screen.findByTestId("cs-reminders-summary");
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByText("Reminders are off while coaching is ended.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Open WhatsApp/ })).toBeNull();
  });
});
