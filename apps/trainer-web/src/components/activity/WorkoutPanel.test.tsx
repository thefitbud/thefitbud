/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { WorkoutPanel } from "./WorkoutPanel";

const REL = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-11-04T06:30:00.000Z");
const TZ = "Asia/Kolkata";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function assignment(localDate: string): WorkoutAssignment {
  return {
    id: id(11),
    coachingRelationshipId: REL,
    planId: id(1),
    planVersionId: id(2),
    workoutDayId: id(50),
    workoutDayName: "Upper body A",
    localDate,
    windowStartsAt: `${localDate}T00:00:00.000Z`,
    windowEndsAt: `${localDate}T23:59:00.000Z`,
    status: "assigned",
    scheduleStatus: "scheduled",
    workoutDay: { id: id(50), order: 1, name: "Upper body A", required: true, exercises: [] },
    execution: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  } as WorkoutAssignment;
}

function execution(overrides: Partial<WorkoutExecution>): WorkoutExecution {
  return {
    id: id(300),
    assignmentId: id(11),
    coachingRelationshipId: REL,
    planVersionId: id(2),
    traineeUserId: id(4),
    status: "completed",
    recordVersion: 1,
    startedAt: "2026-11-02T05:00:00.000Z",
    pausedAt: null,
    completedAt: "2026-11-02T05:50:00.000Z",
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [],
    createdAt: NOW.toISOString(),
    updatedAt: "2026-11-03T05:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(
  a: WorkoutAssignment,
  e: WorkoutExecution | null,
  ended = false,
) {
  const context = { ended, online: true };
  return render(
    <MemoryRouter initialEntries={[`/clients/${REL}/activity`]}>
      <Routes>
        <Route path="/clients/:relationshipId" element={<Outlet context={context} />}>
          <Route
            path="activity"
            element={<WorkoutPanel assignment={a} execution={e} clientTimezone={TZ} />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkoutPanel coach tags and actions", () => {
  it("tags a coach-logged entry and offers Edit within 7 days", () => {
    renderPanel(assignment("2026-11-02"), execution({ loggedByRole: "coach" }));
    expect(screen.getByTestId("workout-coach-tag").textContent).toBe("Logged by coach");
    expect(screen.getByRole("link", { name: "Edit workout" }).getAttribute("href")).toBe(
      `/clients/${REL}/workouts/${id(300)}/edit`,
    );
  });

  it("tags a trainee entry the coach edited with the edit day", () => {
    renderPanel(
      assignment("2026-11-02"),
      execution({ loggedByRole: "trainee", lastEditedByRole: "coach" }),
    );
    expect(screen.getByTestId("workout-coach-tag").textContent).toBe(
      "Edited by coach · Tue 3 Nov",
    );
  });

  it("writes the workout date like Mon 2 Nov, never ISO", () => {
    renderPanel(assignment("2026-11-02"), execution({}));
    expect(screen.getByText(/Mon 2 Nov · window ends/)).toBeTruthy();
    expect(screen.queryByText(/2026-11-02/)).toBeNull();
  });

  it("shows no tag for the client's own untouched entry", () => {
    renderPanel(assignment("2026-11-02"), execution({ loggedByRole: "trainee" }));
    expect(screen.queryByTestId("workout-coach-tag")).toBeNull();
  });

  it("offers no Edit for an entry older than 7 days", () => {
    renderPanel(
      assignment("2026-10-20"),
      execution({
        startedAt: "2026-10-20T05:00:00.000Z",
        completedAt: "2026-10-20T05:50:00.000Z",
      }),
    );
    expect(screen.queryByRole("link", { name: "Edit workout" })).toBeNull();
  });

  it("offers Log workout for an unlogged assignment in range, never when ended", () => {
    renderPanel(assignment("2026-11-03"), null);
    expect(screen.getByRole("link", { name: "Log workout" }).getAttribute("href")).toBe(
      `/clients/${REL}/log-workout/${id(11)}`,
    );
    cleanup();
    renderPanel(assignment("2026-11-03"), null, true);
    expect(screen.queryByRole("link", { name: "Log workout" })).toBeNull();
  });

  it("offers no Edit for an ended client", () => {
    renderPanel(assignment("2026-11-02"), execution({}), true);
    expect(screen.queryByRole("link", { name: "Edit workout" })).toBeNull();
  });
});
