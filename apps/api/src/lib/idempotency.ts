import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { idempotencyRecords } from "../db/schema";
import { createId, nowIso, sha256Hex } from "./crypto";

export type IdempotencyLookup = {
  responseStatus: number;
  responseBody: string;
  requestFingerprint: string;
};

export async function findIdempotencyRecord(
  db: Db,
  input: {
    actorUserId: string;
    operation: string;
    idempotencyKey: string;
  },
): Promise<IdempotencyLookup | null> {
  const keyHash = await sha256Hex(input.idempotencyKey);
  const result = await db
    .select({
      responseStatus: idempotencyRecords.responseStatus,
      responseBody: idempotencyRecords.responseBody,
      requestFingerprint: idempotencyRecords.requestFingerprint,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.actorUserId, input.actorUserId),
        eq(idempotencyRecords.operation, input.operation),
        eq(idempotencyRecords.keyHash, keyHash),
        gt(idempotencyRecords.expiresAt, nowIso()),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export async function saveIdempotencyRecord(
  db: Db,
  input: {
    actorUserId: string;
    operation: string;
    idempotencyKey: string;
    requestFingerprint: string;
    responseStatus: number;
    responseBody: unknown;
    expiresAt: string;
  },
): Promise<void> {
  const keyHash = await sha256Hex(input.idempotencyKey);
  await db.insert(idempotencyRecords).values({
    id: createId(),
    actorUserId: input.actorUserId,
    operation: input.operation,
    keyHash,
    requestFingerprint: input.requestFingerprint,
    responseStatus: input.responseStatus,
    responseBody: JSON.stringify(input.responseBody),
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
  });
}
