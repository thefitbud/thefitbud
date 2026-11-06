/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";

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
) {
  api.getCoachingConfiguration.mockResolvedValue(config);
  const context = {
    workspace: {
      header: {
        traineeDisplayName: "Kavya Menon",
        traineeProfile: { gender: "female" },
        onboardingStatus,
        clientWhatsappE164: null,
        hasCustomMealTimes: false,
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
    await screen.findByText("Configure coaching");
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
    await screen.findByText("Configure coaching");
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

  it("shows only the ended read-only banner, not 'This version is active'", async () => {
    const { container } = renderPage("ended", "active");
    await screen.findByText("Configure coaching");
    expect(container.textContent).not.toContain("This version is active");
    expect(
      screen.getByText(
        "This coaching relationship has ended. Configuration is read-only.",
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
