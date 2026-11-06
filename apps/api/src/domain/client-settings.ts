/**
 * Z6-8 (v13 B3b): client settings for one trainer-owned relationship.
 *
 * Tracking only (D-W6-5): subscription terms and payment records the trainer
 * keeps for their own records. Nothing here collects, invoices or reminds to pay.
 *
 * - A subscription edit always inserts version N+1; earlier versions are never
 *   changed, so history and renewals keep their source rows.
 * - Payment records follow 0036's rules: amount > 0, paid ⇔ paid date and method,
 *   unpaid ⇒ neither (D-W6-22). The API rejects a bad state with 400 before the
 *   CHECK constraint can turn it into a 500.
 * - Every write is stored together with its idempotency receipt in one D1 batch,
 *   so a retry replays the first answer and never writes twice.
 *
 * Nothing in this module logs: names, phone numbers and notes stay out of logs.
 */
import { and, desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  clientSettingsResponseSchema,
  clientSettingsSubscriptionSchema,
  paymentRecordSchema,
  type ClientSettingsResponse,
  type ClientSettingsSubscription,
  type CreatePaymentRecordRequest,
  type PaymentRecord,
  type PutClientSubscriptionRequest,
  type UpdatePaymentRecordRequest,
} from "@fitbud/contracts";
import { deriveRenewalState, formatLocalDate } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  coachingRelationships,
  idempotencyRecords,
  paymentRecords,
  subscriptionVersions,
  traineeProfiles,
  userIdentities,
  users,
} from "../db/schema";
import { createId, sha256Hex } from "../lib/crypto";

type Write = BatchItem<"sqlite">;
type RelationshipRow = typeof coachingRelationships.$inferSelect;
type SubscriptionRow = typeof subscriptionVersions.$inferSelect;
type PaymentRow = typeof paymentRecords.$inferSelect;

export const CLIENT_SETTINGS_SUBSCRIPTION_OPERATION = "client_settings.subscription.put";
export const CLIENT_SETTINGS_PAYMENT_CREATE_OPERATION = "client_settings.payment.create";
export const CLIENT_SETTINGS_PAYMENT_UPDATE_OPERATION = "client_settings.payment.update";

const RECEIPT_TTL_DAYS = 7;

/** The relationship when the actor is its trainer; null otherwise (never disclosed). */
export async function loadOwnedRelationship(
  db: Db,
  relationshipId: string,
  trainerUserId: string,
): Promise<RelationshipRow | null> {
  const [row] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  if (!row || row.trainerUserId !== trainerUserId) return null;
  return row;
}

async function trainerToday(db: Db, trainerUserId: string, now: string) {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, trainerUserId))
    .limit(1);
  return formatLocalDate(new Date(now), row?.timezone ?? "UTC");
}

/** The newest version by number: the one renewals and settings read. */
export async function latestSubscriptionVersion(
  db: Db,
  relationshipId: string,
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptionVersions)
    .where(eq(subscriptionVersions.coachingRelationshipId, relationshipId))
    .orderBy(desc(subscriptionVersions.versionNumber))
    .limit(1);
  return row ?? null;
}

function presentSubscription(
  row: SubscriptionRow,
  today: string,
): ClientSettingsSubscription {
  return clientSettingsSubscriptionSchema.parse({
    id: row.id,
    versionNumber: row.versionNumber,
    planName: row.planName,
    paymentFrequency: row.paymentFrequency,
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    renewalState: deriveRenewalState({ today, renewsOn: row.renewsOn }),
    amountPaise: row.amountPaise ?? null,
    subscriptionType: row.subscriptionType ?? null,
    coachingMode: row.coachingMode ?? null,
    createdAt: row.createdAt,
  });
}

function presentPayment(row: PaymentRow): PaymentRecord {
  return paymentRecordSchema.parse({
    id: row.id,
    relationshipId: row.coachingRelationshipId,
    subscriptionVersionId: row.subscriptionVersionId,
    amountPaise: row.amountPaise,
    dueOn: row.dueOn,
    paidOn: row.paidOn ?? null,
    status: row.status,
    method: row.method ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function loadClientSettings(
  db: Db,
  relationship: RelationshipRow,
  now: string,
): Promise<ClientSettingsResponse> {
  const [profile, identity, subscription, payments, today] = await Promise.all([
    db
      .select({ displayName: traineeProfiles.displayName })
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, relationship.traineeUserId))
      .limit(1),
    db
      .select({ mobileE164: userIdentities.mobileE164 })
      .from(userIdentities)
      .where(eq(userIdentities.userId, relationship.traineeUserId))
      .limit(1),
    latestSubscriptionVersion(db, relationship.id),
    db
      .select()
      .from(paymentRecords)
      .where(eq(paymentRecords.coachingRelationshipId, relationship.id))
      .orderBy(desc(paymentRecords.dueOn), desc(paymentRecords.createdAt)),
    trainerToday(db, relationship.trainerUserId, now),
  ]);
  return clientSettingsResponseSchema.parse({
    relationshipId: relationship.id,
    relationshipStatus: relationship.status,
    startedAt: relationship.startedAt,
    endedAt: relationship.endedAt ?? null,
    readOnly: relationship.status === "ended",
    basics: {
      displayName: profile[0]?.displayName ?? "",
      phoneE164: identity[0]?.mobileE164 ?? null,
    },
    subscription: subscription ? presentSubscription(subscription, today) : null,
    payments: payments.map(presentPayment),
  });
}

/** Stored-response lookup: none, a replay of the first answer, or a reused key. */
export async function findReceipt(
  db: Db,
  input: { actorUserId: string; operation: string; idempotencyKey: string; fingerprint: string },
): Promise<
  | { kind: "none" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "reuse" }
> {
  const keyHash = await sha256Hex(input.idempotencyKey);
  const [row] = await db
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.actorUserId, input.actorUserId),
        eq(idempotencyRecords.operation, input.operation),
        eq(idempotencyRecords.keyHash, keyHash),
      ),
    )
    .limit(1);
  if (!row) return { kind: "none" };
  if (row.requestFingerprint !== input.fingerprint) return { kind: "reuse" };
  return { kind: "replay", status: row.responseStatus, body: JSON.parse(row.responseBody) };
}

/**
 * A plain insert (no "on conflict do nothing"): a concurrent request with the same
 * key fails the whole batch, so two identical requests can never both write.
 */
function receiptInsert(
  db: Db,
  input: {
    actorUserId: string;
    operation: string;
    keyHash: string;
    fingerprint: string;
    status: number;
    body: unknown;
    now: string;
  },
): Write {
  return db.insert(idempotencyRecords).values({
    id: createId(),
    actorUserId: input.actorUserId,
    operation: input.operation,
    keyHash: input.keyHash,
    requestFingerprint: input.fingerprint,
    responseStatus: input.status,
    responseBody: JSON.stringify(input.body),
    createdAt: input.now,
    expiresAt: new Date(
      Date.parse(input.now) + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
  });
}

export type WriteContext = {
  actorUserId: string;
  idempotencyKey: string;
  fingerprint: string;
  now: string;
};

/** Inserts subscription version `current + 1` with its receipt, atomically. */
export async function saveSubscriptionVersion(
  db: Db,
  relationship: RelationshipRow,
  currentVersion: number,
  request: PutClientSubscriptionRequest,
  context: WriteContext,
): Promise<{ status: 200; body: { data: ClientSettingsSubscription } }> {
  const row: SubscriptionRow = {
    id: createId(),
    coachingRelationshipId: relationship.id,
    versionNumber: currentVersion + 1,
    planName: request.planName,
    paymentFrequency: request.paymentFrequency,
    startsOn: request.startsOn,
    renewsOn: request.renewsOn,
    createdAt: context.now,
    amountPaise: request.amountPaise,
    subscriptionType: request.subscriptionType,
    coachingMode: request.coachingMode,
  };
  const today = await trainerToday(db, relationship.trainerUserId, context.now);
  const body = { data: presentSubscription(row, today) };
  const keyHash = await sha256Hex(context.idempotencyKey);
  await db.batch([
    // The (relationship, version_number) unique index rejects a concurrent vN+1.
    db.insert(subscriptionVersions).values(row),
    receiptInsert(db, {
      actorUserId: context.actorUserId,
      operation: CLIENT_SETTINGS_SUBSCRIPTION_OPERATION,
      keyHash,
      fingerprint: context.fingerprint,
      status: 200,
      body,
      now: context.now,
    }),
  ]);
  return { status: 200, body };
}

/** Records a payment against the given (newest) subscription version. */
export async function createPaymentRecord(
  db: Db,
  relationship: RelationshipRow,
  subscriptionVersionId: string,
  request: CreatePaymentRecordRequest,
  context: WriteContext,
): Promise<{ status: 201; body: { data: PaymentRecord } }> {
  const paid = request.status === "paid";
  const row: PaymentRow = {
    id: createId(),
    coachingRelationshipId: relationship.id,
    subscriptionVersionId,
    amountPaise: request.amountPaise,
    dueOn: request.dueOn,
    paidOn: paid ? (request.paidOn ?? null) : null,
    status: request.status,
    method: paid ? (request.method ?? null) : null,
    note: normaliseNote(request.note),
    createdBy: context.actorUserId,
    createdAt: context.now,
    updatedAt: context.now,
  };
  const body = { data: presentPayment(row) };
  const keyHash = await sha256Hex(context.idempotencyKey);
  await db.batch([
    db.insert(paymentRecords).values(row),
    receiptInsert(db, {
      actorUserId: context.actorUserId,
      operation: CLIENT_SETTINGS_PAYMENT_CREATE_OPERATION,
      keyHash,
      fingerprint: context.fingerprint,
      status: 201,
      body,
      now: context.now,
    }),
  ]);
  return { status: 201, body };
}

export async function loadRelationshipPayment(
  db: Db,
  relationshipId: string,
  paymentId: string,
): Promise<PaymentRow | null> {
  const [row] = await db
    .select()
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.id, paymentId),
        eq(paymentRecords.coachingRelationshipId, relationshipId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function normaliseNote(note: string | null | undefined): string | null {
  if (note === undefined || note === null) return null;
  return note.length > 0 ? note : null;
}

export type PaymentPatchResult =
  | { ok: true; next: Pick<PaymentRow, "status" | "paidOn" | "method" | "note"> }
  | { ok: false; reason: "paid_needs_date_and_method" | "unpaid_has_no_date_or_method" };

/**
 * The row a PATCH would produce. Going back to unpaid clears the paid date and
 * method (D-W6-22); marking paid needs both, sent now or already stored; an
 * unpaid row never takes a paid date or method.
 */
export function applyPaymentPatch(
  current: Pick<PaymentRow, "status" | "paidOn" | "method" | "note">,
  patch: UpdatePaymentRecordRequest,
): PaymentPatchResult {
  const status = patch.status ?? current.status;
  const note = patch.note !== undefined ? normaliseNote(patch.note) : current.note;
  if (status === "unpaid") {
    if (patch.paidOn || patch.method) {
      return { ok: false, reason: "unpaid_has_no_date_or_method" };
    }
    return { ok: true, next: { status, paidOn: null, method: null, note } };
  }
  const paidOn = patch.paidOn !== undefined ? patch.paidOn : current.paidOn;
  const method = patch.method !== undefined ? patch.method : current.method;
  if (!paidOn || !method) {
    return { ok: false, reason: "paid_needs_date_and_method" };
  }
  return { ok: true, next: { status, paidOn, method, note } };
}

export async function updatePaymentRecord(
  db: Db,
  current: PaymentRow,
  next: Pick<PaymentRow, "status" | "paidOn" | "method" | "note">,
  context: WriteContext,
): Promise<{ status: 200; body: { data: PaymentRecord } }> {
  const row: PaymentRow = { ...current, ...next, updatedAt: context.now };
  const body = { data: presentPayment(row) };
  const keyHash = await sha256Hex(context.idempotencyKey);
  await db.batch([
    db
      .update(paymentRecords)
      .set({ ...next, updatedAt: context.now })
      .where(
        and(
          eq(paymentRecords.id, current.id),
          eq(paymentRecords.coachingRelationshipId, current.coachingRelationshipId),
        ),
      ),
    receiptInsert(db, {
      actorUserId: context.actorUserId,
      operation: CLIENT_SETTINGS_PAYMENT_UPDATE_OPERATION,
      keyHash,
      fingerprint: context.fingerprint,
      status: 200,
      body,
      now: context.now,
    }),
  ]);
  return { status: 200, body };
}
