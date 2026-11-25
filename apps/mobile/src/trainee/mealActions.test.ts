import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE, type MeDayResponse } from "@fitbud/contracts";
import { dayKcalSummary } from "./nutrition";
import { enqueueAndPush } from "../sync/actions";
import { createMemorySyncStore, createSyncEngine, type SyncEngine } from "../sync/engine";
import {
  MealPhotoError,
  base64ToBytes,
  bytesToBase64,
  editMealEntry,
  hasQueuedMealEdit,
  isMealLogPending,
  isMealPhotoUnfinished,
  pruneSentEdits,
  mealEditState,
  mealEditUntilLabel,
  mealPhotoFailureCopy,
  mealPhotoResize,
  pendingMealLogIds,
  overlayMealEdits,
  plannedUntilSentNote,
  nextRecordVersion,
  recordAttachedMealVersion,
  removeMealEntry,
  uploadAndAttachMealPhoto,
} from "./mealActions";

const SLOT = "00000000-0000-4000-8000-0000000000a1";

function lunch(status: MealAssignment["status"]): MealAssignment {
  return {
    id: "00000000-0000-4000-8000-0000000000b1",
    mealName: "Lunch",
    status,
    compliance: null,
    prescription: {
      id: SLOT,
      mealSlotKey: "lunch",
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000c1",
          foodId: "00000000-0000-4000-8000-0000000000c2",
          servingId: "00000000-0000-4000-8000-0000000000c3",
          quantity: 1,
          label: "Dal",
          calculated: {
            energyKcalScaled: 620 * NUTRIENT_SCALE,
            proteinScaled: 20 * NUTRIENT_SCALE,
            carbsScaled: 60 * NUTRIENT_SCALE,
            fatScaled: 10 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    },
  } as unknown as MealAssignment;
}

describe("offline meal log: optimistic add and reconcile", () => {
  it("an unsent Eaten as planned adds the planned kcal at once", () => {
    expect(dayKcalSummary([lunch("pending")], null).loggedTotal).toBe(0);
    expect(dayKcalSummary([lunch("confirmed")], null).loggedTotal).toBe(620);
  });

  it("after sync the server per-meal total replaces the planned figure", () => {
    const totals = {
      kcalScaled: 600 * NUTRIENT_SCALE,
      perMeal: [{ slotKey: SLOT, kcalScaled: 600 * NUTRIENT_SCALE }],
    } as unknown as MeDayResponse["totals"];
    const out = dayKcalSummary([lunch("confirmed")], totals);
    expect(out.loggedTotal).toBe(600);
  });
});

describe("pending outbox helpers", () => {
  const row = (operation: string, status: string, recordId: string) => ({
    operation,
    status,
    recordId,
  });

  it("collects only unsent meal logs", () => {
    const ids = pendingMealLogIds([
      row("meal.confirm", "pending", "a"),
      row("meal.skip", "in_flight", "b"),
      row("meal.confirm", "acked", "c"),
      row("workout.start", "pending", "d"),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("names the meals counted as planned until sent", () => {
    const m = lunch("confirmed");
    expect(plannedUntilSentNote([m], new Set([m.id]))).toBe(
      "Lunch is counted as planned until it's sent",
    );
    expect(plannedUntilSentNote([m], new Set())).toBeNull();
    expect(plannedUntilSentNote([{ ...m, status: "skipped" }], new Set([m.id]))).toBeNull();
  });
});

describe("isMealLogPending", () => {
  const offlineApi = {
    pushSync: async () => {
      throw new Error("offline");
    },
    pullSync: async () => {
      throw new Error("offline");
    },
  };

  it("is true after an offline confirm is queued, false for another meal", async () => {
    const engine = createSyncEngine(createMemorySyncStore(), offlineApi);
    const m = lunch("pending");
    await enqueueAndPush(engine, {
      recordId: m.id,
      operation: "meal.confirm",
      payload: { assignmentId: m.id, body: { photoIntent: null } },
    });
    expect(await isMealLogPending(engine, m.id)).toBe(true);
    expect(await isMealLogPending(engine, "other")).toBe(false);
  });

  it("is false once the server acknowledged it, or when the store cannot be read", async () => {
    const engine = createSyncEngine(createMemorySyncStore(), offlineApi);
    const { mutationId } = await enqueueAndPush(engine, {
      recordId: "m1",
      operation: "meal.confirm",
      payload: { assignmentId: "m1", body: { photoIntent: null } },
    });
    await engine.store.updateOutboxStatus(mutationId, "acked");
    expect(await isMealLogPending(engine, "m1")).toBe(false);
    const broken = {
      store: {
        listOutbox: async () => {
          throw new Error("store unavailable");
        },
      },
    } as unknown as SyncEngine;
    expect(await isMealLogPending(broken, "m1")).toBe(false);
  });
});

describe("meal photo (D-W14-11)", () => {
  it("resizes only past 1600 px, on the long edge", () => {
    expect(mealPhotoResize(4032, 3024)).toEqual({ width: 1600 });
    expect(mealPhotoResize(3024, 4032)).toEqual({ height: 1600 });
    expect(mealPhotoResize(1600, 900)).toBeNull();
    expect(mealPhotoResize(800, 600)).toBeNull();
  });

  it("keeps the JPEG bytes intact through the device store's text form", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    }
    expect(bytesToBase64(new Uint8Array([255, 216, 255]))).toBe("/9j/");
  });

  it("reuses the job's upload key and keeps the asset id before the attach", async () => {
    const keys: string[] = [];
    const order: string[] = [];
    const api = {
      createUploadTarget: vi.fn(async (_body: unknown, key: string) => {
        keys.push(key);
        return { mediaAsset: { id: "00000000-0000-4000-8000-0000000000d1" } };
      }),
      uploadMediaContent: vi.fn(async () => undefined),
      attachMealPhoto: vi.fn(async () => {
        order.push("attach");
      }),
    };
    await uploadAndAttachMealPhoto(api as never, {
      relationshipId: SLOT,
      assignmentId: SLOT,
      entryId: SLOT,
      bytes: new Uint8Array([1]),
      attachKey: "attach-key",
      uploadKey: "upload-key",
      onUploaded: (id) => {
        order.push(`uploaded:${id}`);
      },
    });
    expect(keys).toEqual(["upload-key"]);
    expect(order).toEqual(["uploaded:00000000-0000-4000-8000-0000000000d1", "attach"]);
  });

  it("a server failure reads as TR-07m3; only a lost connection says offline", () => {
    expect(
      mealPhotoFailureCopy(new ApiClientError({ status: 500, code: "INTERNAL_ERROR", message: "x" } as never)),
    ).toBe("Photo didn't upload. Your meal is still logged.");
    expect(mealPhotoFailureCopy(new TypeError("Network request failed"))).toMatch(/offline/);
  });

  it("no longer uploads a placeholder image", async () => {
    const actions = (await import("./mealActions")) as Record<string, unknown>;
    expect(actions.uploadMealPhoto).toBeUndefined();
    expect(actions.attachMealPhotoBestEffort).toBeUndefined();
  });

  it("uploads the JPEG through the files flow, then attaches it to the entry", async () => {
    const calls: string[] = [];
    const api = {
      createUploadTarget: vi.fn(async (body: { contentType: string; mediaType: string }) => {
        calls.push(`target:${body.mediaType}:${body.contentType}`);
        return { mediaAsset: { id: "00000000-0000-4000-8000-0000000000d1" } };
      }),
      uploadMediaContent: vi.fn(async (_id: string, bytes: Uint8Array, type: string) => {
        calls.push(`upload:${bytes.length}:${type}`);
      }),
      attachMealPhoto: vi.fn<(entryId: string, body: { mediaAssetId: string }, key: string) => Promise<void>>(async (entryId, body) => {
        calls.push(`attach:${entryId}:${body.mediaAssetId}`);
      }),
    };
    const out = await uploadAndAttachMealPhoto(api as never, {
      relationshipId: "rel",
      assignmentId: "asg",
      entryId: "entry-1",
      bytes: new Uint8Array([1, 2, 3]),
      attachKey: "key-1",
    });
    expect(out.mediaAssetId).toBe("00000000-0000-4000-8000-0000000000d1");
    expect(calls).toEqual([
      "target:meal_photo:image/jpeg",
      "upload:3:image/jpeg",
      "attach:entry-1:00000000-0000-4000-8000-0000000000d1",
    ]);
    expect(api.attachMealPhoto.mock.calls[0]?.[2]).toBe("key-1");
  });

  it("an upload failure is a friendly error, never silent", async () => {
    const api = {
      createUploadTarget: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const err = await uploadAndAttachMealPhoto(api as never, {
      relationshipId: "rel",
      assignmentId: "asg",
      entryId: "entry-1",
      bytes: new Uint8Array([1]),
      attachKey: "k",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MealPhotoError);
    expect((err as MealPhotoError).step).toBe("upload");
    expect((err as MealPhotoError).message).not.toMatch(/boom/);
  });

  it("a retry after a failed attach reuses the uploaded asset and the same key", async () => {
    const api = {
      createUploadTarget: vi.fn(),
      uploadMediaContent: vi.fn(),
      attachMealPhoto: vi
        .fn<(entryId: string, body: unknown, key: string) => Promise<void>>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(undefined),
    };
    const input = {
      relationshipId: "rel",
      assignmentId: "asg",
      entryId: "entry-1",
      bytes: new Uint8Array([1]),
      attachKey: "k",
      mediaAssetId: "00000000-0000-4000-8000-0000000000d2",
    };
    const first = await uploadAndAttachMealPhoto(api as never, input).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(MealPhotoError);
    expect((first as MealPhotoError).step).toBe("attach");
    await uploadAndAttachMealPhoto(api as never, input);
    expect(api.createUploadTarget).not.toHaveBeenCalled();
    expect(api.attachMealPhoto).toHaveBeenCalledTimes(2);
    expect(api.attachMealPhoto.mock.calls[1]?.[2]).toBe("k");
  });
});

describe("edit or remove a logged entry for 24 hours (Z14-13b, D-W14-22)", () => {
  const ENTRY = "00000000-0000-4000-8000-0000000000e1";
  const logged = (extra: Record<string, unknown> = {}): MealAssignment =>
    ({
      ...lunch("confirmed"),
      compliance: {
        id: ENTRY,
        outcome: "confirmed",
        recordVersion: 4,
        loggedAt: "2026-11-24T08:00:00.000Z",
        deviationKind: null,
        notes: null,
        editableUntil: "2026-11-25T08:00:00.000Z",
        canRemove: true,
        ...extra,
      },
    }) as unknown as MealAssignment;
  const NOW = Date.parse("2026-11-24T09:00:00.000Z");
  const none = new Set<string>();

  it("reads the buttons from the server's editableUntil and canRemove, never its own clock rule", () => {
    const open = mealEditState(logged(), { unsentIds: none, lockStateKnown: true, now: NOW });
    expect(open).toMatchObject({ canEdit: true, canRemove: true, locked: false });
    const noRemove = mealEditState(logged({ canRemove: false }), { unsentIds: none, lockStateKnown: true, now: NOW });
    expect(noRemove).toMatchObject({ canEdit: true, canRemove: false });
    // Logged 30 h ago by the phone's clock, but the server still says editable: trust the server.
    const late = mealEditState(logged({ loggedAt: "2026-11-23T01:00:00.000Z" }), { unsentIds: none, lockStateKnown: true, now: NOW });
    expect(late.canEdit).toBe(true);
    const passed = mealEditState(logged(), { unsentIds: none, lockStateKnown: true, now: Date.parse("2026-11-25T08:00:01.000Z") });
    expect(passed).toMatchObject({ canEdit: false, canRemove: false, locked: true });
    const noWindow = mealEditState(logged({ editableUntil: null }), { unsentIds: none, lockStateKnown: true, now: NOW });
    expect(noWindow).toMatchObject({ canEdit: false, locked: true });
  });

  it("offers nothing while the log waits to send, or is skipped, or the lock state is unknown", () => {
    const meal = logged();
    expect(mealEditState(meal, { unsentIds: new Set([meal.id]), lockStateKnown: true, now: NOW })).toMatchObject({ canEdit: false, locked: false });
    expect(mealEditState({ ...meal, status: "skipped" }, { unsentIds: none, lockStateKnown: true, now: NOW }).canEdit).toBe(false);
    expect(mealEditState(meal, { unsentIds: none, lockStateKnown: false, now: NOW }).locked).toBe(false);
  });

  it("words the window: today, tomorrow, then a date", () => {
    const now = new Date("2026-11-14T07:00:00.000Z");
    expect(mealEditUntilLabel("2026-11-14T15:22:00.000Z", "Asia/Kolkata", now)).toBe("today, 8:52 pm");
    expect(mealEditUntilLabel("2026-11-15T11:50:00.000Z", "Asia/Kolkata", now)).toBe("tomorrow, 5:20 pm");
    expect(mealEditUntilLabel("2026-11-16T11:50:00.000Z", "Asia/Kolkata", now)).toMatch(/^Mon 16 Nov, 5:20 pm$/);
  });

  it("queues the edit with the entry's version, and a second one with the next version", async () => {
    const sync = createSyncEngine(createMemorySyncStore(), {
      pushSync: async () => {
        throw new Error("offline");
      },
      pullSync: async () => {
        throw new Error("offline");
      },
    });
    const meal = logged();
    const display = { loggedItems: [], kcal: 900 };
    const body = { outcome: "modified" as const, deviationKind: "restaurant" as const, notes: null };
    await editMealEntry(sync, meal, { body, display, relationshipId: "rel" });
    await editMealEntry(sync, meal, { body, display, relationshipId: "rel" });
    await removeMealEntry(sync, meal, "rel");
    const rows = await sync.store.listOutbox();
    expect(rows.map((row) => row.operation)).toEqual(["meal.edit", "meal.edit", "meal.remove"]);
    expect(rows.every((row) => row.recordId === ENTRY)).toBe(true);
    expect(rows.map((row) => (JSON.parse(row.payloadJson) as { body: { recordVersion: number } }).body.recordVersion)).toEqual([4, 5, 6]);
    expect(new Set(rows.map((row) => row.mutationId)).size).toBe(3);
  });

  it("paints a waiting edit or removal over the server copy, and not a refused one", () => {
    const row = (operation: string, status: string, body: unknown) => ({
      operation,
      status,
      recordId: ENTRY,
      payloadJson: JSON.stringify({ entryId: ENTRY, body, display: { loggedItems: [], kcal: 900 } }),
    });
    const edit = { outcome: "modified", deviationKind: "restaurant", notes: "Dosa" };
    const [painted] = overlayMealEdits([logged()], [row("meal.edit", "pending", edit)]);
    expect(painted?.status).toBe("modified");
    expect(painted?.compliance).toMatchObject({ deviationKind: "restaurant", notes: "Dosa", lastEditedByRole: "trainee" });
    expect(painted?.compliance?.loggedTotals?.energyKcal).toBe(900);
    const [refused] = overlayMealEdits([logged()], [row("meal.edit", "rejected", edit)]);
    expect(refused?.status).toBe("confirmed");
    const [removed] = overlayMealEdits([logged()], [row("meal.remove", "in_flight", {})]);
    expect(removed).toMatchObject({ status: "pending", compliance: null });
  });

  /** An engine whose server takes every row and answers with the entry's next version. */
  function applyingEngine(startVersion: number) {
    let version = startVersion;
    return createSyncEngine(createMemorySyncStore(), {
      pushSync: async (body) => ({
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.mutationId,
          status: "applied" as const,
          recordId: mutation.recordId,
          serverVersion: ++version,
          entityType: mutation.entityType,
          error: null,
        })),
      }),
      pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
    });
  }
  const versionOf = (row: { payloadJson: string }) =>
    (JSON.parse(row.payloadJson) as { body: { recordVersion: number } }).body.recordVersion;

  it("after an edit applied and the day is not refreshed, the next edit carries V+1, not the stale V", async () => {
    const sync = applyingEngine(4);
    const meal = logged(); // the day still says recordVersion 4
    const display = { loggedItems: [], kcal: 900 };
    const body = { outcome: "modified" as const, deviationKind: "restaurant" as const, notes: null };
    await editMealEntry(sync, meal, { body, display, relationshipId: "rel" });
    await vi.waitFor(async () => expect(await sync.store.listOutbox()).toHaveLength(0));
    expect((await sync.store.getLocal("meal_compliance", ENTRY))?.serverVersion).toBe(5);
    // Applied, row gone, day copy untouched: the stale version would be refused (409).
    // The day was never refreshed (or its refresh failed): same stale copy, offline phone, same store.
    const offline = createSyncEngine(sync.store, {
      pushSync: async () => {
        throw new Error("offline");
      },
      pullSync: async () => {
        throw new Error("offline");
      },
    });
    await editMealEntry(offline, meal, { body, display, relationshipId: "rel" });
    const [second] = await sync.store.listOutbox();
    expect(versionOf(second!)).toBe(5);
    expect(second?.expectedServerVersion).toBe(5);
    // A queued row on top of the applied one still counts.
    await removeMealEntry(offline, meal, "rel");
    const rows = await sync.store.listOutbox();
    expect(rows.map(versionOf)).toEqual([5, 6]);
  });

  it("after a photo attach the next edit carries the version the attach returned, not the stale one", async () => {
    const sync = createSyncEngine(createMemorySyncStore(), {
      pushSync: async () => {
        throw new Error("offline");
      },
      pullSync: async () => {
        throw new Error("offline");
      },
    });
    const meal = logged(); // the day still says recordVersion 4
    const entry = meal.compliance!;
    // Without the bookkeeping the stale version is what the next edit would send.
    expect(await nextRecordVersion(sync, entry)).toBe(4);

    await recordAttachedMealVersion(sync, { id: entry.id, recordVersion: 5 });
    expect(await nextRecordVersion(sync, entry)).toBe(5);
    const display = { loggedItems: [], kcal: 900 };
    const body = { outcome: "modified" as const, deviationKind: "restaurant" as const, notes: null };
    await editMealEntry(sync, meal, { body, display, relationshipId: "rel" });
    const [row] = await sync.store.listOutbox();
    expect(versionOf(row!)).toBe(5);

    // An older answer never lowers the version already held.
    await recordAttachedMealVersion(sync, { id: entry.id, recordVersion: 3 });
    expect((await sync.store.getLocal("meal_compliance", entry.id))?.serverVersion).toBe(5);
  });

  it("knows when a photo is unfinished and when an edit is queued", () => {
    for (const state of ["preparing", "waiting", "uploading"]) {
      expect(isMealPhotoUnfinished({ state })).toBe(true);
    }
    for (const state of ["failed", "done"]) expect(isMealPhotoUnfinished({ state })).toBe(false);
    expect(isMealPhotoUnfinished(undefined)).toBe(false);
    const rows = [
      { status: "pending", operation: "meal.edit", recordId: ENTRY },
      { status: "acked", operation: "meal.remove", recordId: "other" },
    ];
    expect(hasQueuedMealEdit(rows, ENTRY)).toBe(true);
    expect(hasQueuedMealEdit(rows, "other")).toBe(false);
    expect(hasQueuedMealEdit([], ENTRY)).toBe(false);
  });

  it("drops a sent row once the refreshed day carries its result", () => {
    const sentEdit = {
      status: "sent",
      operation: "meal.edit",
      recordId: ENTRY,
      payloadJson: JSON.stringify({ body: { recordVersion: 4 } }),
    };
    const sentRemove = { ...sentEdit, operation: "meal.remove" };
    // Day still at the edited version: keep painting the edit.
    expect(pruneSentEdits([sentEdit], [logged()])).toHaveLength(1);
    // Day moved past it: clear.
    expect(pruneSentEdits([sentEdit], [logged({ recordVersion: 5 })])).toHaveLength(0);
    // A removal clears once the entry is gone from the day.
    expect(pruneSentEdits([sentRemove], [logged()])).toHaveLength(1);
    expect(pruneSentEdits([sentRemove], [lunch("pending")])).toHaveLength(0);
  });
});
