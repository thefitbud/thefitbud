import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncMutationRequest, SyncPushResponse } from "@fitbud/contracts";
import {
  createMemorySyncStore,
  createSyncEngine,
  type SyncEngine,
} from "../../sync/engine";
import { act, fireEvent, render, screen, waitFor } from "../../test/render";

/**
 * TR-19a / TR-19b on the real engine and a memory outbox (Z12-41). The API is
 * a stand-in that can be offline, accept, or refuse; everything on screen is
 * then read from the outbox.
 */

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

const h = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock("../../sync/SyncProvider", () => ({
  useSyncEngine: () => h.engine,
  useReachability: () => null,
}));

vi.mock("../../auth/AuthProvider", async () => {
  const { mockAuth: build } = await import("../../test/render");
  return {
    useAuth: () => build({ me: { timezone: "Asia/Kolkata" } }),
  };
});

const { SyncStatusScreen } = await import("./SyncStatusScreen");
const { SyncIndicator } = await import("../../components/SyncIndicator");

const MEAL = "10000000-0000-4000-8000-000000000001";
const EXECUTION = "20000000-0000-4000-8000-000000000001";
const ASSIGNMENT = "20000000-0000-4000-8000-000000000002";

type Mode = "offline" | "online" | "plan-changed" | "hold";

function setup() {
  const store = createMemorySyncStore();
  let mode: Mode = "offline";
  let release: () => void = () => undefined;
  const pushed: SyncMutationRequest[] = [];
  const engine: SyncEngine = createSyncEngine(store, {
    pushSync: async (body): Promise<SyncPushResponse> => {
      if (mode === "offline") throw new TypeError("Network request failed");
      if (mode === "hold") {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      pushed.push(...body.mutations);
      return {
        results: body.mutations.map((mutation) =>
          mode === "plan-changed"
            ? {
                mutationId: mutation.mutationId,
                status: "conflicted" as const,
                recordId: mutation.recordId,
                serverVersion: null,
                entityType: mutation.entityType,
                error: {
                  code: "LOCKED",
                  message: "This meal cannot be logged.",
                  details: { reason: "superseded" },
                },
              }
            : {
                mutationId: mutation.mutationId,
                status: "applied" as const,
                recordId: mutation.recordId,
                serverVersion: 1,
                entityType: mutation.entityType,
                error: null,
              },
        ),
      };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  });
  h.engine = engine;
  return {
    store,
    engine,
    pushed,
    set(next: Mode) {
      mode = next;
    },
    release: () => release(),
  };
}

let n = 0;
function id() {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function seedNames(engine: SyncEngine) {
  await engine.store.upsertLocal({
    entityType: "meal_assignment",
    recordId: MEAL,
    serverVersion: 0,
    payloadJson: JSON.stringify({ id: MEAL, mealName: "Evening snack" }),
    tombstone: false,
    updatedAt: "2026-11-15T00:00:00.000Z",
  });
  await engine.store.upsertLocal({
    entityType: "workout_assignment",
    recordId: ASSIGNMENT,
    serverVersion: 0,
    payloadJson: JSON.stringify({ id: ASSIGNMENT, workoutDayName: "Lower body B" }),
    tombstone: false,
    updatedAt: "2026-11-15T00:00:00.000Z",
  });
}

async function logMeal(engine: SyncEngine) {
  await engine.enqueue({
    mutationId: id(),
    entityType: "meal_compliance",
    recordId: MEAL,
    operation: "meal.confirm",
    expectedServerVersion: null,
    clientOccurredAt: "2026-11-15T11:34:00.000Z",
    payloadJson: JSON.stringify({ assignmentId: MEAL, body: {} }),
  });
}

async function logSet(engine: SyncEngine, minute: number) {
  await engine.enqueue({
    mutationId: id(),
    entityType: "workout_execution",
    recordId: EXECUTION,
    operation: "workout.complete_set",
    expectedServerVersion: 0,
    clientOccurredAt: `2026-11-15T13:2${minute}:00.000Z`,
    payloadJson: JSON.stringify({
      executionId: EXECUTION,
      setExecutionId: id(),
      assignmentId: ASSIGNMENT,
      body: { actualReps: 10 },
    }),
  });
}

async function logWeight(engine: SyncEngine) {
  const recordId = id();
  await engine.enqueue({
    mutationId: id(),
    entityType: "measurement",
    recordId,
    operation: "measurement.create",
    expectedServerVersion: null,
    clientOccurredAt: "2026-11-15T01:35:00.000Z",
    payloadJson: JSON.stringify({
      id: recordId,
      body: { type: "body_weight_kg", value: 78.3, unit: "kg" },
    }),
  });
}

function show() {
  const onBack = vi.fn();
  render(<SyncStatusScreen onBack={onBack} coachName="Rahul Verma" />);
  return { onBack };
}

beforeEach(() => {
  h.engine = null;
});

describe("sync status (TR-19a)", () => {
  it("lists what is waiting as the mock does: a meal, a workout's sets, a weight", async () => {
    const { engine } = setup();
    await seedNames(engine);
    await logMeal(engine);
    await logSet(engine, 0);
    await logSet(engine, 1);
    await logSet(engine, 2);
    await logWeight(engine);

    show();

    expect(await screen.findByText("3 items waiting to send")).toBeTruthy();
    expect(
      screen.getByText("They're saved on this phone and send on their own when you're online."),
    ).toBeTruthy();
    expect(screen.getByText("Evening snack")).toBeTruthy();
    expect(screen.getByText("Diet · eaten as planned · 5:04 pm")).toBeTruthy();
    expect(screen.getByText("Lower body B · 3 sets")).toBeTruthy();
    expect(screen.getByText("Workout · 6:52 pm")).toBeTruthy();
    expect(screen.getByText("Weight 78.3 kg")).toBeTruthy();
    expect(screen.getByText("Progress · 7:05 am")).toBeTruthy();
    expect(screen.getAllByText("Saved on phone")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Try sending now" })).toBeTruthy();
    // Nothing sent from this phone yet: no "Last sent" line is invented.
    expect(screen.queryByText(/^Last sent/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\(\d+\)/);
  });

  it("Try sending now shows Sending…, then the result: the list empties and Last sent appears", async () => {
    const env = setup();
    await logMeal(env.engine);
    await logWeight(env.engine);
    show();
    await screen.findByText("2 items waiting to send");
    env.set("hold");

    fireEvent.click(screen.getByRole("button", { name: "Try sending now" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Sending…").length).toBeGreaterThan(1));
    expect(screen.queryByText("Saved on phone")).toBeNull();

    await act(async () => {
      env.release();
    });

    expect(await screen.findByText("All saved")).toBeTruthy();
    expect(screen.getByText("Everything you logged has been sent.")).toBeTruthy();
    expect(screen.getByText("Sent.")).toBeTruthy();
    expect(screen.getByText(/^Last sent \d{1,2}:\d{2} (am|pm)$/)).toBeTruthy();
    expect(env.pushed).toHaveLength(2);
    expect(await env.store.listOutbox()).toEqual([]);
  });

  it("when the API can't be reached it says so, and the logs are still listed as saved", async () => {
    const env = setup();
    await logMeal(env.engine);
    show();
    await screen.findByText("1 item waiting to send");

    fireEvent.click(screen.getByRole("button", { name: "Try sending now" }));

    expect(await screen.findByText("Can't reach FitBud. Check your connection.")).toBeTruthy();
    expect(screen.getByText("Saved on phone")).toBeTruthy();
    expect(screen.getByText("1 item waiting to send")).toBeTruthy();
  });

  it("updates on its own when the queue is sent elsewhere (no stale screen)", async () => {
    const env = setup();
    await logMeal(env.engine);
    show();
    await screen.findByText("1 item waiting to send");

    env.set("online");
    await act(async () => {
      await env.engine.sendNow();
    });

    expect(await screen.findByText("All saved")).toBeTruthy();
  });

  it("a refused log shows its reason and can be tried again or removed", async () => {
    const env = setup();
    await logMeal(env.engine);
    const [row] = await env.store.listOutbox();
    await env.store.patchOutbox(row!.mutationId, {
      status: "rejected",
      lastError: "Set already recorded.",
      lastErrorCode: "SET_ALREADY_RECORDED",
    });
    show();

    expect(await screen.findByText("1 item couldn't be sent")).toBeTruthy();
    expect(screen.getByText("Set already recorded.")).toBeTruthy();
    expect(screen.getByText("Couldn't send")).toBeTruthy();

    env.set("online");
    fireEvent.click(screen.getByRole("button", { name: /^Try again/ }));

    expect(await screen.findByText("All saved")).toBeTruthy();
    expect(env.pushed.map((m) => m.mutationId)).toEqual([row!.mutationId]);
  });

  it("Remove takes a refused log off the phone", async () => {
    const env = setup();
    await logMeal(env.engine);
    const [row] = await env.store.listOutbox();
    await env.store.patchOutbox(row!.mutationId, { status: "rejected", lastError: "Refused." });
    show();
    await screen.findByText("1 item couldn't be sent");

    fireEvent.click(screen.getByRole("button", { name: /^Remove/ }));

    expect(await screen.findByText("All saved")).toBeTruthy();
    expect(await env.store.listOutbox()).toEqual([]);
  });
});

describe("plan-change conflict (TR-19b)", () => {
  async function conflicted() {
    const env = setup();
    await seedNames(env.engine);
    await logMeal(env.engine);
    env.set("plan-changed");
    await env.engine.sendNow();
    return env;
  }

  it("opens on its own with the coach's name, and says only what is true", async () => {
    await conflicted();
    show();

    expect(await screen.findByText("Rahul changed this meal")).toBeTruthy();
    expect(
      screen.getByText(
        "While you were offline, Rahul updated your evening snack. Your log is kept on this phone.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep my log" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "See Rahul's change" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/he'll see both/);
  });

  it("Keep my log keeps the row, marks it, and does not ask again", async () => {
    const env = await conflicted();
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Keep my log" }));

    await waitFor(() => expect(screen.queryByText("Rahul changed this meal")).toBeNull());
    expect(await screen.findByText("Kept on phone")).toBeTruthy();
    const [row] = await env.store.listOutbox();
    expect(row).toMatchObject({ status: "conflicted" });
    expect(row?.keptAt).not.toBeNull();
  });

  it("See the change closes the screen and leaves the log on the phone", async () => {
    const env = await conflicted();
    const { onBack } = show();
    fireEvent.click(await screen.findByRole("button", { name: "See Rahul's change" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await env.store.listOutbox()).toHaveLength(1);
  });

  it("the dialog can be opened again from the line", async () => {
    await conflicted();
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Keep my log" }));
    await waitFor(() => expect(screen.queryByText("Rahul changed this meal")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /^What changed/ }));

    expect(await screen.findByText("Rahul changed this meal")).toBeTruthy();
  });
});

describe("the sync pill", () => {
  it("is absent with an empty outbox, and follows the outbox as it changes", async () => {
    const env = setup();
    const onPress = vi.fn();
    render(<SyncIndicator onPress={onPress} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button")).toBeNull();

    await act(async () => {
      await logMeal(env.engine);
    });
    const pill = await screen.findByRole("button", { name: "Sync status, Saved on phone" });
    fireEvent.click(pill);
    expect(onPress).toHaveBeenCalledTimes(1);

    env.set("online");
    await act(async () => {
      await env.engine.sendNow();
    });
    // A 200 removes the item and clears the pill.
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("says Couldn't send only when the server refused a log", async () => {
    const env = setup();
    await logMeal(env.engine);
    render(<SyncIndicator />);
    await screen.findByRole("button", { name: "Sync status, Saved on phone" });

    // Unreachable is not a refusal: still "Saved on phone".
    await act(async () => {
      await env.engine.sendNow();
    });
    expect(screen.getByRole("button", { name: "Sync status, Saved on phone" })).toBeTruthy();

    env.set("plan-changed");
    await act(async () => {
      await env.engine.sendNow();
    });
    expect(await screen.findByRole("button", { name: "Sync status, Couldn't send" })).toBeTruthy();
  });
});
