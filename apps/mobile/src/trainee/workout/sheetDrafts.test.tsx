/**
 * Z14-37: typing in Workout-tab sheets survives the tab unmounting under a
 * cover and an app restart, for the same user only, and is cleared on Save,
 * Cancel and explicit sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { act, fireEvent, render, screen, waitFor } from "../../test/render";
import {
  createMemoryKeyValue,
  resetDeviceStorageForTests,
  type AsyncKeyValue,
} from "../../sync/storage";
import { clearSyncDataOnSignOut, resetSyncStoresForTests } from "../../sync/userStore";
import { WorkoutSummaryScreen } from "../WorkoutSummaryScreen";
import { pendingFeedbackStore } from "./pendingFeedbackStore";
import {
  SHEET_DRAFT_DEBOUNCE_MS,
  SHEET_DRAFT_MAX_AGE_MS,
  createSheetDrafts,
  sheetDrafts,
  useSheetDraft,
  type SheetDraftHandle,
  type SheetDrafts,
} from "./sheetDrafts";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const EXECUTION = "00000000-0000-4000-8000-000000000900";
const T0 = Date.parse("2026-11-15T10:00:00.000Z");

describe("sheet drafts store", () => {
  function device() {
    const map = new Map<string, string>();
    const storage = createMemoryKeyValue(map);
    let clock = T0;
    return {
      map,
      tick: (ms: number) => {
        clock += ms;
      },
      // Each call is what a fresh process opens over the same device store.
      open: () => createSheetDrafts({ storage: () => storage, now: () => clock }),
    };
  }

  it("keeps a draft across a restart, keyed by owner, sheet and entity", async () => {
    const phone = device();
    await phone.open().save(OWNER, "workoutFeedback", EXECUTION, { rpe: 6, note: "Knee" });
    expect(await phone.open().read(OWNER, "workoutFeedback", EXECUTION)).toEqual({
      rpe: 6,
      note: "Knee",
    });
    // Another workout has no draft.
    expect(await phone.open().read(OWNER, "workoutFeedback", OTHER)).toBeNull();
    // Owner-scoped key, one index for sign-out clearing.
    expect([...phone.map.keys()].sort()).toEqual([
      "fitbud.workoutDrafts.v1.00000000-0000-4000-8000-0000000000a1.workoutFeedback_00000000-0000-4000-8000-000000000900",
      "fitbud.workoutDrafts.v1.index",
    ]);
  });

  it("never gives a draft to another user, and a new user's first write removes the old one", async () => {
    const phone = device();
    await phone.open().save(OWNER, "workoutFeedback", EXECUTION, { rpe: 6, note: "Knee" });
    expect(await phone.open().read(OTHER, "workoutFeedback", EXECUTION)).toBeNull();
    await phone.open().save(OTHER, "workoutFeedback", EXECUTION, { rpe: 2, note: "" });
    expect(await phone.open().read(OWNER, "workoutFeedback", EXECUTION)).toBeNull();
    expect(await phone.open().read(OTHER, "workoutFeedback", EXECUTION)).toEqual({
      rpe: 2,
      note: "",
    });
  });

  it("ignores and removes a draft older than 24 h", async () => {
    const phone = device();
    await phone.open().save(OWNER, "workoutFeedback", EXECUTION, { rpe: 6, note: "Knee" });
    phone.tick(SHEET_DRAFT_MAX_AGE_MS + 1);
    expect(await phone.open().read(OWNER, "workoutFeedback", EXECUTION)).toBeNull();
    expect(phone.map.has(
      "fitbud.workoutDrafts.v1.00000000-0000-4000-8000-0000000000a1.workoutFeedback_00000000-0000-4000-8000-000000000900",
    )).toBe(false);
  });

  it("clear removes one draft; clearAll removes every draft", async () => {
    const phone = device();
    const drafts = phone.open();
    await drafts.save(OWNER, "workoutFeedback", EXECUTION, { note: "a" });
    await drafts.save(OWNER, "workoutFeedback", OTHER, { note: "b" });
    await drafts.clear(OWNER, "workoutFeedback", EXECUTION);
    expect(await drafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull();
    expect(await drafts.read(OWNER, "workoutFeedback", OTHER)).toEqual({ note: "b" });
    await drafts.clearAll();
    expect(phone.map.size).toBe(0);
  });

  it("a failing device store is reported and never throws", async () => {
    const fail = async (): Promise<never> => {
      throw new Error("disk full");
    };
    const broken: AsyncKeyValue = { get: fail, set: fail, remove: fail };
    const report = vi.fn();
    const drafts = createSheetDrafts({ storage: () => broken, report });
    await expect(drafts.save(OWNER, "workoutFeedback", EXECUTION, { note: "a" })).resolves.toBeUndefined();
    await expect(drafts.read(OWNER, "workoutFeedback", EXECUTION)).resolves.toBeNull();
    await expect(drafts.clearAll()).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("workout.sheetDrafts", expect.any(Error));
  });
});

describe("useSheetDraft", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function counting(): SheetDrafts & { saves: unknown[] } {
    const saves: unknown[] = [];
    return {
      saves,
      save: async (_o, _s, _e, value) => {
        saves.push(value);
      },
      read: async () => null,
      clear: async () => undefined,
      clearAll: async () => undefined,
    };
  }

  function Probe({
    drafts,
    onHandle,
  }: {
    drafts: SheetDrafts;
    onHandle: (handle: SheetDraftHandle<string>) => void;
  }) {
    const handle = useSheetDraft<string>({
      ownerId: OWNER,
      sheet: "workoutFeedback",
      entityId: EXECUTION,
      drafts,
    });
    onHandle(handle);
    return null;
  }

  it("writes once per pause in typing, not on every keystroke, and keeps a stable handle", () => {
    vi.useFakeTimers();
    const drafts = counting();
    const handles: unknown[] = [];
    let handle!: SheetDraftHandle<string>;
    const { rerender } = render(
      <Probe drafts={drafts} onHandle={(h) => { handle = h; handles.push(h); }} />,
    );
    for (const text of ["K", "Kn", "Kne", "Knee"]) {
      handle.schedule(text);
      vi.advanceTimersByTime(100);
    }
    expect(drafts.saves).toEqual([]);
    vi.advanceTimersByTime(SHEET_DRAFT_DEBOUNCE_MS);
    expect(drafts.saves).toEqual(["Knee"]);
    rerender(<Probe drafts={drafts} onHandle={(h) => { handle = h; handles.push(h); }} />);
    expect(handles[0]).toBe(handles[1]);
  });

  it("writes a pending draft at once when the sheet unmounts (a cover arrives)", () => {
    vi.useFakeTimers();
    const drafts = counting();
    let handle!: SheetDraftHandle<string>;
    const { unmount } = render(<Probe drafts={drafts} onHandle={(h) => { handle = h; }} />);
    handle.schedule("Half a note");
    unmount();
    expect(drafts.saves).toEqual(["Half a note"]);
  });

  it("a pending write never brings a draft back after sign-out discarded them", async () => {
    vi.useFakeTimers();
    const map = new Map<string, string>();
    const storage = createMemoryKeyValue(map);
    const drafts = createSheetDrafts({ storage: () => storage });
    let handle!: SheetDraftHandle<string>;
    const { unmount } = render(<Probe drafts={drafts} onHandle={(h) => { handle = h; }} />);
    handle.schedule("Typed before sign-out");
    await drafts.clearAll();
    // The cover arriving (or the tab unmounting on sign-out) flushes.
    unmount();
    vi.useRealTimers();
    expect(await drafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull();
    expect([...map.keys()]).toEqual([]);
  });

  it("clear drops a pending write", () => {
    vi.useFakeTimers();
    const drafts = counting();
    let handle!: SheetDraftHandle<string>;
    const { unmount } = render(<Probe drafts={drafts} onHandle={(h) => { handle = h; }} />);
    handle.schedule("Gone");
    handle.clear();
    vi.advanceTimersByTime(SHEET_DRAFT_DEBOUNCE_MS * 2);
    unmount();
    expect(drafts.saves).toEqual([]);
  });
});

describe("the rating-and-note sheet keeps its typing (W-17c2)", () => {
  let map: Map<string, string>;

  beforeEach(async () => {
    map = new Map();
    resetDeviceStorageForTests({ storage: createMemoryKeyValue(map), capacity: "full" });
    resetSyncStoresForTests();
  });
  afterEach(() => {
    resetDeviceStorageForTests(null);
  });

  const assignment = {
    id: "00000000-0000-4000-8000-000000000104",
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    workoutDayName: "Lower body B",
    localDate: "2026-11-14",
  } as WorkoutAssignment;
  const execution = {
    id: EXECUTION,
    assignmentId: assignment.id,
    status: "completed",
    recordVersion: 4,
    startedAt: "2026-11-14T13:00:00.000Z",
    completedAt: "2026-11-14T13:52:00.000Z",
    sessionRpe: 7,
    sessionNote: null,
    requireSessionRpe: false,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    feedbackEditableUntil: "2026-11-16T13:52:00.000Z",
    exercises: [],
  } as unknown as WorkoutExecution;

  function renderView(ownerId: string, onSaveFeedback = vi.fn()) {
    return render(
      <WorkoutSummaryScreen
        mode="view"
        execution={execution}
        assignment={assignment}
        coachName="Rahul Verma"
        now={new Date(T0)}
        draftOwnerId={ownerId}
        onSaveFeedback={onSaveFeedback}
        onDone={vi.fn()}
      />,
    );
  }
  const openChange = () =>
    fireEvent.click(screen.getByRole("button", { name: "Change your rating and note" }));
  const noteInput = () => screen.getByTestId("workout-note-input") as HTMLTextAreaElement;

  async function typeAndUnmount(ownerId: string) {
    const view = renderView(ownerId);
    openChange();
    fireEvent.click(screen.getByRole("radio", { name: "9 of 10" }));
    fireEvent.change(noteInput(), { target: { value: "Left knee felt tight." } });
    // The cover arrives before the debounce: the pending write is made now.
    view.unmount();
    await waitFor(async () =>
      expect(await sheetDrafts.read(ownerId, "workoutFeedback", EXECUTION)).toEqual({
        rpe: 9,
        note: "Left knee felt tight.",
      }),
    );
  }

  it("comes back when the sheet reopens after the tab was unmounted, with no notice", async () => {
    await typeAndUnmount(OWNER);
    renderView(OWNER);
    // Closed sheet after the remount; reopening restores what was typed.
    openChange();
    await waitFor(() => expect(noteInput().value).toBe("Left knee felt tight."));
    expect(screen.queryByText(/restored/i)).toBeNull();
  });

  it("is cleared by Save and by Cancel", async () => {
    await typeAndUnmount(OWNER);
    const onSave = vi.fn(async () => ({ kind: "saved", rpe: 9, note: "Left knee felt tight." }) as const);
    const view = renderView(OWNER, onSave);
    openChange();
    await waitFor(() => expect(noteInput().value).toBe("Left knee felt tight."));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ rpe: 9, note: "Left knee felt tight." }, expect.any(Function));
    await waitFor(async () =>
      expect(await sheetDrafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull(),
    );
    view.unmount();

    await typeAndUnmount(OWNER);
    renderView(OWNER);
    openChange();
    await waitFor(() => expect(noteInput().value).toBe("Left knee felt tight."));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(async () =>
      expect(await sheetDrafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull(),
    );
  });

  it("another user on the phone never sees it", async () => {
    await typeAndUnmount(OWNER);
    renderView(OTHER);
    openChange();
    // Give a restore every chance to land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(noteInput().value).toBe("");
  });

  it("explicit sign-out clears drafts and held ratings; a server-ended session keeps them", async () => {
    await typeAndUnmount(OWNER);
    await pendingFeedbackStore.hold({
      ownerId: OWNER,
      executionId: EXECUTION,
      change: { rpe: 9 },
      heldAt: T0,
      token: "t",
    });
    // A server-ended session clears nothing (endSession("keep")): still there.
    expect(await sheetDrafts.read(OWNER, "workoutFeedback", EXECUTION)).not.toBeNull();
    expect(await pendingFeedbackStore.list(OWNER)).toHaveLength(1);

    await clearSyncDataOnSignOut();

    expect(await sheetDrafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull();
    expect(await pendingFeedbackStore.list(OWNER)).toEqual([]);
    expect([...map.keys()].filter((key) => key.startsWith("fitbud.workoutDrafts") || key.startsWith("fitbud.pendingFeedback"))).toEqual([]);
  });
});

describe("the after-finish rating and note keep their typing (W-17a2)", () => {
  beforeEach(() => {
    resetDeviceStorageForTests({ storage: createMemoryKeyValue(), capacity: "full" });
  });
  afterEach(() => {
    resetDeviceStorageForTests(null);
  });

  const execution = {
    id: EXECUTION,
    assignmentId: "00000000-0000-4000-8000-000000000104",
    status: "completed",
    recordVersion: 4,
    startedAt: "2026-11-14T13:00:00.000Z",
    completedAt: "2026-11-14T13:52:00.000Z",
    sessionRpe: null,
    sessionNote: null,
    requireSessionRpe: false,
    loggedByRole: "trainee",
    lastEditedByRole: null,
    exercises: [],
  } as unknown as WorkoutExecution;

  const renderSummary = (onSaveFeedback = vi.fn()) =>
    render(
      <WorkoutSummaryScreen
        execution={execution}
        coachName="Rahul Verma"
        today="2026-11-14"
        draftOwnerId={OWNER}
        onSaveFeedback={onSaveFeedback}
        onDone={vi.fn()}
      />,
    );
  const noteInput = () => screen.getByTestId("workout-note-input") as HTMLTextAreaElement;

  it("restores the typed note after the summary remounts, and Save and share clears it", async () => {
    const first = renderSummary();
    fireEvent.change(noteInput(), { target: { value: "Shoulder clicked on the press." } });
    first.unmount();

    const onSave = vi.fn(
      async () => ({ kind: "saved", rpe: null, note: "Shoulder clicked on the press." }) as const,
    );
    renderSummary(onSave);
    await waitFor(() => expect(noteInput().value).toBe("Shoulder clicked on the press."));
    fireEvent.click(screen.getByRole("button", { name: "Save and share with Rahul" }));
    expect(onSave).toHaveBeenCalledWith(
      { note: "Shoulder clicked on the press." },
      expect.any(Function),
    );
    await waitFor(async () =>
      expect(await sheetDrafts.read(OWNER, "workoutFeedback", EXECUTION)).toBeNull(),
    );
  });
});
