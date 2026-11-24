import { describe, expect, it, vi } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE, type MeDayResponse } from "@fitbud/contracts";
import { dayKcalSummary } from "./nutrition";
import { enqueueAndPush } from "../sync/actions";
import { createMemorySyncStore, createSyncEngine, type SyncEngine } from "../sync/engine";
import {
  MealPhotoError,
  isMealLogPending,
  mealPhotoResize,
  pendingMealLogIds,
  plannedUntilSentNote,
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
      attachMealPhoto: vi.fn(async (entryId: string, body: { mediaAssetId: string }) => {
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
        .fn()
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
