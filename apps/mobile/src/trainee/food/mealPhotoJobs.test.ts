import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import type { AsyncKeyValue } from "../../sync/storage";
import { MealPhotoError } from "../mealActions";
import {
  MEAL_PHOTO_JOBS_PREFIX,
  createMealPhotoJobs,
  discardMealPhotoJobs,
  mealPhotoJobsFor,
  resetMealPhotoJobsForTests,
  resolveMealEntryId,
  stopMealPhotoJobs,
  serverEntryId,
  type MealPhotoJobDeps,
  type MealPhotoJob,
} from "./mealPhotoJobs";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));

const OWNER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const MEAL = "b2222222-2222-4222-8222-222222222222";
const ENTRY = "e5555555-5555-4555-8555-555555555555";
const ASSET = "00000000-0000-4000-8000-0000000000d1";
const DATE = "2026-11-24";
const JPEG = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 255, 217]);

/** The device store as `createMemoryKeyValue` keeps it (storage.ts pulls in react-native). */
function createMemoryKeyValue(map: Map<string, string>): AsyncKeyValue {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    remove: async (key) => {
      map.delete(key);
    },
  };
}

type MealLike = Pick<MealAssignment, "id" | "compliance">;
function mealWith(entryId: string | null): MealLike {
  return {
    id: MEAL,
    compliance: entryId ? ({ id: entryId } as MealAssignment["compliance"]) : null,
  };
}
function outboxRow(status = "pending") {
  return { status, operation: "meal.confirm", recordId: MEAL };
}
const networkDown = () => new TypeError("Network request failed");

/** The server as the runner's resolver sees it: the outbox and the day's meals. */
function fakeServer() {
  const state = {
    outbox: [] as Array<{ status: string; operation: string; recordId: string }>,
    meal: mealWith(null) as MealLike | null,
    offline: false,
  };
  const send = vi.fn<MealPhotoJobDeps["send"]>(async () => undefined);
  const deps: MealPhotoJobDeps = {
    resolveEntryId: (job, hint) =>
      resolveMealEntryId({
        job,
        hint,
        listOutbox: async () => state.outbox,
        fetchMeal: async () => {
          if (state.offline) throw networkDown();
          return state.meal;
        },
      }),
    send,
  };
  return { state, send, deps };
}

function memory() {
  const map = new Map<string, string>();
  return { map, storage: createMemoryKeyValue(map) };
}

function runner(storage = memory().storage, extra: Partial<Parameters<typeof createMealPhotoJobs>[0]> = {}) {
  return createMealPhotoJobs({
    storage,
    ownerId: OWNER,
    setTimer: () => null,
    clearTimer: () => undefined,
    ...extra,
  });
}

async function addPhoto(jobs: ReturnType<typeof runner>) {
  await jobs.addPrepared({
    assignmentId: MEAL,
    relationshipId: REL,
    localDate: DATE,
    uri: "file:///cache/ImageManipulator/p.jpg",
    bytes: JPEG,
  });
}

/** Lets the runner's chained promises settle. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
}

describe("serverEntryId (attach only to an id the server gave)", () => {
  it("is null for no log, a phone-made local id, and a log still in the outbox", () => {
    expect(serverEntryId(mealWith(null), new Set())).toBeNull();
    expect(serverEntryId(mealWith(`local-${ENTRY}`), new Set())).toBeNull();
    expect(serverEntryId(mealWith(ENTRY), new Set([MEAL]))).toBeNull();
    expect(serverEntryId(mealWith(ENTRY), new Set())).toBe(ENTRY);
  });
});

describe("meal photo jobs: never attach before the log is on the server", () => {
  it("does not send while the meal only has a local id", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    // Diet shows the overlay's local id; the server has no entry yet.
    jobs.setHints([mealWith(`local-${ENTRY}`) as MealAssignment]);
    server.state.meal = mealWith(null);
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    expect(jobs.snapshot()[MEAL]?.state).toBe("waiting");
  });

  it("does not send while the log is still in the outbox, even if an id is shown", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    server.state.outbox = [outboxRow("in_flight")];
    jobs.setHints([mealWith(ENTRY) as MealAssignment]);
    server.state.meal = mealWith(ENTRY);
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();

    // The server accepted the log: the photo goes, to the server's entry.
    server.state.outbox = [];
    await jobs.kick();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.send.mock.calls[0]?.[1].entryId).toBe(ENTRY);
  });
});

describe("meal photo jobs: offline is a wait, not a failure", () => {
  it("goes back to waiting when the connection fails and sends itself on reconnect", async () => {
    const server = fakeServer();
    const listeners = new Set<(reachable: boolean) => void>();
    const reachability = {
      subscribe(listener: (reachable: boolean) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const { map, storage } = memory();
    const jobs = runner(storage);
    jobs.configure(server.deps);
    jobs.connect({ reachability });
    server.state.meal = mealWith(ENTRY);
    server.send.mockRejectedValueOnce(
      new MealPhotoError("upload", "You're offline. We'll retry when you're back.", networkDown()),
    );
    await addPhoto(jobs);
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
    const waiting = jobs.snapshot()[MEAL]!;
    expect(waiting.state).toBe("waiting");
    expect(waiting.offline).toBe(true);
    expect(waiting.message).toBeNull();

    for (const listener of listeners) listener(true);
    await settle();
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(jobs.snapshot()[MEAL]?.state).toBe("done");
    // Attached: the record and the photo bytes are gone from the device store.
    expect([...map.keys()].filter((key) => key.includes(".job.") || key.includes(".jpeg."))).toEqual([]);
  });

  it("retries on a backed-off timer too, if no reachability event comes", async () => {
    const server = fakeServer();
    const timers: Array<() => void> = [];
    const jobs = runner(memory().storage, {
      setTimer: (fn) => {
        timers.push(fn);
        return timers.length;
      },
    });
    jobs.configure(server.deps);
    server.state.offline = true;
    await addPhoto(jobs);
    await settle();
    expect(jobs.snapshot()[MEAL]?.offline).toBe(true);
    expect(timers).toHaveLength(1);
    server.state.offline = false;
    server.state.meal = mealWith(ENTRY);
    timers.shift()!();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it("a refusal is a real failure: shown, kept, and sent again only on Try again", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    server.state.meal = mealWith(ENTRY);
    server.send.mockRejectedValueOnce(
      new MealPhotoError(
        "attach",
        "Photo didn't upload. Your meal is still logged.",
        new ApiClientError({ status: 409, code: "CONFLICT", message: "No" } as never),
      ),
    );
    await addPhoto(jobs);
    await settle();
    expect(jobs.snapshot()[MEAL]).toMatchObject({
      state: "failed",
      offline: false,
      message: "Photo didn't upload. Your meal is still logged.",
    });
    await jobs.kick();
    expect(server.send).toHaveBeenCalledTimes(1);
    jobs.retry(MEAL);
    await settle();
    expect(server.send).toHaveBeenCalledTimes(2);
    const keys = server.send.mock.calls.map((call) => (call[0] as MealPhotoJob).attachKey);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe("meal photo jobs survive a restart", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("a fresh module over the same storage resumes the job and sends the same photo", async () => {
    const { map, storage } = memory();
    const first = fakeServer();
    const before = runner(storage);
    before.configure(first.deps);
    // Logged offline: no entry on the server yet.
    first.state.outbox = [outboxRow()];
    await addPhoto(before);
    await settle();
    expect(first.send).not.toHaveBeenCalled();
    const attachKey = before.snapshot()[MEAL]!.attachKey;
    before.dispose(); // the app is killed

    // A new process: a fresh copy of the module, the same device store.
    const fresh = await import("./mealPhotoJobs");
    const second = fakeServer();
    second.state.meal = mealWith(ENTRY);
    const after = fresh.createMealPhotoJobs({
      storage: createMemoryKeyValue(map),
      ownerId: OWNER,
      setTimer: () => null,
      clearTimer: () => undefined,
    });
    after.configure(second.deps);
    await after.start();
    await settle();
    expect(second.send).toHaveBeenCalledTimes(1);
    const [job, input] = second.send.mock.calls[0]!;
    expect(job.attachKey).toBe(attachKey);
    expect(input.entryId).toBe(ENTRY);
    expect([...input.bytes]).toEqual([...JPEG]);
    expect(after.snapshot()[MEAL]?.state).toBe("done");
    expect([...map.keys()].some((key) => key.includes(".job."))).toBe(false);
  });

  it("an upload that finished before the restart is not uploaded again", async () => {
    const { map, storage } = memory();
    const first = fakeServer();
    const before = runner(storage);
    before.configure(first.deps);
    first.state.meal = mealWith(ENTRY);
    first.send.mockImplementationOnce(async (_job, input) => {
      await input.onUploaded(ASSET);
      throw new MealPhotoError("attach", "x", networkDown());
    });
    await addPhoto(before);
    await settle();
    before.dispose();

    const fresh = await import("./mealPhotoJobs");
    const second = fakeServer();
    second.state.meal = mealWith(ENTRY);
    const after = fresh.createMealPhotoJobs({
      storage: createMemoryKeyValue(map),
      ownerId: OWNER,
      setTimer: () => null,
      clearTimer: () => undefined,
    });
    after.configure(second.deps);
    await after.start();
    await settle();
    expect(second.send).toHaveBeenCalledTimes(1);
    expect(second.send.mock.calls[0]![0].mediaAssetId).toBe(ASSET);
  });

  it("another account's waiting photos are dropped, never sent", async () => {
    const { map, storage } = memory();
    const before = runner(storage);
    before.configure(fakeServer().deps);
    await addPhoto(before);
    before.dispose();
    const other = createMealPhotoJobs({
      storage: createMemoryKeyValue(map),
      ownerId: "c0c0c0c0-0000-4000-8000-000000000001",
      setTimer: () => null,
    });
    const server = fakeServer();
    server.state.meal = mealWith(ENTRY);
    other.configure(server.deps);
    await other.start();
    await settle();
    expect(other.snapshot()).toEqual({});
    expect(server.send).not.toHaveBeenCalled();
    expect([...map.keys()].filter((key) => key.startsWith(`${MEAL_PHOTO_JOBS_PREFIX}.${OWNER}`))).toEqual([]);
  });
});

function storedKeys(map: Map<string, string>) {
  return [...map.keys()].filter((key) => key.startsWith(MEAL_PHOTO_JOBS_PREFIX));
}

describe("meal photo jobs: sign-out (Z14-34)", () => {
  beforeEach(() => resetMealPhotoJobsForTests());

  it("explicit sign-out deletes every job and byte, and a running upload cannot bring them back", async () => {
    const { map, storage } = memory();
    const jobs = mealPhotoJobsFor(OWNER, () => ({ storage, ownerId: OWNER, setTimer: () => null }));
    const server = fakeServer();
    server.state.meal = mealWith(ENTRY);
    let uploaded: ((id: string) => Promise<void>) | null = null;
    let finish: () => void = () => undefined;
    const sendStarted = new Promise<void>((resolve) => {
      jobs.configure({
        ...server.deps,
        send: async (_job, input) => {
          uploaded = input.onUploaded;
          resolve();
          await new Promise<void>((done) => {
            finish = done;
          });
        },
      });
    });
    await addPhoto(jobs);
    await sendStarted;
    expect(storedKeys(map).length).toBeGreaterThan(1);

    await discardMealPhotoJobs(storage);
    expect(storedKeys(map)).toEqual([]);
    expect(jobs.snapshot()).toEqual({});

    // The upload that was already running finishes after sign-out.
    await uploaded!(ASSET);
    finish();
    await settle();
    expect(storedKeys(map)).toEqual([]);
    expect(jobs.snapshot()).toEqual({});
    // Nothing is sent from a cleared queue, and a new photo is refused too.
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(storedKeys(map)).toEqual([]);
  });

  it("sign-out clears stored jobs even when no runner was started in this process", async () => {
    const { map, storage } = memory();
    const before = runner(storage);
    before.configure(fakeServer().deps);
    await addPhoto(before);
    before.dispose();
    expect(storedKeys(map).length).toBeGreaterThan(1);
    await discardMealPhotoJobs(storage);
    expect(storedKeys(map)).toEqual([]);
  });

  it("a session the server ended keeps the jobs for the same user, and nobody else gets them", async () => {
    const { map, storage } = memory();
    const first = mealPhotoJobsFor(OWNER, () => ({ storage, ownerId: OWNER, setTimer: () => null }));
    first.configure(fakeServer().deps);
    await addPhoto(first);
    stopMealPhotoJobs();
    expect(storedKeys(map).length).toBeGreaterThan(1);

    const server = fakeServer();
    server.state.meal = mealWith(ENTRY);
    const again = mealPhotoJobsFor(OWNER, () => ({ storage, ownerId: OWNER, setTimer: () => null }));
    expect(again).not.toBe(first);
    again.configure(server.deps);
    await again.start();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it("a different user after a server-ended session never sends or sees them", async () => {
    const { map, storage } = memory();
    const first = mealPhotoJobsFor(OWNER, () => ({ storage, ownerId: OWNER, setTimer: () => null }));
    first.configure(fakeServer().deps);
    await addPhoto(first);
    stopMealPhotoJobs();
    const other = "c0c0c0c0-0000-4000-8000-000000000001";
    const second = mealPhotoJobsFor(other, () => ({ storage, ownerId: other, setTimer: () => null }));
    const server = fakeServer();
    server.state.meal = mealWith(ENTRY);
    second.configure(server.deps);
    await second.start();
    await settle();
    expect(second.snapshot()).toEqual({});
    expect(server.send).not.toHaveBeenCalled();
    expect(storedKeys(map).filter((key) => key.includes(OWNER))).toEqual([]);
  });
});

describe("meal photo jobs: wait for pending edits and removals (Z14-34)", () => {
  const edit = (status = "pending") => ({ status, operation: "meal.edit", recordId: ENTRY });
  const removal = (status = "pending") => ({ status, operation: "meal.remove", recordId: ENTRY });

  it("does not attach ahead of a pending meal.edit, and goes when the outbox drains", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    server.state.meal = mealWith(ENTRY);
    server.state.outbox = [edit("in_flight")];
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    expect(jobs.snapshot()[MEAL]?.state).toBe("waiting");

    server.state.outbox = [];
    await jobs.kick();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.send.mock.calls[0]?.[1].entryId).toBe(ENTRY);
  });

  it("waits behind a pending meal.remove, then drops the job quietly once the removal settled", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    server.state.meal = mealWith(ENTRY);
    server.state.outbox = [removal()];
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    expect(jobs.snapshot()[MEAL]?.state).toBe("waiting");

    // The server applied the removal: the day has the meal but no log.
    server.state.outbox = [];
    server.state.meal = mealWith(null);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    expect(jobs.snapshot()).toEqual({});
  });

  it("a sent removal seen through a stale hint drops the job, bytes included", async () => {
    const { map, storage } = memory();
    const server = fakeServer();
    const jobs = runner(storage);
    jobs.configure(server.deps);
    jobs.setHints([mealWith(ENTRY) as MealAssignment]);
    server.state.outbox = [removal("sent")];
    await addPhoto(jobs);
    await jobs.kick();
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    expect(jobs.snapshot()).toEqual({});
    expect(storedKeys(map).filter((key) => key !== `${MEAL_PHOTO_JOBS_PREFIX}.index`)).toEqual([]);
  });

  it("re-checks when the outbox changes, not on a timer", async () => {
    const server = fakeServer();
    const jobs = runner();
    jobs.configure(server.deps);
    let notify: () => void = () => undefined;
    jobs.connect({
      outbox: {
        subscribe: (listener) => {
          notify = () => listener();
          return () => undefined;
        },
      },
    });
    server.state.meal = mealWith(ENTRY);
    server.state.outbox = [edit()];
    await addPhoto(jobs);
    await settle();
    expect(server.send).not.toHaveBeenCalled();
    server.state.outbox = [];
    notify();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(1);
  });
});
