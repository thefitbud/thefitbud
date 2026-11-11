/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import {
  formatCivilDate,
  formatRelative,
  GLOBAL_CHECKIN_FORM_VERSION_ID,
} from "@fitbud/core";

const REL_ID = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  getCoachingConfiguration: vi.fn(),
  getSubscription: vi.fn(),
  getEffectivePlan: vi.fn(),
  getReminderRules: vi.fn(),
  getOnboardingResponse: vi.fn(),
  listCheckinFormTemplates: vi.fn(),
  getPlanConsistency: vi.fn(),
  getResponsiveness: vi.fn(),
  getClientSteps: vi.fn(),
  // mutations: must never be called just by rendering the page
  saveConfigurationDraft: vi.fn(),
  configureConfiguration: vi.fn(),
  activateConfiguration: vi.fn(),
  createConfigurationVersion: vi.fn(),
  discardConfigurationDraft: vi.fn(),
  saveSubscription: vi.fn(),
  saveReminderRules: vi.fn(),
  assignPreferredCheckinForm: vi.fn(),
  acknowledgePlanConsistency: vi.fn(),
  putClientStepsTarget: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiClient: {
    getCoachingConfiguration: api.getCoachingConfiguration,
    getSubscription: api.getSubscription,
    getEffectivePlan: api.getEffectivePlan,
    getReminderRules: api.getReminderRules,
    getOnboardingResponse: api.getOnboardingResponse,
    listCheckinFormTemplates: api.listCheckinFormTemplates,
    getPlanConsistency: api.getPlanConsistency,
    saveConfigurationDraft: api.saveConfigurationDraft,
    configureConfiguration: api.configureConfiguration,
    activateConfiguration: api.activateConfiguration,
    createConfigurationVersion: api.createConfigurationVersion,
    discardConfigurationDraft: api.discardConfigurationDraft,
    saveSubscription: api.saveSubscription,
    saveReminderRules: api.saveReminderRules,
    assignPreferredCheckinForm: api.assignPreferredCheckinForm,
    acknowledgePlanConsistency: api.acknowledgePlanConsistency,
    getClientSteps: api.getClientSteps,
    putClientStepsTarget: api.putClientStepsTarget,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));
vi.mock("../lib/config", () => ({
  useConfig: () => ({ config: null }),
  isWhatsAppAutomationEnabled: () => false,
}));

import { ApiClientError } from "@fitbud/api-client";
import { ConfigureCoachingPage } from "./ConfigureCoachingPage";

type ConfigStatus = "draft" | "active";
type Onboarding = "ended" | "active" | "coaching_ready";

function configuration(status: ConfigStatus, goalShort: string | null = "Postpartum strength return") {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    coachingRelationshipId: REL_ID,
    status,
    versionNumber: 1,
    recordVersion: 3,
    goalShort,
    goalDescription: "Rebuild core and lower-body strength.",
    notes: null,
    workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
    nutrition: {
      mealsPerDay: 4,
      confirmationWindowHours: 12,
      photoRequirement: "none",
    },
    checkin: { cadence: "weekly", dueWindowHours: 48, formVersionId: null },
    tracking: {
      requireBodyWeight: true,
      requireProgressPhotos: false,
      requireSessionRpe: false,
    },
    configuredAt: null,
    activatedAt: status === "active" ? "2026-07-06T04:00:00.000Z" : null,
    createdAt: "2026-07-06T04:00:00.000Z",
    updatedAt: "2026-07-06T04:00:00.000Z",
  };
}

function renderPage(
  onboardingStatus: Onboarding,
  status: ConfigStatus,
  config = configuration(status),
  options: {
    displayName?: string;
    endedAt?: string | null;
    pendingReactivation?: {
      requestId: string;
      expiresAt: string;
      sentAt?: string;
      intakeUpdateRequested: boolean;
    } | null;
    gender?: string;
  } = {},
) {
  api.getCoachingConfiguration.mockResolvedValue(config);
  const context = {
    workspace: {
      header: {
        traineeDisplayName: options.displayName ?? "Kavya Menon",
        traineeProfile: { gender: options.gender ?? "female" },
        onboardingStatus,
        clientWhatsappE164: null,
        hasCustomMealTimes: false,
        traineeTimezone: "Asia/Kolkata",
        endedAt: options.endedAt ?? null,
        pendingReactivation: options.pendingReactivation ?? null,
      },
    },
    workspaceLoading: false,
    workspaceError: null,
    notFound: false,
    refreshEpoch: 0,
    reloadWorkspace: () => {},
    openWorkspaceModal: () => {},
    relationshipId: REL_ID,
    online: true,
    ended: onboardingStatus === "ended",
  };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL_ID}/configure`]}>
      <Routes>
        <Route
          path="/clients/:relationshipId"
          element={<Outlet context={context} />}
        >
          <Route path="configure" element={<ConfigureCoachingPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Every data control on the page (inputs, selects, textareas, buttons). */
function controls(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >("input, select, textarea, button"),
  );
}
const describeControl = (el: Element) =>
  `${el.tagName.toLowerCase()}[${el.getAttribute("name") ?? el.closest("label")?.querySelector("span")?.textContent ?? el.textContent}]`;

/**
 * Choose an option the way a person can (user-event `selectOptions` rules):
 * a disabled select, or one inside a disabled fieldset, cannot be changed, so
 * this throws instead of faking a change event on it (D-W8-5).
 */
function chooseOption(select: HTMLSelectElement, value: string) {
  if (select.disabled || select.closest("fieldset[disabled]")) {
    throw new Error(`select[${select.name}] is disabled; a trainer cannot change it`);
  }
  if (!Array.from(select.options).some((o) => o.value === value)) {
    throw new Error(`select[${select.name}] has no option ${value}`);
  }
  select.focus();
  fireEvent.change(select, { target: { value } });
}

const selectNamed = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;

/** The steps target arrives after the configuration (own request). */
async function stepsLoaded(container: HTMLElement) {
  await waitFor(() => expect(selectNamed(container, "stepsTarget").disabled).toBe(false));
}

const SAVE_ACTIONS = [
  "Save draft",
  "Mark configured",
  "Activate",
  "Create new version",
  "Save subscription",
];

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getSubscription.mockResolvedValue({
    planName: "Monthly coaching",
    paymentFrequency: "monthly",
    startsOn: "2026-07-06",
    renewsOn: "2026-11-17",
  });
  api.getEffectivePlan.mockResolvedValue({ plan: null, version: null });
  api.getReminderRules.mockResolvedValue({
    items: [
      { reminderType: "workout_reminder", enabled: true },
      { reminderType: "meal_reminder", enabled: true },
      { reminderType: "checkin_reminder", enabled: true },
    ],
  });
  api.getOnboardingResponse.mockResolvedValue({ status: "submitted", answers: {} });
  api.listCheckinFormTemplates.mockResolvedValue({ items: [] });
  api.getResponsiveness.mockResolvedValue({ label: "responsive", pushEnabled: true });
  api.getClientSteps.mockResolvedValue({
    relationshipId: REL_ID,
    target: 8000,
    from: "2026-07-01",
    to: "2026-07-07",
    days: [],
  });
});

afterEach(() => cleanup());

describe("ConfigureCoachingPage on an ended relationship (CE1)", () => {
  it("shows plain read-only values, not greyed inputs (Z7-13, frame 179 / DS7)", async () => {
    const { container } = renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    // No input boxes at all: no inputs, selects, textareas or switches.
    expect(
      container.querySelectorAll("input, select, textarea, [role=switch]"),
    ).toHaveLength(0);
    // Nothing greyed: greyed controls are only for briefly unavailable ones.
    expect(container.querySelector("[disabled]")).toBeNull();
    expect(screen.getByTestId("configure-readonly")).toBeTruthy();
  });

  it("names every value by its label alone: no counters, no doubled date parts", async () => {
    renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    const names = screen
      .getAllByRole("definition")
      .map((el) => el.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id ?? "")?.textContent);
    expect(names).toEqual([
      "Short goal",
      "Goal description",
      "Workouts",
      "Meals",
      "Check-ins",
      "Reminders",
      "Tracking",
      "Subscription",
      "Starts on",
      "Due on",
    ]);
    for (const name of names) {
      expect(name).not.toMatch(/\d+\/\d+/);
      expect(name).not.toMatch(/(\b\w+\b) \1/);
    }
    const value = (name: string) =>
      screen.getByRole("definition", { name }).textContent;
    expect(value("Short goal")).toBe("Postpartum strength return");
    expect(value("Goal description")).toBe(
      "Rebuild core and lower-body strength.",
    );
    expect(value("Workouts")).toBe("3 a week · log within 24 h");
    expect(value("Check-ins")).toBe(
      "Weekly · 48 h window · FitBud weekly check-in",
    );
    expect(value("Reminders")).toBe("Off while coaching is ended");
    expect(value("Tracking")).toBe("Weight");
    expect(value("Subscription")).toBe("Monthly coaching · Monthly");
  });

  it("dates read like 'Wed 21 Oct', never numeric or ISO", async () => {
    const { container } = renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    expect(screen.getByRole("definition", { name: "Starts on" }).textContent).toBe(
      formatCivilDate("2026-07-06"),
    );
    expect(screen.getByRole("definition", { name: "Due on" }).textContent).toBe(
      formatCivilDate("2026-11-17"),
    );
    expect(formatCivilDate("2026-11-17")).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    expect(text).not.toContain("Renews on");
  });

  it("offers no save, configure or activate actions", async () => {
    renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    for (const name of SAVE_ACTIONS) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    for (const fn of [
      api.saveConfigurationDraft,
      api.configureConfiguration,
      api.activateConfiguration,
      api.createConfigurationVersion,
      api.saveSubscription,
      api.saveReminderRules,
      api.assignPreferredCheckinForm,
      api.acknowledgePlanConsistency,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("shows the ended title and status, not 'This version is active'", async () => {
    const { container } = renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    expect(container.textContent).not.toContain("This version is active");
    expect(screen.getByTestId("configure-status-pill").textContent).toContain(
      "Ended",
    );
    expect(
      screen.getByText(
        "Coaching with Kavya has ended. This is the setup you last used.",
      ),
    ).toBeTruthy();
  });
});

describe("ConfigureCoachingPage on current clients (unchanged by CE1)", () => {
  it("active version: fields stay editable, the banner says what a save does, nothing to save yet", async () => {
    const { container } = renderPage("active", "active");
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(screen.getByTestId("configure-active-banner").textContent).toBe(
      "Version 1 is active. Edits to goal, expectations, check-in window and tracking are saved as version 2, with new targets from tomorrow. The steps target and check-in form change straight away.",
    );
    expect(container.textContent).not.toContain("Create a new version to change it");
    expect(container.textContent).not.toContain("has ended");
    expect(screen.queryByRole("button", { name: "Create new version" })).toBeNull();
    // Z8-6: the first edit opens v2, so every target is editable on screen.
    const byName = (n: string) =>
      container.querySelector<HTMLInputElement>(`[name="${n}"]`)!;
    expect(byName("goalShort").disabled).toBe(false);
    expect(byName("sessionsPerWeek").disabled).toBe(false);
    expect(byName("dueWindowHours").disabled).toBe(false);
    expect(byName("checkinForm").disabled).toBe(false);
    await stepsLoaded(container);
    expect(container.querySelector('[name="planName"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Save subscription" })).toBeNull();
    const switches = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[role="switch"]'),
    );
    expect(switches.map((s) => s.disabled)).toEqual([
      false, false, false, // tracking (saved as v2)
      false, false, false, // automatic reminders
    ]);
    // Frame 149 footer: Active · v1, Discard and Save as v2 wait for an edit.
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Active · v1");
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "Edit a section to start v2.",
    );
    const discard = screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement;
    const save = screen.getByRole("button", { name: "Save as v2" }) as HTMLButtonElement;
    expect(discard.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Activate" })).toBeNull();
  });

  it("draft: every field and both save actions are enabled, no banner", async () => {
    const { container } = renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    await stepsLoaded(container);
    const disabledFields = controls(container)
      .filter((el) => el.tagName !== "BUTTON" && el.disabled)
      .map(describeControl);
    expect(disabledFields).toEqual([]);
    const disabledButtons = controls(container)
      .filter((el) => el.tagName === "BUTTON" && el.disabled)
      .map((el) => el.textContent);
    // Only the WhatsApp shortcut (no number in this fixture) is disabled.
    expect(disabledButtons).toEqual(["Open WhatsApp"]);
    expect(container.textContent).not.toContain("is active.");
    expect(container.textContent).not.toContain("has ended");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activate" })).toBeTruthy();
    expect(screen.queryByTestId("configure-readonly")).toBeNull();
  });
});

describe("ConfigureCoachingPage first activation (Z8-6, frame 148, DS3)", () => {
  it("a complete draft offers Save draft and Activate, never Mark configured", async () => {
    renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(screen.queryByRole("button", { name: "Mark configured" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    const activate = screen.getByRole("button", { name: "Activate" });
    expect((activate as HTMLButtonElement).disabled).toBe(false);
    expect(activate.className).toContain("primary");
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Draft");
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "Every section is done. Activate to start coaching.",
    );
  });

  it("Activate stays disabled while D17 sections are left, and names them", async () => {
    renderPage("active", "draft", configuration("draft", null));
    await screen.findByRole("heading", { name: "Coaching setup" });
    const activate = screen.getByRole("button", { name: "Activate" }) as HTMLButtonElement;
    expect(activate.disabled).toBe(true);
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "1 section left: Goal",
    );
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
  });

  it("before anything is saved, every To do section is left", async () => {
    renderPage("coaching_ready", "draft", null as never);
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "4 sections left: Goal, Expectations, Check-ins, Tracking",
    );
    expect(
      (screen.getByRole("button", { name: "Activate" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Activate opens the DS3 confirmation first: nothing is sent until it is confirmed", async () => {
    renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog", { name: "Start coaching Kavya?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const rows = Array.from(dialog.querySelectorAll("dt")).map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(rows.map(([label]) => label)).toEqual([
      "Start date",
      "Workouts",
      "Meals",
      "Check-ins",
      "Tracking",
      "Reminders",
      "Steps target",
      "Plan",
    ]);
    const value = (label: string) => rows.find(([l]) => l === label)?.[1];
    expect(value("Start date")).toMatch(/^Today · (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/);
    expect(value("Workouts")).toBe("3 a week");
    expect(value("Meals")).toBe("4 a day · log within 12 h");
    expect(value("Check-ins")).toBe("Weekly · 48 h window · FitBud weekly check-in");
    expect(value("Reminders")).toBe("Workouts, meals and check-ins");
    expect(value("Steps target")).toBe("8,000 a day");
    expect(value("Plan")).toBe("Nothing scheduled until a plan is published");
    expect(dialog.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(api.activateConfiguration).not.toHaveBeenCalled();
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();

    // Back to setup closes it without a call; Escape does too.
    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.activateConfiguration).not.toHaveBeenCalled();
  });

  it("confirming an unchanged draft is one activate call, with plan-aware copy (no plan)", async () => {
    const draft = configuration("draft");
    api.activateConfiguration.mockResolvedValue({
      ...draft,
      status: "active",
      recordVersion: 4,
      activatedAt: "2026-07-07T04:00:00.000Z",
    });
    renderPage("active", "draft", draft);
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate coaching" }));
    await waitFor(() => expect(api.activateConfiguration).toHaveBeenCalledTimes(1));
    expect(api.activateConfiguration.mock.calls[0]![0]).toBe(REL_ID);
    expect(api.activateConfiguration.mock.calls[0]![1]).toEqual({ expectedVersion: 3 });
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
    expect(api.configureConfiguration).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Coaching with Kavya is active. Nothing is scheduled until you publish a plan.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Active · v1");
  });

  it("unsaved edits are saved into the draft first, then one activate call; a published plan is named", async () => {
    api.getEffectivePlan.mockResolvedValue({
      plan: {
        id: "77777777-7777-4777-8777-777777777777",
        coachingRelationshipId: REL_ID,
        title: "Strength return, phase 1",
        createdAt: "2026-07-06T04:00:00.000Z",
        updatedAt: "2026-07-06T04:00:00.000Z",
      },
      version: {
        id: "88888888-8888-4888-8888-888888888888",
        content: { workoutDays: [], mealPrescriptions: [] },
      },
    });
    api.getPlanConsistency.mockResolvedValue({ acknowledged: false, fingerprint: "x" });
    const draft = configuration("draft");
    const saved = { ...draft, recordVersion: 4, workout: { ...draft.workout, sessionsPerWeek: 4 } };
    api.saveConfigurationDraft.mockResolvedValue(saved);
    api.activateConfiguration.mockResolvedValue({
      ...saved,
      status: "active",
      recordVersion: 5,
      activatedAt: "2026-07-07T04:00:00.000Z",
    });
    const { container } = renderPage("active", "draft", draft);
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "sessionsPerWeek"), "4");
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("4 a week · Strength return, phase 1");
    expect(dialog.textContent).toContain("Published · Strength return, phase 1");
    fireEvent.click(screen.getByRole("button", { name: "Activate coaching" }));
    await waitFor(() => expect(api.activateConfiguration).toHaveBeenCalledTimes(1));
    expect(api.saveConfigurationDraft).toHaveBeenCalledTimes(1);
    expect(api.saveConfigurationDraft.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 3,
      workout: { sessionsPerWeek: 4 },
    });
    expect(api.activateConfiguration.mock.calls[0]![1]).toEqual({ expectedVersion: 4 });
    expect(api.saveConfigurationDraft.mock.invocationCallOrder[0]!).toBeLessThan(
      api.activateConfiguration.mock.invocationCallOrder[0]!,
    );
    expect(
      await screen.findByText(
        "Coaching with Kavya is active. Kavya starts today on Strength return, phase 1.",
      ),
    ).toBeTruthy();
  });

  it("a refused activation keeps the draft and the dialog, and says why", async () => {
    api.activateConfiguration.mockRejectedValue(
      new ApiClientError({
        code: "CONFIGURATION_INCOMPLETE",
        message: "Complete every required section before activating.",
        requestId: "req-1",
        status: 409,
      }),
    );
    renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate coaching" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.querySelector("[role=alert]")?.textContent).toBe(
        "Complete every required section before activating.",
      ),
    );
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Draft");
    expect(api.discardConfigurationDraft).not.toHaveBeenCalled();
  });

  it("a failure that is not an API error does not blame a cause it did not check", async () => {
    api.activateConfiguration.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate coaching" }));
    expect(
      await screen.findByText("Could not activate coaching. The draft is kept."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("Failed to fetch");
  });
});

describe("ConfigureCoachingPage Save as vN+1 (Z8-6, frame 149, DS3)", () => {
  function activeV2() {
    return { ...configuration("active"), versionNumber: 2, recordVersion: 6 };
  }

  it("the first edit opens v3: footer hint, Editing badge on the owning section only", async () => {
    const { container } = renderPage("active", "active", activeV2());
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "sessionsPerWeek"), "4");
    expect(screen.getByTestId("configure-footer-hint").textContent).toMatch(
      /^Saving creates v3 from tomorrow, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\. Today stays on v2\.$/,
    );
    expect(
      (screen.getByRole("button", { name: "Save as v3" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("the dialog lists the changes only, starts tomorrow, then creates, saves and activates v3", async () => {
    const active = activeV2();
    const created = {
      ...active,
      id: "99999999-9999-4999-8999-999999999999",
      status: "draft",
      versionNumber: 3,
      recordVersion: 0,
      activatedAt: null,
    };
    const saved = {
      ...created,
      recordVersion: 1,
      workout: { ...created.workout, sessionsPerWeek: 4 },
      tracking: { ...created.tracking, requireProgressPhotos: true },
    };
    api.createConfigurationVersion.mockResolvedValue(created);
    api.saveConfigurationDraft.mockResolvedValue(saved);
    api.activateConfiguration.mockResolvedValue({
      ...saved,
      status: "active",
      recordVersion: 2,
      activatedAt: "2026-07-08T04:00:00.000Z",
    });
    const { container } = renderPage("active", "active", active);
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "sessionsPerWeek"), "4");
    const photos = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[role="switch"]'),
    )[1]!;
    fireEvent.click(photos);
    fireEvent.click(screen.getByRole("button", { name: "Save as v3" }));
    const dialog = await screen.findByRole("dialog", { name: "Save as version 3?" });
    expect(dialog.textContent).toContain("Version 2 is kept as it was.");
    expect(dialog.textContent).toContain("What changes · 2");
    const items = Array.from(dialog.querySelectorAll("li")).map((li) => li.textContent);
    expect(items).toEqual([
      "Workoutsfrom 3 a weekto 4 a week",
      "Progress photosfrom Not requiredto Required",
    ]);
    expect(dialog.textContent).toMatch(/Tomorrow · (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/);
    expect(dialog.textContent).toContain("Today's plan stays as it is.");
    expect(api.createConfigurationVersion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save as version 3" }));
    await waitFor(() => expect(api.activateConfiguration).toHaveBeenCalledTimes(1));
    expect(api.createConfigurationVersion.mock.calls[0]![1]).toEqual({ expectedVersion: 6 });
    expect(api.saveConfigurationDraft.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 0,
      workout: { sessionsPerWeek: 4 },
      tracking: { requireProgressPhotos: true },
    });
    expect(api.activateConfiguration.mock.calls[0]![1]).toEqual({ expectedVersion: 1 });
    expect(api.createConfigurationVersion.mock.invocationCallOrder[0]!).toBeLessThan(
      api.saveConfigurationDraft.mock.invocationCallOrder[0]!,
    );
    expect(api.saveConfigurationDraft.mock.invocationCallOrder[0]!).toBeLessThan(
      api.activateConfiguration.mock.invocationCallOrder[0]!,
    );
    // The form was assigned when it was picked; the save does not re-assign it.
    expect(api.assignPreferredCheckinForm).not.toHaveBeenCalled();
    expect(api.discardConfigurationDraft).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        /^Version 3 saved\. New targets apply from tomorrow, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\.$/,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Active · v3");
  });

  it("a failed save after v3 was created discards v3, keeps v2 live and the edits on screen", async () => {
    const active = activeV2();
    const created = { ...active, status: "draft", versionNumber: 3, recordVersion: 0, activatedAt: null };
    api.createConfigurationVersion.mockResolvedValue(created);
    api.saveConfigurationDraft.mockResolvedValue({ ...created, recordVersion: 1 });
    api.activateConfiguration.mockRejectedValue(
      new ApiClientError({
        code: "CONFIGURATION_VERSION_CONFLICT",
        message: "Configuration was changed after this version was loaded.",
        requestId: "req-2",
        status: 409,
      }),
    );
    api.discardConfigurationDraft.mockResolvedValue(active);
    const { container } = renderPage("active", "active", active);
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "sessionsPerWeek"), "5");
    fireEvent.click(screen.getByRole("button", { name: "Save as v3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as version 3" }));
    expect(
      await screen.findByText("This setup changed elsewhere. Reload the page and try again."),
    ).toBeTruthy();
    expect(api.discardConfigurationDraft).toHaveBeenCalledWith(REL_ID, { expectedVersion: 1 });
    expect(selectNamed(container, "sessionsPerWeek").value).toBe("5");
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Active · v2");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Discard puts the active values back without a call", async () => {
    const { container } = renderPage("active", "active", activeV2());
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "sessionsPerWeek"), "6");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(selectNamed(container, "sessionsPerWeek").value).toBe("3");
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "Edit a section to start v3.",
    );
    expect(api.discardConfigurationDraft).not.toHaveBeenCalled();
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
  });

  it("a v3 draft saved earlier offers Discard (server) and Save as v3 (activate only)", async () => {
    const draft = { ...configuration("draft"), versionNumber: 3, recordVersion: 2 };
    api.activateConfiguration.mockResolvedValue({ ...draft, status: "active", recordVersion: 3 });
    renderPage("active", "draft", draft);
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(screen.getByTestId("configure-status-pill").textContent).toBe("Draft · v3");
    expect(screen.queryByRole("button", { name: "Activate" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save as v3" }));
    const dialog = await screen.findByRole("dialog", { name: "Save as version 3?" });
    expect(dialog.textContent).toContain(
      "Version 3 was saved as a draft earlier. Its changes from version 2 aren't listed here.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save as version 3" }));
    await waitFor(() => expect(api.activateConfiguration).toHaveBeenCalledTimes(1));
    expect(api.activateConfiguration.mock.calls[0]![1]).toEqual({ expectedVersion: 2 });
    expect(api.createConfigurationVersion).not.toHaveBeenCalled();
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
  });
});

const ENDED_AT = "2026-10-21T06:30:00.000Z";

function endedLede(firstName: string): string {
  return `Coaching with ${firstName} ended on ${formatCivilDate("2026-10-21")}. This is the setup you last used.`;
}

describe("ConfigureCoachingPage ended copy (Z7-11, D-W7-6)", () => {
  function liveWording(text: string) {
    expect(text).not.toMatch(/renew/i);
    expect(text).not.toContain("Open WhatsApp");
    expect(text).not.toMatch(/on for/i);
  }

  it("Kavya (ended): ended title, lede, and status, with no live wording", async () => {
    const { container } = renderPage("ended", "active", configuration("active"), {
      displayName: "Kavya Menon",
      endedAt: ENDED_AT,
    });
    expect(
      await screen.findByRole("heading", { name: "Coaching setup (ended)" }),
    ).toBeTruthy();
    expect(screen.getByText(endedLede("Kavya"))).toBeTruthy();
    expect(screen.getByTestId("configure-status-pill").textContent).toContain(
      "Ended",
    );
    expect(screen.queryByTestId("configure-pending-reactivation")).toBeNull();
    liveWording(container.textContent ?? "");
    expect(container.textContent).toContain("Monthly");
    expect(container.textContent).toContain("Due on");
    expect(container.textContent).toContain("Off while coaching is ended");
    expect(container.textContent).not.toContain("Configure coaching");
    expect(container.textContent).not.toContain("Set the baseline");
  });

  it("Nikhil (pending reactivation): waiting banner plus the ended copy", async () => {
    const sentAt = "2026-10-28T04:00:00.000Z";
    const { container } = renderPage("ended", "active", configuration("active"), {
      displayName: "Nikhil Kapoor",
      gender: "male",
      endedAt: ENDED_AT,
      pendingReactivation: {
        requestId: "88888888-8888-4888-8888-888888888888",
        expiresAt: "2026-11-28T04:00:00.000Z",
        sentAt,
        intakeUpdateRequested: false,
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Coaching setup (ended)" }),
    ).toBeTruthy();
    expect(screen.getByText(endedLede("Nikhil"))).toBeTruthy();
    expect(screen.getByTestId("configure-status-pill").textContent).toContain(
      "Ended",
    );
    expect(screen.getByTestId("configure-pending-reactivation").textContent).toBe(
      `Waiting for Nikhil to confirm · sent ${formatRelative(sentAt)}`,
    );
    liveWording(container.textContent ?? "");
  });

  it("Rohan (active): v3 header, Client settings banner, WhatsApp and reminder wording stay", async () => {
    const { container } = renderPage("active", "active", configuration("active"), {
      displayName: "Rohan Mehta",
      gender: "male",
    });
    expect(
      await screen.findByRole("heading", { name: "Coaching setup" }),
    ).toBeTruthy();
    expect(screen.getByTestId("configure-moved-banner").textContent).toContain(
      "Name, phone, age and subscription moved to Client settings. Coaching setup is only about how you coach Rohan.",
    );
    expect(
      screen.getByRole("link", { name: "Open client settings" }).getAttribute("href"),
    ).toBe(`/clients/${REL_ID}/settings`);
    expect(screen.getByRole("link", { name: "Plans" }).getAttribute("href")).toBe(
      `/clients/${REL_ID}/plan`,
    );
    expect(screen.getByTestId("configure-status-note").textContent).toBe(
      `Active since ${formatCivilDate("2026-07-06")} · v1`,
    );
    expect(screen.getByTestId("configure-status-pill").textContent).toContain(
      "Active",
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("Configure coaching");
    expect(text).not.toContain("Set the baseline");
    expect(text).not.toContain("renews");
    expect(text).not.toContain("Renews on");
    expect(text).not.toContain("Due on");
    expect(text).toContain("Open WhatsApp");
    expect(text).toContain("On for");
    expect(text).not.toContain("Coaching setup (ended)");
    expect(text).not.toContain("Waiting for");
    expect(screen.queryByTestId("configure-pending-reactivation")).toBeNull();
  });
});

describe("ConfigureCoachingPage check-in form pin (Z6-2c, D-W6-19)", () => {
  const NEWER_GLOBAL_VERSION_ID = "c1000001-0000-4000-8000-000000000013";
  const TRAINER_LATEST_VERSION_ID = "d2000002-0000-4000-8000-000000000022";
  const templates = {
    items: [
      {
        id: "c1000001-0000-4000-8000-000000000001",
        ownership: "global",
        trainerUserId: null,
        name: "FitBud weekly check-in",
        description: null,
        latestVersionId: NEWER_GLOBAL_VERSION_ID,
        latestVersionNumber: 2,
        createdAt: "2026-07-01T04:00:00.000Z",
        updatedAt: "2026-07-01T04:00:00.000Z",
      },
      {
        id: "d2000002-0000-4000-8000-000000000002",
        ownership: "trainer",
        trainerUserId: "77777777-7777-4777-8777-777777777777",
        name: "Rahul weekly",
        description: null,
        latestVersionId: TRAINER_LATEST_VERSION_ID,
        latestVersionNumber: 3,
        createdAt: "2026-07-02T04:00:00.000Z",
        updatedAt: "2026-07-02T04:00:00.000Z",
      },
    ],
    nextCursor: null,
  };

  async function pickForm(
    container: HTMLElement,
    value: string,
  ): Promise<HTMLSelectElement> {
    await screen.findByRole("heading", { name: "Coaching setup" });
    const select = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Check-in form",
    });
    expect(container.contains(select)).toBe(true);
    chooseOption(select, value);
    return select;
  }

  it("global option pins GLOBAL_CHECKIN_FORM_VERSION_ID, not the template's newer latest version (draft)", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    const draft = configuration("draft");
    api.saveConfigurationDraft.mockResolvedValue({ ...draft, recordVersion: 4 });
    api.assignPreferredCheckinForm.mockResolvedValue({});
    const { container } = renderPage("active", "draft", draft);
    // Start from the trainer's form so choosing the global one is a real change.
    await pickForm(container, TRAINER_LATEST_VERSION_ID);
    await pickForm(container, GLOBAL_CHECKIN_FORM_VERSION_ID);
    const options = Array.from(container.querySelectorAll("option")).map(
      (o) => o.getAttribute("value"),
    );
    expect(options).toContain(GLOBAL_CHECKIN_FORM_VERSION_ID);
    expect(options).not.toContain(NEWER_GLOBAL_VERSION_ID);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveConfigurationDraft).toHaveBeenCalled());
    expect(api.saveConfigurationDraft.mock.calls[0]![1].checkin.formVersionId).toBe(
      GLOBAL_CHECKIN_FORM_VERSION_ID,
    );
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalled());
    expect(api.assignPreferredCheckinForm.mock.calls[0]![1]).toEqual({
      checkinFormVersionId: GLOBAL_CHECKIN_FORM_VERSION_ID,
    });
  });

  it("a trainer form still pins its latest version (draft)", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    const draft = configuration("draft");
    api.saveConfigurationDraft.mockResolvedValue({ ...draft, recordVersion: 4 });
    api.assignPreferredCheckinForm.mockResolvedValue({});
    const { container } = renderPage("active", "draft", draft);
    await pickForm(container, TRAINER_LATEST_VERSION_ID);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveConfigurationDraft).toHaveBeenCalled());
    expect(api.saveConfigurationDraft.mock.calls[0]![1].checkin.formVersionId).toBe(
      TRAINER_LATEST_VERSION_ID,
    );
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalled());
    expect(api.assignPreferredCheckinForm.mock.calls[0]![1]).toEqual({
      checkinFormVersionId: TRAINER_LATEST_VERSION_ID,
    });
  });

  it("active configuration: the trainer assigns the next check-in's form through the enabled select (D-W8-5)", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    api.assignPreferredCheckinForm.mockResolvedValue({});
    const { container } = renderPage("active", "active");
    // Fails (throws) if the select is disabled, as it was before D-W8-5.
    const select = await pickForm(container, TRAINER_LATEST_VERSION_ID);
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalled());
    expect(api.assignPreferredCheckinForm.mock.calls[0]).toEqual([
      REL_ID,
      { checkinFormVersionId: TRAINER_LATEST_VERSION_ID },
    ]);
    // Only the preferred form changes: the locked version is not saved or revised.
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
    expect(api.createConfigurationVersion).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Check-in form assigned for the next check-in"),
    ).toBeTruthy();
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(select.value).toBe(TRAINER_LATEST_VERSION_ID);
    // Back to the FitBud form: the pinned global version, not the template's latest.
    chooseOption(select, GLOBAL_CHECKIN_FORM_VERSION_ID);
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalledTimes(2));
    expect(api.assignPreferredCheckinForm.mock.calls[1]).toEqual([
      REL_ID,
      { checkinFormVersionId: GLOBAL_CHECKIN_FORM_VERSION_ID },
    ]);
  });

  it("active configuration: Discard keeps the form already assigned on the server and reverts the rest (Z8-6)", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    api.assignPreferredCheckinForm.mockResolvedValue({});
    const { container } = renderPage("active", "active");
    const select = await pickForm(container, TRAINER_LATEST_VERSION_ID);
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(select.disabled).toBe(false));
    chooseOption(selectNamed(container, "sessionsPerWeek"), "5");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(selectNamed(container, "sessionsPerWeek").value).toBe("3");
    expect(select.value).toBe(TRAINER_LATEST_VERSION_ID);
    expect(screen.getByTestId("configure-footer-hint").textContent).toBe(
      "Edit a section to start v2.",
    );
    // Discard sends nothing: no re-assignment, no draft call.
    expect(api.assignPreferredCheckinForm).toHaveBeenCalledTimes(1);
    expect(api.discardConfigurationDraft).not.toHaveBeenCalled();
  });

  it("active configuration: a refused assignment puts the previous form back and says why", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    api.assignPreferredCheckinForm.mockRejectedValue(
      new ApiClientError({
        status: 403,
        code: "FORBIDDEN",
        message: "You cannot change this client's check-in form.",
        requestId: "req-form",
      }),
    );
    const { container } = renderPage("active", "active");
    const select = await pickForm(container, TRAINER_LATEST_VERSION_ID);
    expect(
      await screen.findByText("You cannot change this client's check-in form."),
    ).toBeTruthy();
    await waitFor(() => expect(select.value).toBe(GLOBAL_CHECKIN_FORM_VERSION_ID));
  });

  it("ended: there is no check-in form control to change", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    renderPage("ended", "active");
    await screen.findByTestId("configure-readonly");
    expect(screen.queryByRole("combobox", { name: "Check-in form" })).toBeNull();
  });

  it("the check-ins summary names the global form when it is pinned", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    const withTrainer = configuration("draft");
    withTrainer.checkin.formVersionId = TRAINER_LATEST_VERSION_ID as never;
    const { container, unmount } = renderPage("active", "draft", withTrainer);
    await screen.findByRole("heading", { name: "Coaching setup" });
    await waitFor(() => expect(container.textContent).toContain("Rahul weekly"));
    unmount();
    renderPage("active", "draft", configuration("draft"));
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "48 h window · FitBud weekly check-in",
      ),
    );
  });
});

describe("ConfigureCoachingPage when coaching ends while open (Z7-12)", () => {
  const MESSAGE = "Coaching ended. Your unsaved changes were not saved.";

  function ctx(
    onboardingStatus: Onboarding,
    reloadWorkspace: () => void,
    online = true,
  ) {
    return {
      workspace: {
        header: {
          traineeDisplayName: "Kavya Menon",
          traineeProfile: { gender: "female" },
          onboardingStatus,
          clientWhatsappE164: null,
          hasCustomMealTimes: false,
          traineeTimezone: "Asia/Kolkata",
          endedAt: onboardingStatus === "ended" ? "2026-10-21T04:00:00.000Z" : null,
          pendingReactivation: null,
        },
      },
      workspaceLoading: false,
      workspaceError: null,
      notFound: false,
      refreshEpoch: 0,
      reloadWorkspace,
      openWorkspaceModal: () => {},
      relationshipId: REL_ID,
      online,
      ended: onboardingStatus === "ended",
    };
  }

  function mount(reload: () => void, online = true) {
    api.getCoachingConfiguration.mockResolvedValue(configuration("draft"));
    const tree = (status: Onboarding) => (
      <MemoryRouter initialEntries={[`/clients/${REL_ID}/configure`]}>
        <Routes>
          <Route
            path="/clients/:relationshipId"
            element={<Outlet context={ctx(status, reload, online)} />}
          >
            <Route path="configure" element={<ConfigureCoachingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const view = render(tree("coaching_ready"));
    return { view, tree };
  }

  it("a realtime hint that flips the header to ended shows the message and keeps unsaved text", async () => {
    const { view, tree } = mount(() => {});
    await screen.findByRole("heading", { name: "Coaching setup" });
    const goal = view.container.querySelector<HTMLInputElement>(
      "input[name=goalShort]",
    )!;
    fireEvent.change(goal, { target: { value: "Unsaved new goal" } });
    expect(screen.queryByText(MESSAGE)).toBeNull();

    view.rerender(tree("ended"));
    await screen.findByText(MESSAGE);
    await screen.findByText("Coaching setup (ended)");
    // Read-only now (Z7-13), but the unsaved text stays visible.
    expect(
      screen.getByRole("definition", { name: "Short goal" }).textContent,
    ).toBe("Unsaved new goal");
    expect(view.container.querySelector("input[name=goalShort]")).toBeNull();
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
  });

  it("an ended relationship at load does not show the message", async () => {
    renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it("one tab return (visibilitychange then focus) triggers one reload", async () => {
    const reload = vi.fn();
    mount(reload);
    await screen.findByRole("heading", { name: "Coaching setup" });
    document.dispatchEvent(new Event("visibilitychange"));
    fireEvent(window, new Event("focus"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not refetch on focus while offline", async () => {
    const reload = vi.fn();
    mount(reload, false);
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent(window, new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("a reminder toggle refused with 409 RELATIONSHIP_ENDED reverts and shows the message", async () => {
    mount(() => {});
    await screen.findByRole("heading", { name: "Coaching setup" });
    api.saveReminderRules.mockRejectedValue(
      new ApiClientError({
        code: "RELATIONSHIP_ENDED",
        message: "Coaching relationship has ended.",
        requestId: "req-2",
        status: 409,
      }),
    );
    const box = (screen.getByText("Workout", { selector: "span" })
      .closest("label")!
      .querySelector("input") as HTMLInputElement);
    const before = box.checked;
    fireEvent.click(box);
    await screen.findByText(MESSAGE);
    await waitFor(() => expect(box.checked).toBe(before));
  });

  it("a save refused with 409 RELATIONSHIP_ENDED shows the same message and refetches", async () => {
    const reload = vi.fn();
    const { view } = mount(reload);
    await screen.findByRole("heading", { name: "Coaching setup" });
    api.saveConfigurationDraft.mockRejectedValue(
      new ApiClientError({
        code: "RELATIONSHIP_ENDED",
        message: "Coaching relationship has ended.",
        requestId: "req-1",
        status: 409,
      }),
    );
    fireEvent.change(
      view.container.querySelector<HTMLInputElement>("input[name=goalShort]")!,
      { target: { value: "Unsaved new goal" } },
    );
    reload.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(MESSAGE);
    expect(reload).toHaveBeenCalled();
    expect(screen.queryByText("Coaching relationship has ended.")).toBeNull();
    expect(
      view.container.querySelector<HTMLInputElement>("input[name=goalShort]")!
        .value,
    ).toBe("Unsaved new goal");
  });
});

describe("ConfigureCoachingPage v3 sections (Z8-5, frames 148/149)", () => {
  const sectionRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("details > summary")).map((summary) => ({
      title: summary.querySelector(".configure-accordion-title")?.textContent,
      badge: summary.querySelector("[data-testid=configure-section-badge]")?.textContent,
    }));

  it("holds coaching targets only: no basics or subscription, no flag-rules column", async () => {
    const { container } = renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(sectionRows(container).map((row) => row.title)).toEqual([
      "Goal",
      "Expectations",
      "Check-ins",
      "Tracking",
      "Automatic reminders",
    ]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Payment frequency");
    expect(text).not.toContain("Plan name");
    expect(text).not.toContain("Raises a flag when");
    expect(container.querySelector('[name="planName"]')).toBeNull();
    const headers = Array.from(
      container.querySelectorAll(".cs-expectations thead th"),
    ).map((th) => th.textContent);
    expect(headers).toEqual(["Expectation", "Target", "Details"]);
    const rows = Array.from(
      container.querySelectorAll(".cs-expectations tbody th"),
    ).map((th) => th.textContent);
    expect(rows).toEqual(["Workouts", "Meals logged", "Check-in", "Steps"]);
    // Targets are editable selects, not plain text.
    for (const name of ["sessionsPerWeek", "mealsPerDay", "cadence"]) {
      expect(selectNamed(container, name).disabled).toBe(false);
    }
    expect(text).not.toMatch(/\d\s?%/);
  });

  it("badges: Done for saved sections, Editing once a target changes, To do before anything is saved", async () => {
    const { container, unmount } = renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(sectionRows(container).map((row) => row.badge)).toEqual([
      "Done", "Done", "Done", "Done", "Done",
    ]);
    chooseOption(selectNamed(container, "sessionsPerWeek"), "5");
    expect(sectionRows(container)[1]!.badge).toBe("Editing");
    expect(
      container.querySelectorAll(".configure-accordion-summary")[1]?.textContent,
    ).toContain("5 workouts a week");
    unmount();

    const view = renderPage("coaching_ready", "draft", null as never);
    await screen.findByRole("heading", { name: "Coaching setup" });
    // Reminders: no badge until a configuration exists (Z8-5 review).
    expect(sectionRows(view.container).map((row) => row.badge)).toEqual([
      "To do", "To do", "To do", "To do", undefined,
    ]);
    expect(screen.getByTestId("configure-status-note").textContent).toBe(
      "Not saved yet",
    );
  });

  it("a cadence change marks Expectations as Editing, not Check-ins (the section that owns the field)", async () => {
    const { container } = renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    chooseOption(selectNamed(container, "cadence"), "biweekly");
    const badges = sectionRows(container).map((row) => row.badge);
    expect(badges[1]).toBe("Editing");
    expect(badges[2]).toBe("Done");
    chooseOption(selectNamed(container, "cadence"), "weekly");
    fireEvent.change(container.querySelector('[name="dueWindowHours"]')!, {
      target: { value: "24" },
    });
    const after = sectionRows(container).map((row) => row.badge);
    expect(after[1]).toBe("Done");
    expect(after[2]).toBe("Editing");
  });

  it("Save draft never writes the subscription, so amount, type and mode can't be dropped (D-W8-5)", async () => {
    api.saveConfigurationDraft.mockResolvedValue(configuration("draft"));
    renderPage("active", "draft");
    await screen.findByRole("heading", { name: "Coaching setup" });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveConfigurationDraft).toHaveBeenCalled());
    expect(api.saveSubscription).not.toHaveBeenCalled();
  });
});

describe("ConfigureCoachingPage steps target (Z8-5, D-W8-5)", () => {
  it("shows the stored target (default 8,000) and offers 1,000 to 50,000", async () => {
    const { container } = renderPage("active", "draft");
    await stepsLoaded(container);
    const select = selectNamed(container, "stepsTarget");
    expect(select.value).toBe("8000");
    expect(select.selectedOptions[0]!.textContent).toBe("8,000 a day");
    const values = Array.from(select.options).map((o) => Number(o.value));
    expect(values[0]).toBe(1000);
    expect(values[values.length - 1]).toBe(50000);
    expect(values.every((v) => v >= 1000 && v <= 50000)).toBe(true);
    expect(api.getClientSteps).toHaveBeenCalledWith(REL_ID, "7d");
    expect(api.putClientStepsTarget).not.toHaveBeenCalled();
  });

  it("an active version: changing the target saves it at once, without a new version", async () => {
    api.putClientStepsTarget.mockResolvedValue({ relationshipId: REL_ID, target: 10000 });
    const { container } = renderPage("active", "active");
    await stepsLoaded(container);
    chooseOption(selectNamed(container, "stepsTarget"), "10000");
    await waitFor(() =>
      expect(api.putClientStepsTarget).toHaveBeenCalledWith(REL_ID, 10000),
    );
    expect(await screen.findByText("Steps target set to 10,000 a day")).toBeTruthy();
    expect(api.createConfigurationVersion).not.toHaveBeenCalled();
    expect(api.saveConfigurationDraft).not.toHaveBeenCalled();
    expect(selectNamed(container, "stepsTarget").value).toBe("10000");
  });

  it("keeps a stored value that is off the 1,000 grid selectable", async () => {
    api.getClientSteps.mockResolvedValue({
      relationshipId: REL_ID,
      target: 7500,
      from: "2026-07-01",
      to: "2026-07-07",
      days: [],
    });
    const { container } = renderPage("active", "active");
    await stepsLoaded(container);
    expect(selectNamed(container, "stepsTarget").value).toBe("7500");
  });

  it("before the first configuration exists: disabled with the reason, never a hidden save", async () => {
    const { container } = renderPage("coaching_ready", "draft", null as never);
    await screen.findByRole("heading", { name: "Coaching setup" });
    await waitFor(() => expect(api.getClientSteps).toHaveBeenCalled());
    const select = selectNamed(container, "stepsTarget");
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("8000");
    expect(() => chooseOption(select, "10000")).toThrow(/disabled/);
    expect(screen.getByTestId("configure-steps-row").textContent).toContain(
      "Save the draft first. Then you can set the steps target.",
    );
    expect(select.getAttribute("aria-describedby")).toBe("configure-steps-detail");
    expect(api.putClientStepsTarget).not.toHaveBeenCalled();
  });

  it("after the first draft is saved, the target can be set", async () => {
    api.saveConfigurationDraft.mockResolvedValue(configuration("draft", null));
    const { container } = renderPage("coaching_ready", "draft", null as never);
    await screen.findByRole("heading", { name: "Coaching setup" });
    expect(selectNamed(container, "stepsTarget").disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveConfigurationDraft).toHaveBeenCalled());
    await stepsLoaded(container);
    expect(screen.getByTestId("configure-steps-row").textContent).not.toContain(
      "Save the draft first",
    );
  });

  it("a refused save shows why and puts the previous target back", async () => {
    api.putClientStepsTarget.mockRejectedValue(
      new ApiClientError({
        status: 404,
        code: "CONFIGURATION_NOT_FOUND",
        message: "Coaching configuration not found.",
        requestId: "req-steps",
      }),
    );
    const { container } = renderPage("active", "draft");
    await stepsLoaded(container);
    chooseOption(selectNamed(container, "stepsTarget"), "12000");
    expect(
      await screen.findByText("Save the draft first. Then you can set the steps target.", {
        selector: "[role=alert]",
      }),
    ).toBeTruthy();
    await waitFor(() => expect(selectNamed(container, "stepsTarget").value).toBe("8000"));
  });

  it("a target that could not be read stays disabled and says so", async () => {
    api.getClientSteps.mockRejectedValue(new Error("network"));
    const { container } = renderPage("active", "active");
    await screen.findByText("Could not load the steps target. Reload to try again.");
    expect(selectNamed(container, "stepsTarget").disabled).toBe(true);
  });
});
