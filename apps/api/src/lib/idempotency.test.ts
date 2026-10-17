import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createId } from "./crypto.js";
import { findIdempotencyRecord, saveIdempotencyRecord } from "./idempotency.js";
import { createMemoryDb } from "../test-support/memory-db.js";

describe("idempotency insert-first race", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("allows concurrent first inserts with the same key and fingerprint", async () => {
    const actorUserId = createId();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const payload = {
      actorUserId,
      operation: "test.op",
      idempotencyKey: "race-key-1",
      requestFingerprint: "fp-1",
      responseStatus: 201,
      responseBody: { ok: true },
      expiresAt,
    };

    await Promise.all([
      saveIdempotencyRecord(db, payload),
      saveIdempotencyRecord(db, payload),
    ]);

    const stored = await findIdempotencyRecord(db, {
      actorUserId,
      operation: "test.op",
      idempotencyKey: "race-key-1",
    });
    expect(stored).toMatchObject({
      responseStatus: 201,
      requestFingerprint: "fp-1",
    });
    expect(stored?.responseBody).toBe(JSON.stringify({ ok: true }));
  });

  it("throws when a concurrent insert reuses the key with a different fingerprint", async () => {
    const actorUserId = createId();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const base = {
      actorUserId,
      operation: "test.op",
      idempotencyKey: "race-key-2",
      responseStatus: 200,
      responseBody: { ok: true },
      expiresAt,
    };

    await saveIdempotencyRecord(db, {
      ...base,
      requestFingerprint: "fp-a",
    });

    await expect(
      saveIdempotencyRecord(db, {
        ...base,
        requestFingerprint: "fp-b",
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
});
