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
  // mutations: must never be called just by rendering the page
  saveConfigurationDraft: vi.fn(),
  configureConfiguration: vi.fn(),
  activateConfiguration: vi.fn(),
  createConfigurationVersion: vi.fn(),
  saveSubscription: vi.fn(),
  saveReminderRules: vi.fn(),
  assignPreferredCheckinForm: vi.fn(),
  acknowledgePlanConsistency: vi.fn(),
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
    saveSubscription: api.saveSubscription,
    saveReminderRules: api.saveReminderRules,
    assignPreferredCheckinForm: api.assignPreferredCheckinForm,
    acknowledgePlanConsistency: api.acknowledgePlanConsistency,
  },
}));
vi.mock("../lib/stage1-api", () => ({
  stage1Api: { getResponsiveness: api.getResponsiveness },
}));
vi.mock("../lib/config", () => ({
  useConfig: () => ({ config: null }),
  isWhatsAppAutomationEnabled: () => false,
}));

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
      photoRequirement: "never",
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
});

afterEach(() => cleanup());

describe("ConfigureCoachingPage on an ended relationship (CE1)", () => {
  it("renders every input, select, switch and button disabled", async () => {
    const { container } = renderPage("ended", "active");
    await screen.findByText("Coaching setup (ended)");
    const all = controls(container);
    // goal 2 + workouts 2 + nutrition 3 + check-ins 3 + tracking 3 + reminders 3 + subscription 4
    expect(all.length).toBeGreaterThanOrEqual(20);
    // The control's own disabled property, not just an ancestor fieldset:
    // fieldset[disabled] leaves it false, which reads as editable to tools.
    const enabled = all.filter((el) => !el.disabled).map(describeControl);
    expect(enabled).toEqual([]);
    expect(
      container.querySelectorAll('input[role="switch"]:not([disabled])'),
    ).toHaveLength(0);
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
  it("active version: keeps the 'version is active' banner and Create new version", async () => {
    const { container } = renderPage("active", "active");
    await screen.findByText("Configure coaching");
    expect(
      screen.getByText("This version is active. Create a new version to change it."),
    ).toBeTruthy();
    expect(container.textContent).not.toContain("has ended");
    const create = screen.getByRole("button", { name: "Create new version" });
    expect((create as HTMLButtonElement).disabled).toBe(false);
    // Locked version fields stay disabled; reminders and subscription stay editable.
    const byName = (n: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${n}"]`)!;
    expect(byName("goalShort").disabled).toBe(true);
    expect(byName("planName").disabled).toBe(false);
    const switches = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[role="switch"]'),
    );
    expect(switches.map((s) => s.disabled)).toEqual([
      true, true, true, // tracking (locked with the active version)
      false, false, false, // automatic reminders
    ]);
    expect(
      (screen.getByRole("button", { name: "Save subscription" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("draft: every field and both save actions are enabled, no banner", async () => {
    const { container } = renderPage("active", "draft");
    await screen.findByText("Configure coaching");
    const disabledFields = controls(container)
      .filter((el) => el.tagName !== "BUTTON" && el.disabled)
      .map(describeControl);
    expect(disabledFields).toEqual([]);
    const disabledButtons = controls(container)
      .filter((el) => el.tagName === "BUTTON" && el.disabled)
      .map((el) => el.textContent);
    // Only the WhatsApp shortcut (no number in this fixture) is disabled.
    expect(disabledButtons).toEqual(["Open WhatsApp"]);
    expect(container.textContent).not.toContain("This version is active");
    expect(container.textContent).not.toContain("has ended");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activate" })).toBeTruthy();
  });
});

describe("ConfigureCoachingPage one-step Activate (Z5-2, D12)", () => {
  it("a draft with a short goal offers Save draft and Activate, never Mark configured", async () => {
    renderPage("active", "draft");
    await screen.findByText("Configure coaching");
    expect(screen.queryByRole("button", { name: "Mark configured" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    const activate = screen.getByRole("button", { name: "Activate" });
    expect((activate as HTMLButtonElement).disabled).toBe(false);
    expect(activate.className).toContain("primary");
  });

  it("a draft without a short goal offers Save draft only", async () => {
    renderPage("active", "draft", configuration("draft", null));
    await screen.findByText("Configure coaching");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark configured" })).toBeNull();
  });

  it("Activate saves the form then activates in one step, without the configure call", async () => {
    const draft = configuration("draft");
    const saved = { ...draft, recordVersion: 4 };
    api.saveConfigurationDraft.mockResolvedValue(saved);
    api.activateConfiguration.mockResolvedValue({
      ...saved,
      status: "active",
      recordVersion: 5,
      activatedAt: "2026-07-07T04:00:00.000Z",
    });
    renderPage("active", "draft", draft);
    await screen.findByText("Configure coaching");
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(api.activateConfiguration).toHaveBeenCalledTimes(1));
    expect(api.saveConfigurationDraft).toHaveBeenCalledTimes(1);
    expect(api.saveConfigurationDraft.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 3,
    });
    expect(api.activateConfiguration.mock.calls[0]![0]).toBe(REL_ID);
    expect(api.activateConfiguration.mock.calls[0]![1]).toEqual({ expectedVersion: 4 });
    expect(api.saveConfigurationDraft.mock.invocationCallOrder[0]!).toBeLessThan(
      api.activateConfiguration.mock.invocationCallOrder[0]!,
    );
    expect(api.configureConfiguration).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Configuration is active. Publish a plan so the trainee can start.",
      ),
    ).toBeTruthy();
  });

  it("a new version reads as the one-step flow", async () => {
    api.createConfigurationVersion.mockResolvedValue({
      ...configuration("draft"),
      versionNumber: 2,
      recordVersion: 0,
    });
    renderPage("active", "active");
    await screen.findByText("Configure coaching");
    fireEvent.click(screen.getByRole("button", { name: "Create new version" }));
    expect(
      await screen.findByText(
        "New draft version created. Activate it to go live. New targets start tomorrow.",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("Edit and activate when ready");
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

  it("Rohan (active): live title, renews, WhatsApp and reminder wording stay", async () => {
    const { container } = renderPage("active", "active", configuration("active"), {
      displayName: "Rohan Mehta",
      gender: "male",
    });
    expect(
      await screen.findByRole("heading", { name: "Configure coaching" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Set the baseline for Rohan: goals, expectations, reminders, and subscription.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("configure-status-pill").textContent).toContain(
      "Active",
    );
    const text = container.textContent ?? "";
    expect(text).toContain("renews");
    expect(text).toContain("Renews on");
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
    await screen.findByText("Configure coaching");
    const select = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((el) => el.closest("label")?.textContent?.startsWith("Check-in form"))!;
    fireEvent.change(select, { target: { value } });
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

  it("active configuration: choosing the global form calls the preferred-form route with GLOBAL_CHECKIN_FORM_VERSION_ID", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    api.assignPreferredCheckinForm.mockResolvedValue({});
    const { container } = renderPage("active", "active");
    await pickForm(container, GLOBAL_CHECKIN_FORM_VERSION_ID);
    await waitFor(() => expect(api.assignPreferredCheckinForm).toHaveBeenCalled());
    expect(api.assignPreferredCheckinForm.mock.calls[0]).toEqual([
      REL_ID,
      { checkinFormVersionId: GLOBAL_CHECKIN_FORM_VERSION_ID },
    ]);
  });

  it("the check-ins summary names the global form when it is pinned", async () => {
    api.listCheckinFormTemplates.mockResolvedValue(templates);
    const withTrainer = configuration("draft");
    withTrainer.checkin.formVersionId = TRAINER_LATEST_VERSION_ID as never;
    const { container, unmount } = renderPage("active", "draft", withTrainer);
    await screen.findByText("Configure coaching");
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
