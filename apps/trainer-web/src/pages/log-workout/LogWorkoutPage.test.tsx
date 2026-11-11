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
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";

const REL = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-11-04T06:30:00.000Z"); // Wed 4 Nov, 12:00 pm IST

const api = vi.hoisted(() => ({
  listWorkoutAssignments: vi.fn(),
  getWorkoutAssignment: vi.fn(),
  getWorkoutExecution: vi.fn(),
  logClientWorkout: vi.fn(),
  editClientWorkout: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kolkata" } }),
}));

import { LogWorkoutCreateRoute, LogWorkoutEditRoute } from "./LogWorkoutPage";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EX_BENCH = id(101);
const EX_ROW = id(102);

function workoutDay(): WorkoutAssignment["workoutDay"] {
  return {
    id: id(50),
    order: 1,
    name: "Upper body A",
    required: true,
    exercises: [
      {
        id: EX_BENCH,
        order: 1,
        name: "Bench press",
        instructions: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        equipment: [],
        difficulty: null,
        setTargets: [1, 2, 3].map((order) => ({
          id: id(110 + order),
          order,
          reps: 8,
          loadLabel: "40 kg",
          rpe: null,
        })),
      },
      {
        id: EX_ROW,
        order: 2,
        name: "Seated cable row",
        instructions: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        equipment: [],
        difficulty: null,
        setTargets: [1, 2].map((order) => ({
          id: id(120 + order),
          order,
          reps: 12,
          loadLabel: "Bodyweight",
          rpe: null,
        })),
      },
    ],
  };
}

function assignment(
  localDate: string,
  n: number,
  execution: WorkoutAssignment["execution"] = null,
): WorkoutAssignment {
  return {
    id: id(n),
    coachingRelationshipId: REL,
    planId: id(1),
    planVersionId: id(2),
    workoutDayId: id(50),
    workoutDayName: "Upper body A",
    localDate,
    windowStartsAt: `${localDate}T00:00:00.000Z`,
    windowEndsAt: `${localDate}T23:59:00.000Z`,
    status: execution ? "completed" : "assigned",
    scheduleStatus: "scheduled",
    workoutDay: workoutDay(),
    execution,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  } as WorkoutAssignment;
}

function execution(overrides: Partial<WorkoutExecution> = {}): WorkoutExecution {
  const day = workoutDay();
  return {
    id: id(300),
    assignmentId: id(11),
    coachingRelationshipId: REL,
    planVersionId: id(2),
    traineeUserId: id(4),
    status: "completed",
    recordVersion: 3,
    startedAt: "2026-11-02T05:00:00.000Z",
    pausedAt: null,
    completedAt: "2026-11-02T05:50:00.000Z",
    sessionRpe: null,
    requireSessionRpe: false,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    exercises: day.exercises.map((exercise, e) => ({
      id: id(400 + e),
      workoutExecutionId: id(300),
      exerciseId: exercise.id,
      name: exercise.name,
      order: exercise.order,
      status: "completed" as const,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      sets: exercise.setTargets.map((target) => ({
        id: id(500 + e * 10 + target.order),
        exerciseExecutionId: id(400 + e),
        setTargetId: target.id,
        order: target.order,
        status: "completed" as const,
        prescribedReps: target.reps,
        prescribedLoadLabel: target.loadLabel,
        actualReps: target.reps,
        actualLoadLabel: target.loadLabel,
        completedAt: "2026-11-02T05:30:00.000Z",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      })),
    })),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage(
  path: string,
  opts?: { ended?: boolean; online?: boolean },
) {
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
          <Route path="log-workout" element={<LogWorkoutCreateRoute />} />
          <Route path="log-workout/:assignmentId" element={<LogWorkoutCreateRoute />} />
          <Route path="workouts/:executionId/edit" element={<LogWorkoutEditRoute />} />
          <Route path="activity" element={<Where />} />
          <Route path="overview" element={<p>overview route</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listWorkoutAssignments.mockResolvedValue({
    items: [assignment("2026-11-02", 11), assignment("2026-11-03", 12)],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("trainer log workout (create)", () => {
  it("prefills from the plan and saves one log with one idempotency key", async () => {
    api.logClientWorkout.mockResolvedValue(execution());
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);

    expect(await screen.findByText("Planned for Mon 2 Nov · 2 exercises")).toBeTruthy();
    const load = screen.getByLabelText("Bench press set 2 load in kg") as HTMLInputElement;
    expect(load.value).toBe("40");
    fireEvent.change(load, { target: { value: "42.5" } });
    fireEvent.change(screen.getByLabelText("Bench press set 3 reps"), {
      target: { value: "7" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalledTimes(1));
    const [assignmentId, body, key] = api.logClientWorkout.mock.calls[0]!;
    expect(assignmentId).toBe(id(11));
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    const bench = body.exercises[0];
    expect(bench.sets[1]).toMatchObject({ status: "completed", actualLoadKg: 42.5, actualReps: 8 });
    expect(bench.sets[2]).toMatchObject({ actualReps: 7, actualLoadKg: 40 });
    // The plan's Bodyweight label prefills the toggle and sends bodyweight, not kg.
    expect(body.exercises[1].sets[0]).toMatchObject({ bodyweight: true });
    expect(body.exercises[1].sets[0].actualLoadKg).toBeUndefined();
    expect(Date.parse(body.performedAt)).toBeLessThan(NOW.getTime());
    expect(new Date(body.performedAt).toISOString().slice(0, 10)).toBe("2026-11-02");

    expect((await screen.findByTestId("where")).textContent).toBe(
      `/clients/${REL}/activity?type=workout&item=workout:${id(11)}`,
    );
  });

  it("shows Not saved on a network failure, keeps entries, and retries with the same key", async () => {
    api.logClientWorkout
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(execution());
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.change(screen.getByLabelText("Bench press set 2 load in kg"), {
      target: { value: "42.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));

    const banner = await screen.findByTestId("log-workout-not-saved");
    expect(banner.textContent).toContain("We couldn’t reach FitBud, so nothing was saved.");
    expect(
      (screen.getByLabelText("Bench press set 2 load in kg") as HTMLInputElement).value,
    ).toBe("42.5");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalledTimes(2));
    expect(api.logClientWorkout.mock.calls[1]![2]).toBe(api.logClientWorkout.mock.calls[0]![2]);
  });

  it("does not blame the connection for a non-network failure", async () => {
    api.logClientWorkout.mockRejectedValue(new Error("zod disagreement"));
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    const banner = await screen.findByTestId("log-workout-not-saved");
    expect(banner.textContent).not.toContain("reach FitBud");
    expect(banner.textContent).not.toContain("zod disagreement");
  });

  it("shows the API's own message for an API error", async () => {
    api.logClientWorkout.mockRejectedValue(
      new ApiClientError({
        code: "BACKDATE_LIMIT",
        message: "A trainer log must be dated within the last 7 days and not in the future.",
        requestId: "r1",
        status: 422,
      }),
    );
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    const banner = await screen.findByTestId("log-workout-not-saved");
    expect(banner.textContent).toContain("within the last 7 days");
  });

  it("sends a skipped set without values", async () => {
    api.logClientWorkout.mockResolvedValue(execution());
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.click(screen.getByLabelText("Bench press set 3 done"));
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalled());
    expect(api.logClientWorkout.mock.calls[0]![1].exercises[0].sets[2]).toEqual({
      setTargetId: id(113),
      status: "skipped",
    });
  });

  it("offers only the last 7 days and says 29 Oct is the earliest", async () => {
    renderPage(`/clients/${REL}/log-workout`);
    await screen.findByTestId("log-workout-page");
    const chips = screen.getAllByRole("button", { pressed: false }).filter((b) =>
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/.test(b.getAttribute("aria-label") ?? ""),
    );
    const labels = [
      ...chips.map((b) => b.getAttribute("aria-label")),
      ...screen
        .getAllByRole("button", { pressed: true })
        .map((b) => b.getAttribute("aria-label")),
    ];
    expect(labels).toHaveLength(8);
    expect(labels).toContain("Wed 28 Oct");
    expect(labels).not.toContain("Tue 27 Oct");
    expect(labels).not.toContain("Thu 5 Nov");

    fireEvent.click(screen.getByRole("button", { name: "Wed 28 Oct" }));
    expect((await screen.findByTestId("log-workout-date-limit")).textContent).toContain(
      "Wed 28 Oct is the earliest",
    );
    expect(screen.getByTestId("log-workout-nothing-planned").textContent).toContain(
      "Nothing planned on Wed 28 Oct",
    );
    expect(api.logClientWorkout).not.toHaveBeenCalled();
  });

  it("lets the trainer choose a planned workout from another day", async () => {
    renderPage(`/clients/${REL}/log-workout`);
    await screen.findByTestId("log-workout-page");
    fireEvent.click(screen.getByRole("button", { name: "Wed 28 Oct" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose a workout" }));
    fireEvent.click(screen.getByRole("button", { name: /Upper body A\s*Planned Tue 3 Nov/ }));
    expect(await screen.findByText("Planned for Tue 3 Nov · 2 exercises")).toBeTruthy();
  });

  it("logs a workout chosen from another day on the selected date, not its planned date", async () => {
    api.logClientWorkout.mockResolvedValue(execution());
    renderPage(`/clients/${REL}/log-workout`);
    await screen.findByTestId("log-workout-page");
    fireEvent.click(screen.getByRole("button", { name: "Wed 28 Oct" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose a workout" }));
    fireEvent.click(screen.getByRole("button", { name: /Upper body A\s*Planned Tue 3 Nov/ }));
    await screen.findByText("Planned for Tue 3 Nov · 2 exercises");
    // The date strip still says 28 Oct.
    expect(screen.getByRole("button", { name: "Wed 28 Oct" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalledTimes(1));
    expect(api.logClientWorkout.mock.calls[0]![0]).toBe(id(12));
    expect(new Date(api.logClientWorkout.mock.calls[0]![1].performedAt).toISOString().slice(0, 10)).toBe(
      "2026-10-28",
    );
  });

  it("lets the trainer pick which workout to log when two are planned on one day", async () => {
    api.logClientWorkout.mockResolvedValue(execution());
    api.listWorkoutAssignments.mockResolvedValue({
      items: [assignment("2026-11-02", 11), { ...assignment("2026-11-02", 13), workoutDayName: "Lower body A" }],
      nextCursor: null,
    });
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.click(screen.getByRole("button", { name: "Choose a workout" }));
    fireEvent.click(screen.getByRole("button", { name: /Lower body A\s*Planned Mon 2 Nov/ }));
    expect((await screen.findByRole("heading", { name: "Lower body A" })).textContent).toBe(
      "Lower body A",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalled());
    expect(api.logClientWorkout.mock.calls[0]![0]).toBe(id(13));
  });

  describe("retry after a failed save", () => {
    beforeEach(() => {
      api.listWorkoutAssignments.mockResolvedValue({
        items: [assignment("2026-11-04", 14)],
        nextCursor: null,
      });
    });

    it("resends the same key and the identical body, performedAt included, for a today-dated log", async () => {
      api.logClientWorkout
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(execution());
      renderPage(`/clients/${REL}/log-workout/${id(14)}`);
      await screen.findByText("Planned for Wed 4 Nov · 2 exercises");
      fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
      await screen.findByTestId("log-workout-not-saved");
      // Time passes between the attempts; "now" must not leak into the retry.
      vi.setSystemTime(new Date(NOW.getTime() + 90_000));
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalledTimes(2));
      const [, firstBody, firstKey] = api.logClientWorkout.mock.calls[0]!;
      const [, secondBody, secondKey] = api.logClientWorkout.mock.calls[1]!;
      expect(firstBody.performedAt).toBe(NOW.toISOString());
      expect(secondKey).toBe(firstKey);
      expect(secondBody).toEqual(firstBody);
    });

    it("renews the key and the body once the form changes after a failure", async () => {
      api.logClientWorkout
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(execution());
      renderPage(`/clients/${REL}/log-workout/${id(14)}`);
      await screen.findByText("Planned for Wed 4 Nov · 2 exercises");
      fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
      await screen.findByTestId("log-workout-not-saved");
      fireEvent.change(screen.getByLabelText("Bench press set 1 reps"), {
        target: { value: "9" },
      });
      vi.setSystemTime(new Date(NOW.getTime() + 90_000));
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(api.logClientWorkout).toHaveBeenCalledTimes(2));
      expect(api.logClientWorkout.mock.calls[1]![2]).not.toBe(
        api.logClientWorkout.mock.calls[0]![2],
      );
      expect(api.logClientWorkout.mock.calls[1]![1].exercises[0].sets[0].actualReps).toBe(9);
    });

    it("offers Reload, then Edit, when the workout was already logged", async () => {
      api.logClientWorkout.mockRejectedValue(
        new ApiClientError({
          code: "WORKOUT_ALREADY_FINISHED",
          message: "This assignment already has a finished execution.",
          requestId: "r3",
          status: 409,
        }),
      );
      renderPage(`/clients/${REL}/log-workout/${id(14)}`);
      await screen.findByText("Planned for Wed 4 Nov · 2 exercises");
      fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
      await screen.findByTestId("log-workout-not-saved");
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      api.listWorkoutAssignments.mockResolvedValue({
        items: [
          assignment("2026-11-04", 14, {
            id: id(300),
            status: "completed",
          } as WorkoutAssignment["execution"]),
        ],
        nextCursor: null,
      });
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
      expect(await screen.findByTestId("log-workout-already")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Edit workout" }).getAttribute("href")).toBe(
        `/clients/${REL}/workouts/${id(300)}/edit`,
      );
      expect(api.logClientWorkout).toHaveBeenCalledTimes(1);
    });
  });

  it("offers Edit, not a second log, for a finished workout", async () => {
    api.listWorkoutAssignments.mockResolvedValue({
      items: [
        assignment("2026-11-02", 11, {
          id: id(300),
          status: "completed",
        } as WorkoutAssignment["execution"]),
      ],
      nextCursor: null,
    });
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    const note = await screen.findByTestId("log-workout-already");
    expect(note.textContent).toContain("already logged");
    expect(screen.getByRole("link", { name: "Edit workout" }).getAttribute("href")).toBe(
      `/clients/${REL}/workouts/${id(300)}/edit`,
    );
  });

  it("rejects an out-of-range load before sending anything", async () => {
    renderPage(`/clients/${REL}/log-workout/${id(11)}`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.change(screen.getByLabelText("Bench press set 1 load in kg"), {
      target: { value: "9000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect((await screen.findByTestId("log-workout-problem")).textContent).toContain(
      "Load is kg",
    );
    expect(api.logClientWorkout).not.toHaveBeenCalled();
  });

  it("is read-only for an ended client", async () => {
    renderPage(`/clients/${REL}/log-workout`, { ended: true });
    expect(await screen.findByText("Coaching with Vikram has ended")).toBeTruthy();
    expect(screen.getByText(/Ended clients are read-only/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Vikram’s page" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save workout" })).toBeNull();
    expect(api.listWorkoutAssignments).not.toHaveBeenCalled();
  });
});

describe("trainer edit workout", () => {
  beforeEach(() => {
    api.getWorkoutExecution.mockResolvedValue(execution());
    api.getWorkoutAssignment.mockResolvedValue(assignment("2026-11-02", 11));
  });

  it("prefills the logged sets and sends only the changed set with the record version", async () => {
    api.editClientWorkout.mockResolvedValue(execution({ recordVersion: 4 }));
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    expect(screen.getByRole("heading", { name: "Edit workout" })).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save workout" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Bench press set 2 load in kg"), {
      target: { value: "42.5" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.editClientWorkout).toHaveBeenCalledTimes(1));
    expect(api.editClientWorkout).toHaveBeenCalledWith(id(300), {
      recordVersion: 3,
      sets: [
        {
          setExecutionId: id(502),
          status: "completed",
          actualReps: 8,
          actualLoadKg: 42.5,
        },
      ],
    });
    expect((await screen.findByTestId("where")).textContent).toContain("item=workout:");
  });

  it("after a version conflict offers Reload, refetches, and saves with the fresh recordVersion", async () => {
    api.editClientWorkout
      .mockRejectedValueOnce(
        new ApiClientError({
          code: "VERSION_CONFLICT",
          message: "This entry changed since you opened it.",
          requestId: "r4",
          status: 409,
        }),
      )
      .mockResolvedValueOnce(execution({ recordVersion: 5 }));
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.change(screen.getByLabelText("Bench press set 1 reps"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await screen.findByTestId("log-workout-not-saved");
    expect(api.editClientWorkout.mock.calls[0]![1].recordVersion).toBe(3);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    // Someone else saved version 4 meanwhile.
    api.getWorkoutExecution.mockResolvedValue(execution({ recordVersion: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect((await screen.findByTestId("log-workout-notice")).textContent).toContain(
      "unsaved changes were discarded",
    );
    expect(api.getWorkoutExecution).toHaveBeenCalledTimes(2);
    // The discarded edit is gone: the field shows the saved value again.
    expect((screen.getByLabelText("Bench press set 1 reps") as HTMLInputElement).value).toBe("8");
    fireEvent.change(screen.getByLabelText("Bench press set 2 reps"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.editClientWorkout).toHaveBeenCalledTimes(2));
    expect(api.editClientWorkout.mock.calls[1]![1].recordVersion).toBe(4);
  });

  it("moves the entry to another day through performedAt", async () => {
    api.editClientWorkout.mockResolvedValue(execution());
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.click(screen.getByRole("button", { name: "Sun 1 Nov" }));
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(api.editClientWorkout).toHaveBeenCalled());
    const body = api.editClientWorkout.mock.calls[0]![1];
    expect(body.sets).toBeUndefined();
    expect(new Date(body.performedAt).toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("shows the version conflict message and keeps the edit", async () => {
    api.editClientWorkout.mockRejectedValue(
      new ApiClientError({
        code: "VERSION_CONFLICT",
        message: "This entry changed since you opened it.",
        requestId: "r2",
        status: 409,
      }),
    );
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`);
    await screen.findByText("Planned for Mon 2 Nov · 2 exercises");
    fireEvent.change(screen.getByLabelText("Bench press set 1 reps"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect((await screen.findByTestId("log-workout-not-saved")).textContent).toContain(
      "This entry changed since you opened it.",
    );
    expect((screen.getByLabelText("Bench press set 1 reps") as HTMLInputElement).value).toBe(
      "9",
    );
  });

  it("does not let an entry older than 7 days be saved", async () => {
    api.getWorkoutExecution.mockResolvedValue(
      execution({
        startedAt: "2026-10-20T05:00:00.000Z",
        completedAt: "2026-10-20T05:50:00.000Z",
      }),
    );
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`);
    expect((await screen.findByTestId("log-workout-date-limit")).textContent).toContain(
      "Older workouts can’t be changed",
    );
    fireEvent.change(screen.getByLabelText("Bench press set 1 reps"), {
      target: { value: "9" },
    });
    expect((screen.getByRole("button", { name: "Save workout" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("is read-only for an ended client", async () => {
    renderPage(`/clients/${REL}/workouts/${id(300)}/edit`, { ended: true });
    expect(await screen.findByText("Coaching with Vikram has ended")).toBeTruthy();
    expect(api.getWorkoutExecution).not.toHaveBeenCalled();
  });
});
