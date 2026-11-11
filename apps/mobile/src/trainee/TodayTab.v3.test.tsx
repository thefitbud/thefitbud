/**
 * Today v3 (Z9-1): kcal ring, macro bars and Workout / Meals / Steps chips for
 * an empty and a partly logged day. happy-dom + react-native-web: proves the
 * text, roles and labels, not layout (the Expo web captures do that).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  mealAssignmentSchema,
  workoutAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor, fireEvent, act } from "../test/render";
import { localDateInTimezone } from "../lib/dates";

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);

const relationship = coachingRelationshipSchema.parse({
  id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const livePlan = effectivePlanResponseSchema.parse({
  plan: {
    id: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    coachingRelationshipId: relationship.id,
    title: "Strength block",
    createdAt: "2026-09-01T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
  version: {
    id: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    versionNumber: 3,
    status: "effective",
    recordVersion: 4,
    content: {
      workoutDays: [
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", order: 1, name: "Lower body B", exercises: [] },
      ],
      mealPrescriptions: [],
    },
    creationSource: "blank",
    sourceTemplateId: null,
    publishedAt: "2026-10-28T06:30:00.000Z",
    effectiveFrom: "2026-10-28T06:30:00.000Z",
    effectiveTo: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
});

function meal(
  n: number,
  name: string,
  status: MealAssignment["status"],
): MealAssignment {
  const id = `00000000-0000-4000-8000-0000000001${n}0`;
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: relationship.id,
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    mealPrescriptionId: `00000000-0000-4000-8000-0000000002${n}0`,
    mealName: name,
    localDate: TODAY,
    windowStartsAt: `${TODAY}T0${n}:00:00.000Z`,
    windowEndsAt: `${TODAY}T0${n}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: `00000000-0000-4000-8000-0000000003${n}0`,
      order: n,
      name,
      mealType: "lunch",
      photoRequired: false,
      items: [
        {
          name: "Vegetable poha",
          portionLabel: "1 bowl",
          calories: 400,
          proteinGrams: 20,
          carbsGrams: 60,
          fatGrams: 10,
        },
      ],
      instructions: null,
      scheduleHint: null,
    },
    compliance: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
  });
}

const workoutAssignment = workoutAssignmentSchema.parse({
  id: "00000000-0000-4000-8000-000000000501",
  coachingRelationshipId: relationship.id,
  planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
  planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
  workoutDayId: "7a8b9c0d-1e2f-4304-9516-273849506172",
  workoutDayName: "Lower body B",
  localDate: TODAY,
  windowStartsAt: `${TODAY}T13:00:00.000Z`,
  windowEndsAt: `${TODAY}T15:00:00.000Z`,
  status: "assigned",
  workoutDay: {
    id: "7a8b9c0d-1e2f-4304-9516-273849506172",
    order: 1,
    name: "Lower body B",
    exercises: [1, 2].map((n) => ({
      id: `00000000-0000-4000-8000-00000000060${n}`,
      order: n,
      name: n === 1 ? "Back squat" : "Romanian deadlift",
      instructions: null,
      setTargets: [1, 2, 3].map((o) => ({
        id: `00000000-0000-4000-8000-0000000007${n}${o}`,
        order: o,
        reps: 8,
        loadLabel: null,
        rpe: null,
      })),
    })),
  },
  execution: null,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
});

let failDay = false;
let failOutbox = false;
let holdDay: Promise<void> | null = null;
let outboxRows: { status: string; payloadJson: string }[] = [];
let workouts: unknown[] = [];
let meals: MealAssignment[] = [];
let stepsToday: unknown = { localDate: TODAY, steps: null, target: 8000 };
let notifications: unknown[] = [];
let coachNoteItems: unknown[] = [];
let reminderStatus: unknown = null;
let checkinItems: unknown[] = [];
const markRead = vi.fn(async () => null);
const resume = vi.fn(async () => ({ mode: "normal", pausedUntil: null }));

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "listWorkoutAssignments")
        return async () => {
          if (failDay) throw new Error("offline");
          return { items: workouts, nextCursor: null };
        };
      if (key === "listMealAssignments")
        return async () => {
          if (holdDay) await holdDay;
          if (failDay) throw new Error("offline");
          return { items: meals, nextCursor: null };
        };
      if (key === "listCheckins")
        return async () => ({ items: checkinItems, nextCursor: null });
      if (key === "listMeCoachNotes")
        return async () => ({ items: coachNoteItems });
      if (key === "listNotifications")
        return async () => ({ items: notifications, nextCursor: null });
      if (key === "getReminderStatus") return async () => reminderStatus;
      if (key === "markNotificationRead") return markRead;
      if (key === "resumeReminders") return resume;
      if (key === "getStepsToday") return async () => stepsToday;
      if (key === "then") return undefined;
      return async () => null;
    },
  },
);

const auth = mockAuth({
  api,
  me: {
    id: relationship.traineeUserId,
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: TIME_ZONE,
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: vi.fn(async () => undefined),
      store: {
        upsertLocal: vi.fn(),
        listLocal: vi.fn(async () => []),
        listOutbox: vi.fn(async () => {
          if (failOutbox) throw new Error("storage");
          return outboxRows;
        }),
      },
      enqueue: vi.fn(),
    }),
  };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { TodayTab, effectivePlanStateFor } = await import("./TodayTab");
const fgModule = await import("./notifications/ForegroundBanner");
const { setForegroundBannerActive } = await import("./today/bannerSlot");

const completedWorkout = workoutAssignmentSchema.parse({
  ...workoutAssignment,
  status: "completed",
  execution: {
    id: "00000000-0000-4000-8000-000000000801",
    assignmentId: workoutAssignment.id,
    coachingRelationshipId: relationship.id,
    planVersionId: workoutAssignment.planVersionId,
    traineeUserId: relationship.traineeUserId,
    status: "completed",
    recordVersion: 3,
    startedAt: `${TODAY}T13:00:00.000Z`,
    pausedAt: null,
    completedAt: `${TODAY}T13:52:00.000Z`,
    sessionRpe: null,
    requireSessionRpe: false,
    createdAt: `${TODAY}T13:00:00.000Z`,
    updatedAt: `${TODAY}T13:52:00.000Z`,
  },
});

let openOverlay = vi.fn();

let onSelectDate = vi.fn();

function renderToday(selectedDate: string = TODAY) {
  return render(
    <TodayTab
      relationship={relationship}
      planState={effectivePlanStateFor(livePlan)}
      planCacheError={null}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      onStartWorkout={() => undefined}
      onOpenDiet={() => undefined}
      onOpenCheckin={() => undefined}
      onRefreshPlan={() => undefined}
      onOpenOverlay={openOverlay}
    />,
  );
}

beforeEach(() => {
  openOverlay = vi.fn();
  onSelectDate = vi.fn();
  holdDay = null;
  notifications = [];
  coachNoteItems = [];
  reminderStatus = null;
  checkinItems = [];
  markRead.mockClear();
  resume.mockClear();
  failOutbox = false;
  outboxRows = [];
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  failDay = false;
  meals = [];
  workouts = [];
  stepsToday = { localDate: TODAY, steps: null, target: 8000 };
});

describe("Today v3 summary", () => {
  it("empty day: zero ring, zero bars, Meals 0 of N, Set up steps", async () => {
    meals = [
      meal(1, "Early morning", "pending"),
      meal(2, "Breakfast", "pending"),
    ];
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByTestId("today-summary")).toBeTruthy();
    });
    expect(screen.getByLabelText("0 of 800 kcal")).toBeTruthy();
    expect(screen.getByLabelText("Protein 0 of 40 g")).toBeTruthy();
    expect(screen.getByLabelText("Meals 0 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Workout: rest day")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps: set up steps")).toBeTruthy();
    });
    expect(view.container.textContent).not.toMatch(/%|\bleft\b/);
  });

  it("partial day: logged kcal and macros against the plan, server steps", async () => {
    meals = [
      meal(1, "Early morning", "confirmed"),
      meal(2, "Breakfast", "pending"),
    ];
    stepsToday = { localDate: TODAY, steps: 6240, target: 8000 };
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("400 of 800 kcal")).toBeTruthy();
    });
    expect(screen.getByLabelText("Protein 20 of 40 g")).toBeTruthy();
    expect(screen.getByLabelText("Meals 1 of 2")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps 6,240 of 8,000")).toBeTruthy();
    });
    expect(view.container.textContent).not.toMatch(/%|\bleft\b/);
  });

  it("a failed steps read says unavailable, not 'set up steps'", async () => {
    stepsToday = null;
    meals = [meal(1, "Early morning", "pending")];
    renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps unavailable")).toBeTruthy();
    });
  });

  it("scheduled workout: chip reads 0 of 1 and the workout leads as the hero", async () => {
    workouts = [workoutAssignment];
    meals = [meal(1, "Early morning", "pending")];
    renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Workout 0 of 1")).toBeTruthy();
    });
    expect(screen.getByText("Lower body B")).toBeTruthy();
    expect(
      screen.getByText(/^2 exercises(?: · about \d+ min)? · 6 sets$/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Start workout")).toBeTruthy();
  });

  it("meals are a flat list with a logged count and a status chip per row", async () => {
    meals = [
      meal(1, "Early morning", "confirmed"),
      meal(2, "Breakfast", "pending"),
    ];
    renderToday();
    await waitFor(() => {
      expect(screen.getByText("1 of 2 logged ›")).toBeTruthy();
    });
    expect(screen.getByText("Logged")).toBeTruthy();
  });
});

describe("Today v3 done and rest states", () => {
  it("done day: green done chips, done card with time and duration", async () => {
    workouts = [completedWorkout];
    meals = [meal(1, "Early morning", "confirmed")];
    stepsToday = { localDate: TODAY, steps: 8420, target: 8000 };
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Workout 1 of 1, done")).toBeTruthy();
    });
    expect(screen.getByLabelText("Meals 1 of 1, done")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps 8,420 of 8,000, done")).toBeTruthy();
    });
    expect(screen.getByText("Done · 7:22 pm")).toBeTruthy();
    expect(screen.getByText("Lower body B")).toBeTruthy();
    expect(screen.getByText("2 exercises · 52 min")).toBeTruthy();
    expect(screen.queryByLabelText("Start workout")).toBeNull();
    expect(screen.queryByText(/Rest day/)).toBeNull();
    expect(view.container.textContent).not.toMatch(/%|\bleft\b/);
  });

  it("partly done day: chips not yet complete carry no done state", async () => {
    workouts = [completedWorkout];
    meals = [
      meal(1, "Early morning", "confirmed"),
      meal(2, "Breakfast", "pending"),
    ];
    renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Workout 1 of 1, done")).toBeTruthy();
    });
    expect(screen.getByLabelText("Meals 1 of 2")).toBeTruthy();
  });

  it("rest day: neutral chip, rest card with the next workout, header says rest day", async () => {
    meals = [meal(1, "Early morning", "confirmed")];
    const tomorrow = new Date(`${TODAY}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const nextDate = tomorrow.toISOString().slice(0, 10);
    workouts = [
      {
        ...workoutAssignment,
        id: "00000000-0000-4000-8000-000000000502",
        localDate: nextDate,
        windowStartsAt: `${nextDate}T13:00:00.000Z`,
        windowEndsAt: `${nextDate}T15:00:00.000Z`,
      },
    ];
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByText("Recovery is part of the plan")).toBeTruthy();
    });
    expect(screen.getByLabelText("Workout: rest day")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/^Next: Lower body B · \w{3} \d{1,2} \w{3}, 6:30 pm$/)).toBeTruthy();
    });
    // The plan-loaded marker stays; on a rest day it announces the rest day.
    const header = screen.getByText("Today's workout");
    expect(header.getAttribute("aria-label")).toBe("Today's workout: rest day");
    expect(view.container.textContent).not.toMatch(/%|\bleft\b|\d{4}-\d{2}-\d{2}/);
  });

  it("rest day leads with the rest card even with a meal due; no meal hero", async () => {
    meals = [meal(1, "Early morning", "pending")];
    renderToday();
    await waitFor(() => {
      expect(screen.getByText("Recovery is part of the plan")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Eaten as planned")).toBeNull();
    expect(screen.getByText("Early morning")).toBeTruthy();
  });

  it("rest day with nothing scheduled omits the Next line", async () => {
    renderToday();
    await waitFor(() => {
      expect(screen.getByText("Recovery is part of the plan")).toBeTruthy();
    });
    expect(screen.queryByText(/^Next:/)).toBeNull();
  });

  it("Steps chip opens the steps setup screen", async () => {
    const { fireEvent } = await import("../test/render");
    renderToday();
    const chip = await screen.findByLabelText("Steps: set up steps");
    fireEvent.click(chip);
    expect(openOverlay).toHaveBeenCalledWith({ screen: "steps_settings" });
  });

  it("scheduled workout keeps the hidden header text without the rest-day label", async () => {
    workouts = [workoutAssignment];
    renderToday();
    const header = await screen.findByText("Today's workout");
    expect(header.getAttribute("aria-label")).toBeNull();
  });

  it("a failed day load does not read as a rest day", async () => {
    failDay = true;
    renderToday();
    await waitFor(() => {
      expect(screen.getByText(/Couldn't refresh/)).toBeTruthy();
    });
    expect(screen.queryByText("Recovery is part of the plan")).toBeNull();
    expect(screen.queryByText("Rest day")).toBeNull();
    expect(screen.queryByLabelText("Workout: rest day")).toBeNull();
    const header = screen.getByText("Today's workout");
    expect(header.getAttribute("aria-label")).toBeNull();
  });

  it("Next line skips missed workouts", async () => {
    const tomorrow = new Date(`${TODAY}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const d = tomorrow.toISOString().slice(0, 10);
    workouts = [{ ...workoutAssignment, id: "00000000-0000-4000-8000-000000000503", localDate: d, windowStartsAt: `${d}T13:00:00.000Z`, windowEndsAt: `${d}T15:00:00.000Z`, status: "missed" }];
    renderToday();
    await waitFor(() => {
      expect(screen.getByText("Recovery is part of the plan")).toBeTruthy();
    });
    expect(screen.queryByText(/^Next:/)).toBeNull();
  });
});

function dayBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function queuedRow(n: number, status = "pending") {
  return {
    status,
    payloadJson: JSON.stringify({
      assignmentId: `00000000-0000-4000-8000-0000000001${n}0`,
      body: { photoIntent: null },
    }),
  };
}

describe("Today v3 past day, loading and offline", () => {
  const PAST = dayBefore(TODAY, 2);

  it("past day: banner with the date and Back to today, no workout card", async () => {
    workouts = [
      { ...workoutAssignment, localDate: PAST, windowStartsAt: `${PAST}T13:00:00.000Z`, windowEndsAt: `${PAST}T15:00:00.000Z` },
    ];
    meals = [{ ...meal(1, "Breakfast", "overdue"), localDate: PAST }];
    renderToday(PAST);
    const banner = await screen.findByLabelText(/^Past day\./);
    expect(banner.textContent).toMatch(/you can still log it/);
    expect(banner.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(screen.queryByText("Start workout")).toBeNull();
    expect(screen.queryByText("Today's workout")).toBeNull();
    screen.getByRole("button", { name: "Back to today" }).click();
    expect(onSelectDate).toHaveBeenCalledWith(TODAY);
  });

  it("today has no past banner", async () => {
    renderToday();
    await screen.findByText("Meals");
    expect(screen.queryByText("Back to today")).toBeNull();
  });

  it("loading: skeleton in place of the cards, gone once the day loads", async () => {
    let release: () => void = () => undefined;
    holdDay = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderToday();
    await screen.findByLabelText("Loading today");
    expect(screen.queryByLabelText("Open diet")).toBeNull();
    expect(screen.queryByText("Rest day")).toBeNull();
    release();
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading today")).toBeNull();
    });
    expect(screen.getByLabelText("Open diet")).toBeTruthy();
  });

  it("offline with 1 log queued says 1 log waiting to send", async () => {
    failDay = true;
    outboxRows = [queuedRow(1)];
    renderToday();
    await screen.findByText("1 log waiting to send");
  });

  it("offline with 3 logs queued says 3 logs waiting to send; failed rows do not count", async () => {
    failDay = true;
    outboxRows = [queuedRow(1), queuedRow(2), queuedRow(3, "in_flight"), queuedRow(4, "rejected")];
    renderToday();
    await screen.findByText("3 logs waiting to send");
  });

  it("offline with nothing queued keeps the saved-on-phone line", async () => {
    failDay = true;
    renderToday();
    await screen.findByText("Saved on phone · showing last sync");
    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });

  it("device offline: queued meal row carries a Waiting to send chip", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    meals = [meal(1, "Breakfast", "pending"), meal(2, "Lunch", "pending")];
    outboxRows = [queuedRow(1)];
    renderToday();
    await screen.findByText("1 log waiting to send");
    expect(screen.getAllByLabelText("Waiting to send")).toHaveLength(1);
  });

  it("past completed workout keeps a read-only Done card, no Start workout", async () => {
    workouts = [
      {
        ...completedWorkout,
        localDate: PAST,
        windowStartsAt: `${PAST}T13:00:00.000Z`,
        windowEndsAt: `${PAST}T15:00:00.000Z`,
      },
    ];
    renderToday(PAST);
    await screen.findByLabelText("Workout done: Lower body B");
    expect(screen.queryByText("Start workout")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });

  it("past day: a logged meal reads Logged", async () => {
    meals = [
      { ...meal(1, "Breakfast", "confirmed"), localDate: PAST },
      { ...meal(2, "Lunch", "overdue"), localDate: PAST },
    ];
    renderToday(PAST);
    await screen.findByLabelText(/^Past day\./);
    expect(screen.getAllByText("Logged")).toHaveLength(1);
  });

  it("an unreadable outbox never reads as 0 waiting", async () => {
    failDay = true;
    failOutbox = true;
    renderToday();
    await screen.findByText("Saved on phone · showing last sync");
    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });

  it("many set-level rows for one workout count as one log", async () => {
    failDay = true;
    outboxRows = [1, 2, 3, 4].map((n) => ({
      status: "pending",
      recordId: "00000000-0000-4000-8000-000000000801",
      payloadJson: JSON.stringify({
        executionId: "00000000-0000-4000-8000-000000000801",
        setExecutionId: `00000000-0000-4000-8000-00000000090${n}`,
      }),
    }));
    renderToday();
    await screen.findByText("1 log waiting to send");
  });

  describe("banners (Z9-4)", () => {
    const notif = (type: string, extra: Record<string, unknown> = {}) => ({
      id: "00000000-0000-4000-8000-0000000a0001",
      recipientUserId: relationship.traineeUserId,
      coachingRelationshipId: relationship.id,
      type,
      notificationType: type,
      domainEntityId: "00000000-0000-4000-8000-0000000a0002",
      readAt: null,
      route: "/today",
      ...extra,
    });

    it("shows the reviewed banner (frame 113) and opens the reviewed check-in", async () => {
      notifications = [notif("checkin_reviewed")];
      checkinItems = [
        {
          id: "00000000-0000-4000-8000-0000000a0002",
          localDate: "2026-10-16",
          status: "reviewed",
          review: { outcome: "acknowledged", notes: "Good week." },
        },
      ];
      const onOpenCheckin = vi.fn();
      render(
        <TodayTab
          relationship={relationship}
          planState={effectivePlanStateFor(livePlan)}
          planCacheError={null}
          selectedDate={TODAY}
          onSelectDate={onSelectDate}
          onStartWorkout={() => undefined}
          onOpenDiet={() => undefined}
          onOpenCheckin={onOpenCheckin}
          onRefreshPlan={() => undefined}
          onOpenOverlay={openOverlay}
        />,
      );
      await screen.findByText("Rahul reviewed your check-in");
      screen.getByText("Tap to read the note");
      fireEvent.click(screen.getByRole("button", { name: "Open check-in review" }));
      await waitFor(() => expect(onOpenCheckin).toHaveBeenCalledTimes(1));
      expect(onOpenCheckin.mock.calls[0]![0].id).toBe(
        "00000000-0000-4000-8000-0000000a0002",
      );
      expect(markRead).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000a0001");
      expect(screen.queryByText("Rahul reviewed your check-in")).toBeNull();
    });

    it("one banner at a time: reviewed banner waits while a meal or note banner is up", async () => {
      notifications = [notif("checkin_reviewed")];
      act(() => setForegroundBannerActive(true));
      renderToday();
      await screen.findByLabelText("Open diet");
      expect(screen.queryByText("Rahul reviewed your check-in")).toBeNull();
      act(() => setForegroundBannerActive(false));
      await screen.findByText("Rahul reviewed your check-in");
    });

    it("no reviewed banner without an unread reviewed notification", async () => {
      notifications = [notif("checkin_reviewed", { readAt: "2026-11-01T00:00:00.000Z" })];
      renderToday();
      await screen.findByLabelText("Open diet");
      expect(screen.queryByText("Rahul reviewed your check-in")).toBeNull();
    });

    it("paused reminders card (frame 115) and Turn back on", async () => {
      reminderStatus = {
        mode: "paused",
        pausedUntil: "2026-11-25T10:00:00.000Z",
        pushDeliverable: true,
        trainerDisabled: {},
      };
      renderToday();
      await screen.findByText(/Meal reminders paused/);
      screen.getByText(/paused them until Wed 25 Nov/);
      fireEvent.click(screen.getByRole("button", { name: "Turn back on" }));
      await waitFor(() => expect(resume).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.queryByText(/Meal reminders paused/)).toBeNull(),
      );
    });

    it("no paused card in normal mode", async () => {
      reminderStatus = { mode: "normal", pausedUntil: null };
      renderToday();
      await screen.findByLabelText("Open diet");
      expect(screen.queryByText(/Meal reminders paused/)).toBeNull();
    });

    it("after a review Today shows the next check-in, not the reviewed one (F4c)", async () => {
      checkinItems = [
        {
          id: "00000000-0000-4000-8000-0000000b0001",
          localDate: "2026-10-16",
          status: "reviewed",
          review: { outcome: "acknowledged", notes: "Good week." },
        },
        {
          id: "00000000-0000-4000-8000-0000000b0002",
          localDate: "2026-10-23",
          status: "scheduled",
          review: null,
        },
      ];
      renderToday();
      await screen.findByText("Next check-in Fri 23 Oct");
      expect(screen.queryByText("Acknowledged")).toBeNull();
    });
  });

  describe("foreground banner (Z9-4, frames 29 and 29b)", () => {
    const { ForegroundBanner } = fgModule;
    const renderBanner = () =>
      render(
        <ForegroundBanner
          relationship={relationship}
          coachName="Rahul"
          onOpenMeal={() => undefined}
          onGoToday={() => undefined}
        />,
      );

    it("meal banner: title, foods and tap to log (frame 29)", async () => {
      const due = meal(1, "Breakfast", "pending");
      meals = [
        {
          ...due,
          prescription: { ...due.prescription, localTime: "00:00" },
        } as MealAssignment,
      ];
      renderBanner();
      await screen.findByText("Breakfast isn't logged yet");
      screen.getByText("Vegetable poha · tap to log");
      screen.getByText("FitBud · now");
    });

    it("note banner: no preview when the note does not match the notification", async () => {
      meals = [];
      notifications = [
        {
          id: "00000000-0000-4000-8000-0000000c0001",
          type: "trainer_note_shared",
          domainEntityId: "00000000-0000-4000-8000-0000000c0002",
          readAt: null,
        },
      ];
      coachNoteItems = [
        { id: "00000000-0000-4000-8000-0000000c0099", body: "Other note.", seenAt: null },
      ];
      renderBanner();
      await screen.findByText("Rahul has a note for you");
      await waitFor(() => expect(screen.queryByText(/Other note/)).toBeNull());
    });

    it("note banner: title and the quoted note (frame 29b)", async () => {
      meals = [];
      notifications = [
        {
          id: "00000000-0000-4000-8000-0000000c0001",
          type: "trainer_note_shared",
          domainEntityId: "00000000-0000-4000-8000-0000000c0002",
          readAt: null,
        },
      ];
      coachNoteItems = [
        {
          id: "00000000-0000-4000-8000-0000000c0002",
          body: "Keep protein up on rest days.",
          seenAt: null,
        },
      ];
      renderBanner();
      await screen.findByText("Rahul has a note for you");
      screen.getByText('"Keep protein up on rest days."');
    });
  });
});
