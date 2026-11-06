/**
 * @vitest-environment happy-dom
 *
 * Z5-3: no trainer-web screen may show a raw enum value ("per_100_g",
 * "client_logged_later"). Each screen is rendered with fixtures that hold every
 * value of the enums it prints, then its visible text is scanned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { allLabelEntries } from "@fitbud/core";
import {
  coachingConfigurationStatusSchema,
  mealPhotoRequirementSchema,
  paymentFrequencySchema,
  planTemplateTypeSchema,
  planVersionStatusSchema,
  checkinStatusSchema,
  mealAssignmentStatusSchema,
  mealDeviationKindSchema,
  workoutAssignmentStatusSchema,
  checkinReviewOutcomeSchema,
  checkinCadenceSchema,
  exceptionSeveritySchema,
  measurementTypeSchema,
  exceptionTypeSchema,
  onboardingStatusSchema,
  renewalStateSchema,
  responsivenessLabelSchema,
  weekDayStateSchema,
} from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  listExerciseLibrary: vi.fn(),
  listFoodLibrary: vi.fn(),
  listTrainerNotes: vi.fn(),
  deleteTrainerNote: vi.fn(),
  getCheckinReviewContext: vi.fn(),
  listTrainerCheckinInbox: vi.fn(),
  getCurrentOnboardingForm: vi.fn(),
  getOnboardingFormTemplate: vi.fn(),
  getOnboardingResponse: vi.fn(),
  listHistory: vi.fn(),
  reviewOnboarding: vi.fn(),
  listWorkspaceActivity: vi.fn(),
  getMealAssignment: vi.fn(),
  listCheckins: vi.fn(),
  listCheckinFormTemplates: vi.fn(),
  listPlanTemplates: vi.fn(),
  listPlans: vi.fn(),
  getPlanVersion: vi.fn(),
  getPlanConsistency: vi.fn(),
  getException: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getClientWorkspace: vi.fn(),
  getCoachingConfiguration: vi.fn(),
  getSubscription: vi.fn(),
  getEffectivePlan: vi.fn(),
  getReminderRules: vi.fn(),
  getPlanTemplate: vi.fn(),
  listClients: vi.fn(),
  listOnboardingFormTemplates: vi.fn(),
  listPlanTemplatesExtended: vi.fn(),
}));
const stage1 = vi.hoisted(() => ({
  getWorkspaceWeek: vi.fn(),
  getResponsiveness: vi.fn(),
  patchTrainerNote: vi.fn(),
}));

vi.mock("./api", () => ({ apiClient: api }));
vi.mock("./http-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http-api")>()),
  listPlanTemplatesExtended: api.listPlanTemplatesExtended,
}));
vi.mock("./config", () => ({
  useConfig: () => ({ config: null }),
  isWhatsAppAutomationEnabled: () => false,
}));
vi.mock("./stage1-api", () => ({ stage1Api: stage1 }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { TemplatesHub } from "../pages/TemplatesHub";
import { ConfigureCoachingPage } from "../pages/ConfigureCoachingPage";
import { ClientPlanPage } from "../pages/ClientPlanPage";
import { ClientActivityPage } from "../pages/ClientActivityPage";
import { ClientCheckinsPage } from "../pages/ClientCheckinsPage";
import { CheckinReviewPage } from "../pages/CheckinReviewPage";
import { OnboardingReviewPage } from "../pages/OnboardingReviewPage";
import { ClientOverviewPage } from "../pages/ClientOverviewPage";
import { LibrariesPanel } from "../pages/templates/LibrariesPanel";

const ENTRIES = allLabelEntries();
/** Every enum key that contains an underscore, and every single-word key. */
const UNDERSCORE_KEYS = new Set(
  ENTRIES.map((e) => e.value).filter((v) => v.includes("_")),
);
/** "portion adjustment": an underscore key with its underscores swapped for spaces. */
const SPACED_KEYS = new Set(
  [...UNDERSCORE_KEYS]
    .map((v) => v.replaceAll("_", " "))
    .filter((spaced) => !ENTRIES.some((e) => e.label === spaced)),
);
const SINGLE_WORD_KEYS = new Set(
  ENTRIES.map((e) => e.value).filter((v) => !v.includes("_")),
);

/**
 * Raw enum values visible on the page: any token that is an underscore enum key,
 * or any element whose whole text is exactly a single-word enum key (a chip that
 * reads "active" instead of "Active").
 */
function rawEnumHits(root: Element): string[] {
  const hits = new Set<string>();
  const visit = (el: Element) => {
    const texts = [el.getAttribute("aria-label"), el.getAttribute("title")];
    if (el.children.length === 0) texts.push(el.textContent);
    for (const text of texts) {
      if (!text) continue;
      for (const token of text.match(/[A-Za-z0-9_]+/g) ?? []) {
        if (UNDERSCORE_KEYS.has(token)) hits.add(token);
      }
      if (SINGLE_WORD_KEYS.has(text.trim())) hits.add(text.trim());
      if (SPACED_KEYS.has(text.trim())) hits.add(text.trim());
    }
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return [...hits].sort();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = "2026-10-21T04:00:00.000Z";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("rawEnumGuard detector", () => {
  it("flags underscore keys and bare single-word keys, ignores prose", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<p>Logged <b>client_logged_later</b></p><span>active</span><p>An active week</p><i title="per_100_g">x</i><u>portion adjustment</u><u>Portion adjustment</u>';
    expect(rawEnumHits(host)).toEqual([
      "active",
      "client_logged_later",
      "per_100_g",
      "portion adjustment",
    ]);
  });
});

describe("rawEnumGuard: web", () => {
  it("Libraries: food classification, basis and exercise enums read as labels", async () => {
    api.listFoodLibrary.mockResolvedValue({
      nextCursor: null,
      items: (["per_100_g", "per_100_ml"] as const).flatMap((basis, b) =>
        (
          [
            "raw_ingredient",
            "generic_food",
            "prepared_food",
            "branded_product",
          ] as const
        ).map((classification, c) => ({
          id: uuid(b * 10 + c + 1),
          ownership: "global",
          trainerUserId: null,
          name: `Food ${b}-${c}`,
          cuisineRegion: "indian",
          classification,
          basis,
          energyKcalScaled: 140000,
          proteinScaled: 8000,
          carbsScaled: 18000,
          fatScaled: 4000,
          servings: [],
          notes: null,
          description: null,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        })),
      ),
    });
    api.listExerciseLibrary.mockResolvedValue({
      nextCursor: null,
      items: (["beginner", "intermediate", "advanced"] as const).map(
        (difficulty, i) => ({
          id: uuid(100 + i),
          ownership: "global",
          trainerUserId: null,
          name: `Exercise ${i}`,
          instructions: null,
          primaryMuscles: ["upper_back", "full_body"],
          secondaryMuscles: ["lower_back"],
          equipment: ["smith_machine", "medicine_ball"],
          difficulty,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        }),
      ),
    });

    for (const segment of ["foods", "exercises"] as const) {
      const view = render(
        <MemoryRouter initialEntries={[`/templates/libraries/${segment}`]}>
          <Routes>
            <Route
              path="/templates/libraries/:segment"
              element={<LibrariesPanel />}
            />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(view.container.querySelector("table")).not.toBeNull(),
      );
      expect(rawEnumHits(view.container), segment).toEqual([]);
      if (segment === "foods") {
        expect(view.container.textContent).toContain("Per 100 ml");
      }
      cleanup();
    }
  });

  it("Overview: lifecycle, renewal, exception, week and activity enums read as labels", async () => {
    const REL = uuid(900);
    const renders = onboardingStatusSchema.options.flatMap((status) =>
      renewalStateSchema.options.map((renewal) => ({ status, renewal })),
    );
    api.listTrainerNotes.mockResolvedValue({
      items: (["private", "client"] as const).map((visibility, i) => ({
        id: uuid(950 + i),
        body: `Note ${i}`,
        visibility,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
    const days = weekDayStateSchema.options.map((state, i) => ({
      date: `2026-10-${String(19 + i).padStart(2, "0")}`,
      state,
      workoutLabel: state === "rest" ? "Rest" : "Upper A",
      mealsLogged: 2,
      mealsAssigned: 4,
      mealSlots: ["logged", "missed", "later", "upcoming"],
    }));
    stage1.getWorkspaceWeek.mockResolvedValue({
      start: "2026-10-19",
      workouts: { assigned: 4, completed: 2 },
      meals: { assigned: 20, logged: 10 },
      days,
      todayNutrition: {
        date: "2026-10-21",
        logged: { kcal: 1200, proteinG: 80, carbsG: 120, fatG: 40 },
        assigned: { kcal: 2000, proteinG: 120, carbsG: 200, fatG: 60 },
      },
    });
    let responsivenessLabel: string = "responds";
    stage1.getResponsiveness.mockImplementation(async () => ({
      label: responsivenessLabel,
      counts: { sent: 8, opened: 6, loggedAfter: 4, loggedBefore: 1 },
      pushEnabled: true,
    }));
    const activity = [
      ...(["assigned", "in_progress", "paused", "completed", "skipped", "missed"] as const).map(
        (state, i) => ({
          type: "workout" as const,
          id: uuid(960 + i),
          state,
          planVersionId: uuid(970),
          occurredAt: NOW,
          localDate: "2026-10-21",
          title: `Workout ${i}`,
        }),
      ),
    ].slice(0, 5);

    for (const [index, { status, renewal }] of renders.entries()) {
      const exceptionType = exceptionTypeSchema.options[
        index % exceptionTypeSchema.options.length
      ]!;
      responsivenessLabel =
        responsivenessLabelSchema.options[index % responsivenessLabelSchema.options.length]!;
      const workspace = {
        header: {
          relationshipId: REL,
          traineeDisplayName: "Kavya Menon",
          onboardingStatus: status,
          renewalState: renewal,
          adherenceState: "needs_attention",
          traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
          traineeTimezone: "Asia/Kolkata",
          hasCustomMealTimes: false,
          trainerWhatsappE164: null,
          clientWhatsappE164: null,
        },
        overview: {
          openException: {
            id: uuid(980),
            type: exceptionType,
            severity: "critical",
            status: "open",
            summary: "",
            sourceEntityType: "meal_assignment",
            sourceEntityId: uuid(981),
            detectedAt: NOW,
          },
          pendingReviewCheckin: null,
          nextCheckin: null,
          recentActivity: activity,
          progress: { measurements: [] },
        },
        plan: { plan: null, version: null },
        configuration: { configuration: null, subscription: null },
      };
      const context = {
        workspace,
        openWorkspaceModal: vi.fn(),
        refreshEpoch: 0,
        relationshipId: REL,
        online: true,
        ended: status === "ended",
      };
      const view = render(
        <MemoryRouter initialEntries={[`/clients/${REL}/overview`]}>
          <Routes>
            <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
              <Route path="overview" element={<ClientOverviewPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(view.container.querySelector('[data-testid="screen-TW-09"]')).not.toBeNull(),
      );
      await waitFor(() => expect(api.listTrainerNotes).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(rawEnumHits(view.container), `${status}/${renewal}`).toEqual([]);
      cleanup();
    }
  });

  it("Check-in review: outcome, severity, cadence and measurement enums read as labels", async () => {
    const REL = uuid(800);
    const CHECKIN = uuid(801);
    api.listTrainerCheckinInbox.mockResolvedValue({ items: [], nextCursor: null });
    const outcomes = checkinReviewOutcomeSchema.options;
    const cadences = checkinCadenceSchema.options;
    for (const [index, outcome] of outcomes.entries()) {
      for (const reviewed of [true, false]) {
        api.getCheckinReviewContext.mockResolvedValue({
          checkin: {
            id: CHECKIN,
            coachingRelationshipId: REL,
            checkinScheduleId: null,
            localDate: "2026-10-27",
            windowStartsAt: NOW,
            windowEndsAt: NOW,
            recordStatus: "submitted",
            recordVersion: 2,
            definitionVersion: 1,
            checkinFormVersionId: uuid(802),
            answers: null,
            submittedAt: NOW,
            status: reviewed ? "reviewed" : "submitted",
            review: reviewed
              ? {
                  id: uuid(803),
                  checkinId: CHECKIN,
                  coachingRelationshipId: REL,
                  trainerUserId: uuid(804),
                  outcome,
                  notes: null,
                  createdAt: NOW,
                  updatedAt: NOW,
                }
              : null,
            createdAt: NOW,
            updatedAt: NOW,
          },
          pinnedForm: {
            id: uuid(802),
            templateId: uuid(805),
            key: "weekly",
            version: 1,
            scope: "global",
            fields: [],
            createdAt: NOW,
          },
          recentWorkoutAdherence: { completed: 3, missed: 1, modified: 1, skipped: 1, pending: 1 },
          recentMealCompliance: { confirmed: 10, modified: 2, skipped: 1, overdue: 1, pending: 2 },
          activeExceptions: exceptionSeveritySchema.options.map((severity, i) => ({
            id: uuid(810 + i),
            type: "missed_workout",
            severity,
            status: "open",
            summary: `Item ${i}`,
            sourceEntityType: "meal_assignment",
            sourceEntityId: uuid(820 + i),
            detectedAt: NOW,
          })),
          photos: [],
          measurements: measurementTypeSchema.options.map((type, i) => ({
            type,
            value: String(60 + i),
            unit: "kg",
            observedAt: NOW,
          })),
          previousNotes: [],
          currentPlan: null,
          currentConfiguration: {
            id: uuid(830),
            goalShort: null,
            goalDescription: null,
            checkinCadence: cadences[index % cadences.length],
            dueWindowHours: 48,
          },
        });
        const context = {
          workspace: {
            header: {
              traineeDisplayName: "Rohan Sharma",
              traineeTimezone: "Asia/Kolkata",
              clientWhatsappE164: null,
            },
          },
          relationshipId: REL,
          refreshEpoch: 0,
          online: true,
          ended: false,
        };
        const view = render(
          <MemoryRouter initialEntries={[`/clients/${REL}/check-ins/${CHECKIN}`]}>
            <Routes>
              <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
                <Route path="check-ins/:checkinId" element={<CheckinReviewPage />} />
              </Route>
            </Routes>
          </MemoryRouter>,
        );
        await waitFor(() =>
          expect(view.container.querySelector('[data-testid="review-action-bar"]')).not.toBeNull(),
        );
        const text = view.container.textContent ?? "";
        expect(rawEnumHits(view.container), `${outcome}/${reviewed}`).toEqual([]);
        expect(text).toContain(
          `Cadence: ${{ weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly" }[cadences[index % cadences.length]!]}`,
        );
        if (reviewed) {
          expect(text).toContain("Reviewed ·");
          expect(text).not.toContain(outcome);
        }
        cleanup();
      }
    }
  });

  it("Onboarding review: every lifecycle state reads as labels, with the pinned-form answers", async () => {
    const REL = uuid(700);
    api.getCurrentOnboardingForm.mockResolvedValue({
      id: uuid(701),
      templateId: uuid(702),
      key: "intake",
      version: 1,
      fields: [
        {
          id: "goal",
          type: "single_choice",
          label: "Main goal",
          required: true,
          highlight: true,
          options: [{ id: "lose_weight", label: "Lose weight" }],
        },
        {
          id: "days",
          type: "multiple_choice",
          label: "Training days",
          required: false,
          options: [
            { id: "mon_wed", label: "Mon and Wed" },
            { id: "fri_sat", label: "Fri and Sat" },
          ],
        },
      ],
    });
    api.getOnboardingFormTemplate.mockResolvedValue({ name: "Standard intake" });
    api.getOnboardingResponse.mockResolvedValue({
      status: "submitted",
      submittedAt: NOW,
      updatedAt: NOW,
      answers: { goal: "lose_weight", days: ["mon_wed", "fri_sat"] },
    });
    api.listHistory.mockResolvedValue({ items: [{ occurredAt: NOW }] });
    for (const status of onboardingStatusSchema.options) {
      const context = {
        workspace: {
          header: {
            traineeDisplayName: "Kavya Menon",
            traineeProfile: { gender: "female" },
            onboardingStatus: status,
            clientWhatsappE164: null,
          },
        },
        relationshipId: REL,
        refreshEpoch: 0,
        online: true,
        ended: status === "ended",
      };
      const view = render(
        <MemoryRouter initialEntries={[`/clients/${REL}/onboarding`]}>
          <Routes>
            <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
              <Route path="onboarding" element={<OnboardingReviewPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(view.container.querySelector('[data-testid="screen-TW-10"]')).not.toBeNull(),
      );
      expect(rawEnumHits(view.container), status).toEqual([]);
      cleanup();
    }
  });

  it("Activity: workout, meal and check-in states and meal deviation kinds read as labels", async () => {
    const REL = uuid(600);
    const header = {
      relationshipId: REL,
      traineeDisplayName: "Kavya Menon",
      onboardingStatus: "active",
      traineeTimezone: "Asia/Kolkata",
      traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
    };
    const deviationKinds = mealDeviationKindSchema.options;
    const mealItems = mealAssignmentStatusSchema.options.map((state, i) => ({
      type: "meal" as const,
      id: uuid(610 + i),
      state,
      planVersionId: uuid(620),
      occurredAt: NOW,
      localDate: "2026-10-21",
      title: `Meal ${i}`,
    }));
    const byType = {
      workout: workoutAssignmentStatusSchema.options.map((state, i) => ({
        type: "workout" as const,
        id: uuid(630 + i),
        state,
        planVersionId: uuid(620),
        occurredAt: NOW,
        localDate: "2026-10-21",
        title: `Workout ${i}`,
      })),
      meal: mealItems,
      checkin: checkinStatusSchema.options.map((state, i) => ({
        type: "checkin" as const,
        id: uuid(640 + i),
        state,
        planVersionId: null,
        occurredAt: NOW,
        localDate: "2026-10-21",
        title: `Check-in ${i}`,
      })),
    };
    api.listWorkspaceActivity.mockImplementation(
      async (_rel: string, query: { type: keyof typeof byType }) => ({
        items: byType[query.type],
        nextCursor: null,
      }),
    );
    // One logged-without-detail meal per deviation kind, so the line falls back
    // to the deviation kind itself.
    const deviationFor = new Map(
      deviationKinds.map((kind, i) => [uuid(650 + i), kind] as const),
    );
    byType.meal = deviationKinds.map((_kind, i) => ({
      ...mealItems[i % mealItems.length]!,
      id: uuid(650 + i),
      state: "modified" as never,
      title: `Meal ${i}`,
    })) as never;
    api.getMealAssignment.mockImplementation(async (id: string) => ({
      id,
      coachingRelationshipId: REL,
      mealName: "Lunch",
      status: "modified",
      prescription: { items: [] },
      compliance: {
        id: uuid(660),
        assignmentId: id,
        outcome: "modified",
        deviationKind: deviationFor.get(id) ?? null,
        notes: null,
        loggedItems: [],
        loggedTotals: null,
        mediaAssetId: null,
      },
    }));

    for (const type of ["workout", "meal", "checkin"] as const) {
      const context = {
        workspace: { header },
        workspaceLoading: false,
        refreshEpoch: 0,
        online: true,
        ended: false,
      };
      const view = render(
        <MemoryRouter initialEntries={[`/clients/${REL}/activity?type=${type}`]}>
          <Routes>
            <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
              <Route path="activity" element={<ClientActivityPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(view.container.querySelectorAll('[data-testid="activity-row"]').length).toBeGreaterThan(0),
      );
      if (type === "meal") {
        await waitFor(() =>
          expect(view.container.textContent).toContain("Portion adjustment"),
        );
      }
      expect(rawEnumHits(view.container), type).toEqual([]);
      cleanup();
    }
  });

  it("Client check-ins: status and review outcome enums read as labels", async () => {
    const REL = uuid(500);
    const outcomes = checkinReviewOutcomeSchema.options;
    api.listCheckinFormTemplates.mockResolvedValue({ items: [] });
    api.listCheckins.mockResolvedValue({
      nextCursor: null,
      items: checkinStatusSchema.options.map((status, i) => ({
        id: uuid(510 + i),
        coachingRelationshipId: REL,
        localDate: "2026-10-2" + i,
        windowStartsAt: NOW,
        windowEndsAt: NOW,
        status,
        review:
          status === "reviewed"
            ? { outcome: outcomes[i % outcomes.length], notes: null, createdAt: NOW }
            : null,
      })).concat(
        outcomes.map((outcome, i) => ({
          id: uuid(530 + i),
          coachingRelationshipId: REL,
          localDate: "2026-10-1" + i,
          windowStartsAt: NOW,
          windowEndsAt: NOW,
          status: "reviewed" as never,
          review: { outcome, notes: null, createdAt: NOW } as never,
        })),
      ),
    });
    const context = {
      workspace: {
        header: {
          traineeDisplayName: "Kavya Menon",
          traineeTimezone: "Asia/Kolkata",
          traineeProfile: { gender: "female" },
        },
      },
      refreshEpoch: 0,
      online: true,
      ended: false,
    };
    const view = render(
      <MemoryRouter initialEntries={[`/clients/${REL}/check-ins`]}>
        <Routes>
          <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
            <Route path="check-ins" element={<ClientCheckinsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(view.container.querySelector("table")).not.toBeNull());
    expect(rawEnumHits(view.container)).toEqual([]);
    expect(view.container.textContent).toContain("Needs follow-up");
  });

  it("Plan: template types and version statuses read as labels", async () => {
    const REL = uuid(400);
    const header = {
      relationshipId: REL,
      traineeDisplayName: "Kavya Menon",
      onboardingStatus: "active",
      traineeTimezone: "Asia/Kolkata",
      traineeProfile: { displayName: "Kavya Menon", age: null, gender: "female" },
      mealTimeOverrides: [],
    };
    api.listPlanTemplates.mockResolvedValue({
      nextCursor: null,
      items: planTemplateTypeSchema.options.map((templateType, i) => ({
        id: uuid(410 + i),
        title: `Template ${i}`,
        templateType,
        ownership: i % 2 === 0 ? "global" : "trainer",
      })),
    });
    api.listPlans.mockImplementation(async (_rel: string, query: { versionStatus?: string }) => ({
      nextCursor: null,
      items: query.versionStatus === "draft"
        ? []
        : [
            {
              plan: { id: uuid(420), title: "Strength block" },
              versions: planVersionStatusSchema.options.map((status, i) => ({
                id: uuid(430 + i),
                versionNumber: i + 1,
                status,
                effectiveFrom: NOW,
                effectiveTo: null,
                publishedAt: status === "draft" ? null : NOW,
                updatedAt: NOW,
              })),
            },
          ],
    }));
    api.getPlanConsistency.mockResolvedValue({ warnings: [] });
    const outlet = (plan: unknown) => ({
      workspace: {
        header,
        plan,
        configuration: { configuration: null, subscription: null },
      },
      workspaceLoading: false,
      workspaceError: null,
      refreshEpoch: 0,
      reloadWorkspace: () => {},
      online: true,
      ended: false,
    });
    const tree = (plan: unknown) => (
      <MemoryRouter initialEntries={[`/clients/${REL}/plan`]}>
        <Routes>
          <Route path="/clients/:relationshipId" element={<Outlet context={outlet(plan)} />}>
            <Route path="plan" element={<ClientPlanPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // No plan yet: the template picker lists every template type.
    render(tree({ plan: null, version: null }));
    fireEvent.click(await screen.findByRole("button", { name: "Start from a template" }));
    await waitFor(() => expect(document.body.textContent).toContain("Template 0"));
    expect(rawEnumHits(document.body)).toEqual([]);
    expect(document.body.textContent).toContain("Full plan · FitBud template");
    cleanup();

    // Current plan: the versions table lists every version status.
    const withPlan = render(
      tree({
        plan: { id: uuid(420), title: "Strength block" },
        version: {
          id: uuid(430),
          versionNumber: 2,
          status: "published",
          effectiveFrom: NOW,
          effectiveTo: null,
          content: { workoutDays: [], mealPrescriptions: [] },
        },
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Versions/ }));
    await waitFor(() => expect(withPlan.container.querySelector(".versions-table")).not.toBeNull());
    expect(rawEnumHits(withPlan.container)).toEqual([]);
    expect(withPlan.container.querySelectorAll(".status-pill")).toHaveLength(
      planVersionStatusSchema.options.length,
    );
  });

  it("Configure: payment frequency, cadence, photo rule and status read as labels", async () => {
    const REL = uuid(300);
    api.getEffectivePlan.mockResolvedValue({ plan: null, version: null });
    api.getReminderRules.mockResolvedValue({
      items: [
        { reminderType: "workout_reminder", enabled: true },
        { reminderType: "meal_reminder", enabled: false },
        { reminderType: "checkin_reminder", enabled: true },
      ],
    });
    api.getOnboardingResponse.mockResolvedValue({ status: "submitted", answers: {} });
    api.listCheckinFormTemplates.mockResolvedValue({ items: [] });
    api.getPlanConsistency.mockResolvedValue({ warnings: [] });
    const frequencies = paymentFrequencySchema.options;
    const photoRules = mealPhotoRequirementSchema.options;
    const cadences = checkinCadenceSchema.options;
    for (const [index, status] of coachingConfigurationStatusSchema.options.entries()) {
      for (const frequency of frequencies) {
        api.getSubscription.mockResolvedValue({
          planName: "Monthly coaching",
          paymentFrequency: frequency,
          startsOn: "2026-07-06",
          renewsOn: "2026-11-17",
        });
        api.getCoachingConfiguration.mockResolvedValue({
          id: uuid(301),
          coachingRelationshipId: REL,
          status,
          versionNumber: 1,
          recordVersion: 3,
          goalShort: "Postpartum strength return",
          goalDescription: "Rebuild core and lower-body strength.",
          notes: null,
          workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
          nutrition: {
            mealsPerDay: 4,
            confirmationWindowHours: 12,
            photoRequirement: photoRules[index % photoRules.length],
          },
          checkin: {
            cadence: cadences[index % cadences.length],
            dueWindowHours: 48,
            formVersionId: null,
          },
          tracking: {
            requireBodyWeight: true,
            requireProgressPhotos: false,
            requireSessionRpe: false,
          },
          configuredAt: null,
          activatedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        });
        const context = {
          workspace: {
            header: {
              traineeDisplayName: "Kavya Menon",
              traineeProfile: { gender: "female" },
              onboardingStatus: "coaching_ready",
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
          relationshipId: REL,
          online: true,
          ended: false,
        };
        const view = render(
          <MemoryRouter initialEntries={[`/clients/${REL}/configure`]}>
            <Routes>
              <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
                <Route path="configure" element={<ConfigureCoachingPage />} />
              </Route>
            </Routes>
          </MemoryRouter>,
        );
        await screen.findByText("Configure coaching");
        await waitFor(() =>
          expect(view.container.textContent).toContain("Postpartum strength return"),
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(rawEnumHits(view.container), `${status}/${frequency}`).toEqual([]);
        expect(view.container.textContent).toContain("Quarterly");
        expect(view.container.textContent).toContain("Selected meals");
        cleanup();
      }
    }
  });

  it("Templates: every tab lists its templates with labels, not enum values", async () => {
    const planItem = (templateType: string, i: number) => ({
      id: uuid(200 + i),
      title: `Plan template ${i}`,
      templateType,
      ownership: i % 2 === 0 ? "global" : "trainer",
      updatedAt: NOW,
    });
    api.listPlanTemplatesExtended.mockImplementation(
      async (query: { templateType: string }) => ({
        nextCursor: null,
        items: planTemplateTypeSchema.options
          .map(planItem)
          .filter((item) => item.templateType === query.templateType),
      }),
    );
    api.getPlanTemplate.mockResolvedValue(null);
    api.listClients.mockResolvedValue({ items: [], nextCursor: null });
    const formItem = (i: number) => ({
      id: uuid(220 + i),
      name: `Form ${i}`,
      ownership: i % 2 === 0 ? "global" : "trainer",
      latestVersionId: uuid(230 + i),
      latestVersionNumber: 1,
      updatedAt: NOW,
    });
    api.listCheckinFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [0, 1, 2].map(formItem),
    });
    api.listOnboardingFormTemplates.mockResolvedValue({
      nextCursor: null,
      items: [0, 1, 2].map(formItem),
    });
    api.listExerciseLibrary.mockResolvedValue({ items: [], nextCursor: null });
    for (const [tab, expected] of [
      ["workouts", "Plan template 0"],
      ["diets", "Plan template 1"],
      ["full-plans", "Plan template 2"],
      ["checkins", "Form 0"],
      ["onboarding", "Form 1"],
      ["libraries/exercises", "Exercises"],
    ] as const) {
      const view = render(
        <MemoryRouter initialEntries={[`/templates/${tab}`]}>
          <Routes>
            <Route path="/templates/*" element={<TemplatesHub />} />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() => expect(view.container.textContent).toContain(expected));
      await new Promise((r) => setTimeout(r, 0));
      expect(rawEnumHits(view.container), tab).toEqual([]);
      cleanup();
    }
  });

  it("Exception drawer: the meal deviation kind reads as a label", async () => {
    stage1.getResponsiveness.mockRejectedValue(new Error("not needed"));
    api.getClientWorkspace.mockResolvedValue({
      header: { traineeDisplayName: "Rohan Mehta", clientWhatsappE164: null },
    });
    api.getMealAssignment.mockResolvedValue({
      id: uuid(100),
      mealName: "Lunch",
      windowStartsAt: NOW,
      windowEndsAt: NOW,
      prescription: { items: [] },
      compliance: null,
    });
    for (const kind of mealDeviationKindSchema.options) {
      api.getException.mockResolvedValue({
        id: uuid(110),
        coachingRelationshipId: uuid(111),
        type: "meal_deviation",
        severity: "attention",
        status: "active",
        ruleVersion: "v1",
        sourceEntityType: "meal_assignment",
        sourceEntityId: uuid(100),
        summary: "Lunch changed",
        details: { deviationKind: kind },
        detectedAt: NOW,
        activatedAt: NOW,
        acknowledgedAt: null,
        resolvedAt: null,
        closedReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        actions: [],
      });
      const view = render(
        <MemoryRouter>
          <ExceptionDrawer exceptionId={uuid(110)} onClose={() => undefined} />
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(document.body.textContent).toContain("Logged: Changed ·"),
      );
      const label = ENTRIES.find(
        (e) => e.namespace === "meal_deviation_kind" && e.value === kind,
      )!.label;
      expect(document.body.textContent).toContain(`Logged: Changed · ${label}`);
      expect(rawEnumHits(document.body), kind).toEqual([]);
      view.unmount();
      cleanup();
    }
  });
});
