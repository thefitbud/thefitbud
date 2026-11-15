import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FitBudApiClient } from "@fitbud/api-client";
import { notificationSchema, type Notification, type NotificationType } from "@fitbud/contracts";
import {
  bindForegroundPushes,
  pushNoticeKey,
  createForegroundPushHandler,
  type ForegroundPushContext,
  type ReceivedNotificationsModule,
} from "./foregroundPush";
import { BANNER_MS, createNoticeQueue } from "./noticeQueue";

const NOTE_ID = "00000000-0000-4000-8000-0000000c0002";
const RELATIONSHIP_ID = "00000000-0000-4000-8000-000000000101";
const MEAL_ID = "00000000-0000-4000-8000-000000000301";

let seq = 0;
function record(
  type: NotificationType,
  entity: { type: Notification["domainEntityType"]; id: string },
  extra: Partial<Notification> = {},
): Notification {
  seq += 1;
  const id = `00000000-0000-4000-8000-0000000a${String(seq).padStart(4, "0")}`;
  const createdAt = "2026-11-14T13:00:00.000Z";
  return notificationSchema.parse({
    id,
    recipientUserId: "00000000-0000-4000-8000-000000000011",
    coachingRelationshipId: RELATIONSHIP_ID,
    type,
    notificationType: type,
    domainEntityType: entity.type,
    domainEntityId: entity.id,
    state: "delivered",
    dedupeKey: `${type}:${entity.id}`,
    createdAt,
    readAt: null,
    route: "/today",
    routing: {
      notificationId: id,
      notificationType: type,
      domainEntityType: entity.type,
      domainEntityId: entity.id,
      createdAt,
    },
    ...extra,
  });
}

function fakeApi(items: Notification[]) {
  const markNotificationRead = vi.fn(async (id: string) => items.find((item) => item.id === id)!);
  const api = {
    listNotifications: vi.fn(async () => ({ items, nextCursor: null })),
    listMeCoachNotes: vi.fn(async () => ({
      items: [
        {
          id: NOTE_ID,
          body: "Try 42.5 kg on the RDLs today if set 2 feels easy.",
          sharedAt: "2026-11-14T13:00:00.000Z",
          seenAt: null,
          createdAt: "2026-11-14T13:00:00.000Z",
        },
      ],
    })),
    markNotificationRead,
  };
  return { api: api as unknown as FitBudApiClient, markNotificationRead };
}

/** A fake expo-notifications whose listener the test fires, as the OS would. */
function fakeNotifications() {
  let listener: ((n: { request: { content: { data: unknown } } }) => void) | null = null;
  const remove = vi.fn();
  const module: ReceivedNotificationsModule = {
    addNotificationReceivedListener: (next) => {
      listener = next;
      return { remove };
    },
  };
  return {
    module,
    remove,
    deliver(data: unknown) {
      listener?.({ request: { content: { data } } });
    },
  };
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("foreground push → notice queue (Z12-38, TR-06h, TM-13b)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(items: Notification[], role: ForegroundPushContext["role"], coachName: string | null) {
    const queue = createNoticeQueue();
    const { api, markNotificationRead } = fakeApi(items);
    const openPayload = vi.fn();
    const context: ForegroundPushContext = { api, role, coachName, openPayload };
    const native = fakeNotifications();
    const handle = createForegroundPushHandler(queue, () => context);
    const stop = bindForegroundPushes(
      async () => native.module,
      (data) => void handle(data),
    );
    return { queue, native, stop, openPayload, markNotificationRead };
  }

  it("a coach note with the app open: banner with the note, gone in about 4 s", async () => {
    const note = record("trainer_note_shared", { type: "coaching_relationship", id: NOTE_ID });
    const { queue, native } = setup([note], "trainee", "Rahul Verma");
    await flush();
    native.deliver(note.routing);
    await flush();
    const banner = queue.getSnapshot().banner;
    expect(banner?.title).toBe("Rahul has a note for you");
    expect(banner?.body).toBe("Try 42.5 kg on the RDLs today if set 2 feels easy.");
    expect(banner?.leading).toEqual({ kind: "initials", name: "Rahul Verma", tone: "coach" });
    vi.advanceTimersByTime(BANNER_MS);
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("a tap routes like the system notification and marks it read", async () => {
    const note = record("trainer_note_shared", { type: "coaching_relationship", id: NOTE_ID });
    const { queue, native, openPayload, markNotificationRead } = setup([note], "trainee", "Rahul Verma");
    await flush();
    native.deliver(note.routing);
    await flush();
    queue.open(queue.getSnapshot().banner!.id);
    expect(markNotificationRead).toHaveBeenCalledWith(note.id);
    expect(openPayload).toHaveBeenCalledWith(note.routing);
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("two in a row queue and do not stack", async () => {
    const note = record("trainer_note_shared", { type: "coaching_relationship", id: NOTE_ID });
    const plan = record("plan_published", { type: "coaching_relationship", id: RELATIONSHIP_ID });
    const { queue, native } = setup([note, plan], "trainee", "Rahul Verma");
    await flush();
    native.deliver(note.routing);
    native.deliver(plan.routing);
    await flush();
    expect(queue.getSnapshot().banner?.title).toBe("Rahul has a note for you");
    vi.advanceTimersByTime(BANNER_MS);
    expect(queue.getSnapshot().banner?.title).toBe("Your plan is updated");
  });

  it("trainer on Clients: a client's question shows with the client's initials (TM-13b)", async () => {
    const ask = record(
      "trainer_ask_coach",
      { type: "coaching_relationship", id: RELATIONSHIP_ID },
      { clientDisplayName: "Aarav Shah" },
    );
    const { queue, native } = setup([ask], "trainer", null);
    await flush();
    native.deliver(ask.routing);
    await flush();
    const banner = queue.getSnapshot().banner;
    expect(banner?.title).toMatch(/^Aarav/);
    expect(banner?.leading).toEqual({ kind: "initials", name: "Aarav Shah", tone: "client" });
  });

  it("a push for the other role, or not a FitBud payload, shows nothing", async () => {
    const ask = record("trainer_ask_coach", { type: "coaching_relationship", id: RELATIONSHIP_ID });
    const { queue, native } = setup([ask], "trainee", "Rahul Verma");
    await flush();
    native.deliver(ask.routing);
    native.deliver({ kind: "rest_timer" });
    await flush();
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("no banner for a meal reminder while that meal is open", async () => {
    const reminder = record("meal_reminder", { type: "meal_assignment", id: MEAL_ID });
    const { queue, native } = setup([reminder], "trainee", "Rahul Verma");
    queue.setScreen(`meal:${MEAL_ID}`);
    await flush();
    native.deliver(reminder.routing);
    await flush();
    expect(queue.getSnapshot().banner).toBeNull();
  });

  it("the record is not found: the app's own copy for the type", async () => {
    const plan = record("plan_published", { type: "coaching_relationship", id: RELATIONSHIP_ID });
    const { queue, native } = setup([], "trainee", "Rahul Verma");
    await flush();
    native.deliver(plan.routing);
    await flush();
    expect(queue.getSnapshot().banner?.title).toBe("Your plan is updated");
  });

  it("the same note from a push and from Today is one banner", () => {
    const note = record("trainer_note_shared", { type: "coaching_relationship", id: NOTE_ID });
    expect(pushNoticeKey(note.routing)).toBe(`note:${NOTE_ID}`);
  });

  it("stops listening on cleanup", async () => {
    const { native, stop } = setup([], "trainee", null);
    await flush();
    stop();
    expect(native.remove).toHaveBeenCalledTimes(1);
  });
});
