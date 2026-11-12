/**
 * Trainer log and edit of a client's workout (Z10-16, frames DS8 a and d).
 * DOM-shaped harness: proves copy, rules and request bodies, not layout.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { workoutAssignmentSchema, workoutExecutionSchema } from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../../test/render";
import {
  assignmentsOn,
  isNetworkError,
  buildEditBody,
  buildLogBody,
  dateStrip,
  draftsFor,
  exercisesFromAssignment,
  exercisesFromExecution,
  isEditableSet,
  loggableAssignments,
  performedAtFor,
} from "./model";

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RID = ids(1);
const NOW = new Date("2026-11-04T06:00:00.000Z");

function assignment(over: { id?: string; date: string; execution?: unknown; name?: string }) {
  return workoutAssignmentSchema.parse({
    id: over.id ?? ids(10),
    coachingRelationshipId: RID,
    planId: ids(2),
    planVersionId: ids(3),
    workoutDayId: ids(4),
    workoutDayName: over.name ?? "Upper body A",
    localDate: over.date,
    windowStartsAt: `${over.date}T00:00:00.000Z`,
    windowEndsAt: `${over.date}T23:59:59.000Z`,
    status: over.execution ? "completed" : "assigned",
    workoutDay: {
      id: ids(4),
      order: 1,
      name: over.name ?? "Upper body A",
      exercises: [
        {
          id: ids(20),
          order: 1,
          name: "Bench press",
          instructions: null,
          setTargets: [1, 2, 3].map((o) => ({ id: ids(30 + o), order: o, reps: 8, loadLabel: "40 kg", rpe: null })),
        },
        {
          id: ids(21),
          order: 2,
          name: "Seated cable row",
          instructions: null,
          setTargets: [1, 2].map((o) => ({ id: ids(40 + o), order: o, reps: 12, loadLabel: "30 kg", rpe: null })),
        },
      ],
    },
    execution: over.execution ?? null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
}

function execution(
  over: { id?: string; status?: string; loggedByRole?: string; lastEditedByRole?: string | null; skipLast?: boolean } = {},
) {
  const set = (id: number, order: number, reps: number, label: string, actualReps: number) => ({
    id: ids(id),
    exerciseExecutionId: ids(60),
    setTargetId: ids(30 + order),
    order,
    status: over.skipLast && order === 3 ? "skipped" : "completed",
    prescribedReps: reps,
    prescribedLoadLabel: label,
    actualReps,
    actualLoadLabel: label,
    completedAt: "2026-11-02T06:00:00.000Z",
    createdAt: "2026-11-02T06:00:00.000Z",
    updatedAt: "2026-11-02T06:00:00.000Z",
  });
  return workoutExecutionSchema.parse({
    id: over.id ?? ids(50),
    assignmentId: ids(10),
    coachingRelationshipId: RID,
    planVersionId: ids(3),
    traineeUserId: ids(5),
    status: over.status ?? "completed",
    recordVersion: 3,
    startedAt: "2026-11-02T05:00:00.000Z",
    pausedAt: null,
    completedAt: "2026-11-02T06:00:00.000Z",
    sessionRpe: null,
    requireSessionRpe: false,
    loggedByRole: over.loggedByRole ?? "trainee",
    lastEditedByRole: over.lastEditedByRole ?? null,
    exercises: [
      {
        id: ids(60),
        workoutExecutionId: over.id ?? ids(50),
        exerciseId: ids(20),
        name: "Bench press",
        order: 1,
        status: "completed",
        sets: [set(61, 1, 8, "40 kg", 8), set(62, 2, 8, "40 kg", 8), set(63, 3, 8, "40 kg", 7)],
        createdAt: "2026-11-02T06:00:00.000Z",
        updatedAt: "2026-11-02T06:00:00.000Z",
      },
    ],
    createdAt: "2026-11-02T05:00:00.000Z",
    updatedAt: "2026-11-02T06:00:00.000Z",
  });
}

describe("model", () => {
  it("offers today and the six days before it", () => {
    expect(dateStrip("2026-11-04")).toEqual([
      "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
    ]);
  });

  it("stamps today with now and earlier days with midday in the client's zone", () => {
    expect(performedAtFor("2026-11-04", "2026-11-04", "Asia/Kolkata", NOW)).toBe(NOW.toISOString());
    expect(performedAtFor("2026-11-02", "2026-11-04", "Asia/Kolkata", NOW)).toBe("2026-11-02T06:30:00.000Z");
  });

  it("offers unlogged and finished assignments, never started or skipped ones", () => {
    const items = [
      assignment({ id: ids(11), date: "2026-11-02" }),
      assignment({ id: ids(12), date: "2026-11-02", execution: { ...execution({ status: "started" }), exercises: undefined } }),
    ];
    // the second has a started execution: not loggable
    expect(loggableAssignments(items).map((a) => a.id)).toEqual([ids(11)]);
    expect(assignmentsOn(items, "2026-11-03")).toEqual([]);
  });

  it("logs every set as done with the values on screen, bodyweight and kg apart", () => {
    const a = assignment({ date: "2026-11-02" });
    const ex = exercisesFromAssignment(a);
    const drafts = draftsFor(ex);
    drafts[ids(32)] = { load: "42.5", reps: "8", bodyweight: false };
    drafts[ids(33)] = { load: "", reps: "7", bodyweight: true };
    const body = buildLogBody(ex, drafts, "2026-11-02T06:30:00.000Z");
    expect(body.exercises).toHaveLength(2);
    const sets = body.exercises[0]!.sets;
    expect(sets[0]).toEqual({ setTargetId: ids(31), status: "completed", actualReps: 8 });
    expect(sets[1]).toEqual({ setTargetId: ids(32), status: "completed", actualReps: 8, actualLoadKg: 42.5 });
    expect(sets[2]).toEqual({ setTargetId: ids(33), status: "completed", actualReps: 7, bodyweight: true });
  });

  it("keeps a skipped set out of the editable rows and out of the edit body", () => {
    const ex = exercisesFromExecution(execution({ skipLast: true }));
    expect(ex[0]!.sets.map((x) => x.status)).toEqual(["completed", "completed", "skipped"]);
    expect(isEditableSet(ex[0]!.sets[2]!)).toBe(false);
    const drafts = draftsFor(ex);
    drafts[ids(63)] = { load: "50", reps: "9", bodyweight: false };
    expect(buildEditBody(ex, drafts, 3)).toBeNull();
  });

  it("reads only a connection failure as no connection", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new TypeError("undefined is not a function"))).toBe(false);
    expect(isNetworkError(new ApiClientError({ code: "X", message: "m", requestId: "r", status: 500 }))).toBe(false);
  });

  it("edits only the sets that changed and sends the version read", () => {
    const ex = exercisesFromExecution(execution());
    const drafts = draftsFor(ex);
    expect(buildEditBody(ex, drafts, 3)).toBeNull();
    drafts[ids(62)] = { load: "42.5", reps: "8", bodyweight: false };
    expect(buildEditBody(ex, drafts, 3)).toEqual({
      recordVersion: 3,
      sets: [{ setExecutionId: ids(62), status: "completed", actualReps: 8, actualLoadKg: 42.5 }],
    });
  });
});

const api = {
  listWorkoutAssignments: vi.fn(),
  getWorkoutExecution: vi.fn(),
  logClientWorkout: vi.fn(),
  editClientWorkout: vi.fn(),
};
const auth = mockAuth({ api, me: { timezone: "Asia/Kolkata" } });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../components/Screen", () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock("../../lib/dates", async (orig) => ({
  ...(await orig<typeof import("../../lib/dates")>()),
  localDateInTimezone: () => "2026-11-04",
}));

const { ClientLogWorkoutScreen } = await import("./ClientLogWorkoutScreen");

function renderForm(over: { ended?: boolean; initialDate?: string; initialAssignmentId?: string; onSaved?: (m: string) => void } = {}) {
  render(
    <ClientLogWorkoutScreen
      relationshipId={RID}
      displayName="Rohan Mehta"
      ended={over.ended ?? false}
      clientZone="Asia/Kolkata"
      initialDate={over.initialDate}
      initialAssignmentId={over.initialAssignmentId}
      onBack={() => {}}
      onSaved={over.onSaved ?? (() => {})}
    />,
  );
}

describe("ClientLogWorkoutScreen", () => {
  it("logs the planned workout for a day and says who logged it", async () => {
    api.listWorkoutAssignments.mockResolvedValue({ items: [assignment({ date: "2026-11-02" })], nextCursor: null });
    api.logClientWorkout.mockResolvedValue(execution());
    const onSaved = vi.fn();
    renderForm({ initialDate: "2026-11-02", onSaved });
    await screen.findByText("Upper body A");
    expect(screen.getByText(/Planned for Mon 2 Nov · 2 exercises/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Logged by you"));
    const [assignmentId, body, key] = api.logClientWorkout.mock.calls[0]!;
    expect(assignmentId).toBe(ids(10));
    expect(body.performedAt).toBe("2026-11-02T06:30:00.000Z");
    expect(body.exercises.flatMap((e: { sets: unknown[] }) => e.sets)).toHaveLength(5);
    expect(typeof key).toBe("string");
  });

  it("limits dates to 7 days and explains the earliest", async () => {
    api.listWorkoutAssignments.mockResolvedValue({ items: [], nextCursor: null });
    renderForm();
    await screen.findByText("Nothing planned on Wed 4 Nov");
    expect(screen.queryByRole("button", { name: "Wed 28 Oct" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thu 29 Oct" }));
    expect(
      screen.getByText(/You can log up to 7 days back, so Thu 29 Oct is the earliest/),
    ).toBeTruthy();
    expect(screen.getByText("Nothing planned on Thu 29 Oct")).toBeTruthy();
  });

  it("keeps the entries and offers Try again when nothing could be reached, reusing the key", async () => {
    api.listWorkoutAssignments.mockResolvedValue({ items: [assignment({ date: "2026-11-02" })], nextCursor: null });
    api.logClientWorkout.mockReset();
    api.logClientWorkout.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(execution());
    const onSaved = vi.fn();
    renderForm({ initialDate: "2026-11-02", onSaved });
    await screen.findByText("Upper body A");
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await screen.findByText(/Not saved\. We couldn’t reach FitBud, so nothing was saved\. Your entries are still here/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.logClientWorkout.mock.calls[1]![2]).toBe(api.logClientWorkout.mock.calls[0]![2]);
  });

  it("shows the API's own message for a refusal, never a guessed cause", async () => {
    api.listWorkoutAssignments.mockResolvedValue({ items: [assignment({ date: "2026-11-02" })], nextCursor: null });
    api.logClientWorkout.mockReset();
    api.logClientWorkout.mockRejectedValueOnce(
      new ApiClientError({ code: "BACKDATE_LIMIT", message: "A trainer log must be dated within the last 7 days.", requestId: "r", status: 422 }),
    );
    renderForm({ initialDate: "2026-11-02" });
    await screen.findByText("Upper body A");
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await screen.findByText(/Not saved\. A trainer log must be dated within the last 7 days\./);
  });

  it("edits a finished entry: opens on what was logged and sends only the change", async () => {
    api.listWorkoutAssignments.mockResolvedValue({
      items: [assignment({ date: "2026-11-02", execution: execution({ loggedByRole: "coach" }) })],
      nextCursor: null,
    });
    api.getWorkoutExecution.mockResolvedValue(execution({ loggedByRole: "coach" }));
    api.editClientWorkout.mockResolvedValue(execution());
    const onSaved = vi.fn();
    renderForm({ initialDate: "2026-11-02", onSaved });
    await screen.findByText(/Logged by you/);
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Set 2 load/ }));
    fireEvent.click(screen.getByRole("button", { name: "Plus 2.5" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: reps" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Edited by you"));
    expect(api.editClientWorkout).toHaveBeenCalledWith(ids(50), {
      recordVersion: 3,
      sets: [{ setExecutionId: ids(62), status: "completed", actualReps: 8, actualLoadKg: 42.5 }],
    });
  });

  it("ended client: read-only page, no form, no calls", async () => {
    api.listWorkoutAssignments.mockClear();
    renderForm({ ended: true });
    expect(screen.getByText("Coaching with Rohan has ended")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save workout" })).toBeNull();
    expect(api.listWorkoutAssignments).not.toHaveBeenCalled();
  });

  it("Edit from Recent activity opens that workout when two were done on one day", async () => {
    const first = assignment({ id: ids(11), date: "2026-11-02", name: "Upper body A", execution: execution({ id: ids(51) }) });
    const second = assignment({ id: ids(12), date: "2026-11-02", name: "Lower body B", execution: execution({ id: ids(52) }) });
    api.listWorkoutAssignments.mockResolvedValue({ items: [first, second], nextCursor: null });
    api.getWorkoutExecution.mockReset();
    api.getWorkoutExecution.mockImplementation(async (id: string) => execution({ id }));
    renderForm({ initialDate: "2026-11-02", initialAssignmentId: ids(12) });
    await screen.findByText("Lower body B");
    expect(screen.queryByText("Upper body A")).toBeNull();
    await waitFor(() => expect(api.getWorkoutExecution).toHaveBeenCalledWith(ids(52)));
    expect(api.getWorkoutExecution).not.toHaveBeenCalledWith(ids(51));
  });

  it("a version conflict shows the API message, blocks a second save and reloads on request", async () => {
    api.listWorkoutAssignments.mockResolvedValue({
      items: [assignment({ date: "2026-11-02", execution: execution() })],
      nextCursor: null,
    });
    api.getWorkoutExecution.mockReset();
    api.getWorkoutExecution.mockResolvedValue(execution());
    api.editClientWorkout.mockReset();
    api.editClientWorkout.mockRejectedValue(
      new ApiClientError({ code: "VERSION_CONFLICT", message: "This entry changed. Reload it.", requestId: "r", status: 409 }),
    );
    renderForm({ initialDate: "2026-11-02" });
    await screen.findByText("Bench press");
    fireEvent.click(screen.getByRole("button", { name: /Set 2 reps/ }));
    fireEvent.click(screen.getByRole("button", { name: "Minus 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/Not saved\. This entry changed\. Reload it\./);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.editClientWorkout).toHaveBeenCalledTimes(1);
    const before = api.getWorkoutExecution.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Reload entry" }));
    await waitFor(() => expect(api.getWorkoutExecution.mock.calls.length).toBe(before + 1));
  });

  it("does not call another TypeError a lost connection", async () => {
    api.listWorkoutAssignments.mockResolvedValue({ items: [assignment({ date: "2026-11-02" })], nextCursor: null });
    api.logClientWorkout.mockReset();
    api.logClientWorkout.mockRejectedValueOnce(new TypeError("undefined is not a function"));
    renderForm({ initialDate: "2026-11-02" });
    await screen.findByText("Upper body A");
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await screen.findByText(/LOG-SAVE/);
    expect(screen.queryByText(/couldn’t reach FitBud/)).toBeNull();
  });
});
