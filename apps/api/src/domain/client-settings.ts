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
 * - Every subscription, payment and basics write is stored together with its
 *   idempotency receipt in one D1 batch, so a retry replays the first answer and
 *   never writes twice. A duplicate key fails the batch and rolls the write
 *   back with the receipt. Basics inserts that receipt only when its
 *   conditional UPDATE changed a row; see `saveClientBasics`.
 * - Z8-17: subscription saves, payment updates and basics writes are conditional
 *   in SQL on what the request read (the version it builds on, the payment row
 *   it patched) and on the relationship still being this trainer's and active.
 *   A write that loses a race changes nothing and stores no receipt, so the
 *   route answers a static conflict instead of a constraint 500 or a silent
 *   overwrite.
 *
 * - Basic details (Z6-8b, D-W6-42): the trainer-owned client name and contact
 *   phone live on the coaching relationship only. This module never writes
 *   `user_identities` (the client's sign-in identifier) or `trainee_profiles`
 *   (the client's own name); `GET` returns both sets of values unmerged.
 *
 * Nothing in this module logs: names, phone numbers and notes stay out of logs.
 */
import { and, desc, eq, sql } from "drizzle-orm";
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
export const CLIENT_SETTINGS_BASICS_OPERATION = "client_settings.basics.patch";

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
      clientDisplayName: relationship.clientDisplayName ?? null,
      contactPhoneE164: relationship.contactPhoneE164 ?? null,
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

/** This trainer's relationship, and only while it is still active. */
function activeOwnedRelationship(relationship: Pick<RelationshipRow, "id" | "trainerUserId">) {
  return and(
    eq(coachingRelationships.id, relationship.id),
    eq(coachingRelationships.trainerUserId, relationship.trainerUserId),
    eq(coachingRelationships.status, "active"),
  );
}

const sqlValue = <T>(value: T, alias: string) => sql<T>`${value}`.as(alias);

/**
 * Receipt inserted only when the write just ahead of it in the same batch
 * changed exactly one row and the relationship is still this trainer's and
 * active. A zero-row write (lost a race, already ended, or not this trainer)
 * stores nothing. A duplicate key fails this insert and rolls the write back
 * with it (a plain insert, no "on conflict do nothing", so two identical
 * requests can never both write). Basics (Z7-25), subscription saves, payment
 * creates and payment updates (Z8-17).
 */
function conditionalReceiptInsert(
  db: Db,
  input: {
    relationship: Pick<RelationshipRow, "id" | "trainerUserId">;
    operation: string;
    status: number;
    actorUserId: string;
    keyHash: string;
    fingerprint: string;
    body: unknown;
    now: string;
  },
): Write {
  const expiresAt = new Date(
    Date.parse(input.now) + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return db.insert(idempotencyRecords).select(
    db
      .select({
        id: sqlValue(createId(), "id"),
        actorUserId: sqlValue(input.actorUserId, "actor_user_id"),
        operation: sqlValue(input.operation, "operation"),
        keyHash: sqlValue(input.keyHash, "key_hash"),
        requestFingerprint: sqlValue(input.fingerprint, "request_fingerprint"),
        responseStatus: sqlValue(input.status, "response_status"),
        responseBody: sqlValue(JSON.stringify(input.body), "response_body"),
        createdAt: sqlValue(input.now, "created_at"),
        expiresAt: sqlValue(expiresAt, "expires_at"),
      })
      .from(coachingRelationships)
      .where(and(activeOwnedRelationship(input.relationship), sql`changes() = 1`)),
  );
}

export type WriteContext = {
  actorUserId: string;
  idempotencyKey: string;
  fingerprint: string;
  now: string;
};

export type SaveSubscriptionResult =
  | { kind: "saved"; status: 200; body: { data: ClientSettingsSubscription } }
  /** Another save landed a newer version first; nothing was written. */
  | { kind: "conflict"; currentVersion: number }
  /** The relationship was not active at write time; nothing was written. */
  | { kind: "ended" }
  /** The relationship no longer belongs to this trainer; nothing was written. */
  | { kind: "not_found" };

/** After a zero-row conditional write: ended or no longer owned, else null. */
async function whyRefused(
  db: Db,
  relationship: Pick<RelationshipRow, "id" | "trainerUserId">,
): Promise<{ kind: "ended" } | { kind: "not_found" } | null> {
  const after = await loadOwnedRelationship(db, relationship.id, relationship.trainerUserId);
  if (!after) return { kind: "not_found" };
  if (after.status !== "active") return { kind: "ended" };
  return null;
}

/**
 * Inserts subscription version `currentVersion + 1` with its receipt, atomically.
 *
 * Z8-17: the insert is an INSERT ... SELECT that matches only while the newest
 * stored version is still `currentVersion` and the relationship is this
 * trainer's and active. Two saves that both read vN therefore never both reach
 * the (relationship, version_number) unique index (which used to fail the batch
 * and surface as a 500): the one that commits second inserts nothing, stores no
 * receipt, and is answered from a fresh read as a version conflict, ended or not
 * found. Earlier versions are never changed.
 */
export async function saveSubscriptionVersion(
  db: Db,
  relationship: RelationshipRow,
  currentVersion: number,
  request: PutClientSubscriptionRequest,
  context: WriteContext,
): Promise<SaveSubscriptionResult> {
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
  const newestVersion = sql`(select coalesce(max(${subscriptionVersions.versionNumber}), 0) from ${subscriptionVersions} where ${subscriptionVersions.coachingRelationshipId} = ${relationship.id})`;
  const [written] = await db.batch([
    // drizzle's INSERT ... SELECT lists every column in table order.
    db.insert(subscriptionVersions).select(
      db
        .select({
          id: sqlValue(row.id, "id"),
          coachingRelationshipId: sqlValue(row.coachingRelationshipId, "coaching_relationship_id"),
          versionNumber: sqlValue(row.versionNumber, "version_number"),
          planName: sqlValue(row.planName, "plan_name"),
          paymentFrequency: sqlValue(row.paymentFrequency, "payment_frequency"),
          startsOn: sqlValue(row.startsOn, "starts_on"),
          renewsOn: sqlValue(row.renewsOn, "renews_on"),
          createdAt: sqlValue(row.createdAt, "created_at"),
          amountPaise: sqlValue(row.amountPaise, "amount_paise"),
          subscriptionType: sqlValue(row.subscriptionType, "subscription_type"),
          coachingMode: sqlValue(row.coachingMode, "coaching_mode"),
        })
        .from(coachingRelationships)
        .where(
          and(activeOwnedRelationship(relationship), sql`${newestVersion} = ${currentVersion}`),
        ),
    ),
    conditionalReceiptInsert(db, {
      relationship,
      operation: CLIENT_SETTINGS_SUBSCRIPTION_OPERATION,
      status: 200,
      actorUserId: context.actorUserId,
      keyHash,
      fingerprint: context.fingerprint,
      body,
      now: context.now,
    }),
  ]);
  if (written.meta.changes === 1) return { kind: "saved", status: 200, body };
  if (written.meta.changes !== 0) {
    throw new Error("saveSubscriptionVersion inserted more than one row");
  }
  const refused = await whyRefused(db, relationship);
  if (refused) return refused;
  const latest = await latestSubscriptionVersion(db, relationship.id);
  return { kind: "conflict", currentVersion: latest?.versionNumber ?? 0 };
}

export type CreatePaymentResult =
  | { kind: "saved"; status: 201; body: { data: PaymentRecord } }
  /** The relationship was not active at write time; nothing was written. */
  | { kind: "ended" }
  /** The relationship no longer belongs to this trainer; nothing was written. */
  | { kind: "not_found" };

/**
 * Records a payment against the given (newest) subscription version.
 *
 * Z8-17: the insert is an INSERT ... SELECT that matches only while the
 * relationship is this trainer's and active, so a POST that overlaps the
 * relationship ending inserts nothing and stores no receipt (ended clients are
 * read-only on the server). The answer then comes from a fresh read.
 */
export async function createPaymentRecord(
  db: Db,
  relationship: RelationshipRow,
  subscriptionVersionId: string,
  request: CreatePaymentRecordRequest,
  context: WriteContext,
): Promise<CreatePaymentResult> {
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
  const [written] = await db.batch([
    // drizzle's INSERT ... SELECT lists every column in table order.
    db.insert(paymentRecords).select(
      db
        .select({
          id: sqlValue(row.id, "id"),
          coachingRelationshipId: sqlValue(row.coachingRelationshipId, "coaching_relationship_id"),
          subscriptionVersionId: sqlValue(row.subscriptionVersionId, "subscription_version_id"),
          amountPaise: sqlValue(row.amountPaise, "amount_paise"),
          dueOn: sqlValue(row.dueOn, "due_on"),
          paidOn: sqlValue(row.paidOn, "paid_on"),
          status: sqlValue(row.status, "status"),
          method: sqlValue(row.method, "method"),
          note: sqlValue(row.note, "note"),
          createdBy: sqlValue(row.createdBy, "created_by"),
          createdAt: sqlValue(row.createdAt, "created_at"),
          updatedAt: sqlValue(row.updatedAt, "updated_at"),
        })
        .from(coachingRelationships)
        .where(activeOwnedRelationship(relationship)),
    ),
    conditionalReceiptInsert(db, {
      relationship,
      operation: CLIENT_SETTINGS_PAYMENT_CREATE_OPERATION,
      status: 201,
      actorUserId: context.actorUserId,
      keyHash,
      fingerprint: context.fingerprint,
      body,
      now: context.now,
    }),
  ]);
  if (written.meta.changes === 1) return { kind: "saved", status: 201, body };
  if (written.meta.changes !== 0) {
    throw new Error("createPaymentRecord inserted more than one row");
  }
  const refused = await whyRefused(db, relationship);
  if (refused) return refused;
  throw new Error("createPaymentRecord matched no row on an active relationship");
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

/** How often a payment PATCH is re-applied to a row that changed under it. */
export const PAYMENT_PATCH_ATTEMPTS = 3;

export type SavePaymentPatchResult =
  | { kind: "saved"; status: 200; body: { data: PaymentRecord } }
  /** The patch does not fit the newest row (D-W6-22); nothing was written. */
  | { kind: "invalid"; reason: "paid_needs_date_and_method" | "unpaid_has_no_date_or_method" }
  /** No such payment on this relationship. */
  | { kind: "payment_not_found" }
  /** The row changed under every attempt; nothing was written. */
  | { kind: "conflict" }
  /** The relationship was not active at write time; nothing was written. */
  | { kind: "ended" }
  /** The relationship no longer belongs to this trainer; nothing was written. */
  | { kind: "not_found" };

/**
 * Z8-17: applies a payment PATCH without losing a concurrent one.
 *
 * Merge rule: a PATCH changes only the fields it sends; every other field keeps
 * the value of the newest stored row, not of the row this request read first.
 * The UPDATE is a compare-and-set: it matches only while status, paid date,
 * method, note and updated_at are exactly what the patch was applied to, and
 * while the relationship is this trainer's and active. When another write
 * landed in between, nothing is written and the patch is re-applied to the
 * fresh row and re-validated, so a patch that no longer fits (a method sent
 * while the record was paid, landing after it went unpaid) gets the usual 400.
 * After PAYMENT_PATCH_ATTEMPTS lost races the answer is a conflict. The UPDATE
 * and its receipt are one batch; the receipt is stored only when the UPDATE
 * changed the row, and a duplicate key rolls the UPDATE back with it.
 */
export async function savePaymentPatch(
  db: Db,
  relationship: RelationshipRow,
  paymentId: string,
  patch: UpdatePaymentRecordRequest,
  context: WriteContext,
): Promise<SavePaymentPatchResult> {
  const keyHash = await sha256Hex(context.idempotencyKey);
  for (let attempt = 0; attempt < PAYMENT_PATCH_ATTEMPTS; attempt += 1) {
    const current = await loadRelationshipPayment(db, relationship.id, paymentId);
    if (!current) return { kind: "payment_not_found" };
    const applied = applyPaymentPatch(current, patch);
    if (!applied.ok) return { kind: "invalid", reason: applied.reason };
    const row: PaymentRow = { ...current, ...applied.next, updatedAt: context.now };
    const body = { data: presentPayment(row) };
    const [written] = await db.batch([
      db
        .update(paymentRecords)
        .set({ ...applied.next, updatedAt: context.now })
        .where(
          and(
            eq(paymentRecords.id, current.id),
            eq(paymentRecords.coachingRelationshipId, current.coachingRelationshipId),
            eq(paymentRecords.status, current.status),
            eq(paymentRecords.updatedAt, current.updatedAt),
            sql`${paymentRecords.paidOn} IS ${current.paidOn}`,
            sql`${paymentRecords.method} IS ${current.method}`,
            sql`${paymentRecords.note} IS ${current.note}`,
            sql`exists (select 1 from ${coachingRelationships} where ${activeOwnedRelationship(relationship)})`,
          ),
        ),
      conditionalReceiptInsert(db, {
        relationship,
        operation: CLIENT_SETTINGS_PAYMENT_UPDATE_OPERATION,
        status: 200,
        actorUserId: context.actorUserId,
        keyHash,
        fingerprint: context.fingerprint,
        body,
        now: context.now,
      }),
    ]);
    if (written.meta.changes === 1) return { kind: "saved", status: 200, body };
    if (written.meta.changes !== 0) {
      throw new Error("savePaymentPatch wrote more than one row");
    }
    const refused = await whyRefused(db, relationship);
    if (refused) return refused;
  }
  return { kind: "conflict" };
}

/**
 * Z7-25: the trainer-owned basics a PATCH sends. A field left out is left out of
 * the write too, so a concurrent PATCH of the other field is never overwritten
 * with a stale read; `null` clears the field.
 */
export type ClientBasicsPatch = Partial<
  Pick<RelationshipRow, "clientDisplayName" | "contactPhoneE164">
>;

export type SaveClientBasicsResult =
  | { kind: "saved"; status: 200; body: { data: ClientSettingsResponse } }
  /** The relationship was not active at write time; nothing was written. */
  | { kind: "ended" }
  /** The relationship no longer belongs to this trainer; nothing was written. */
  | { kind: "not_found" };

/**
 * Z6-8b: stores the trainer-owned client name and contact phone on the
 * relationship. Only these two columns of `coaching_relationships` change:
 * `updated_at` is left alone because nothing the client sees changed, and
 * `user_identities` and `trainee_profiles` are never written.
 *
 * Z7-25: the write is one conditional UPDATE that sets only the sent fields and
 * matches only while the relationship is this trainer's and `active`, so
 *  - two overlapping single-field PATCHes both persist (field merge in SQL, not a
 *    read-modify-write of both columns from a row read earlier), and
 *  - a relationship that ended after the route read it is refused with no change.
 * The UPDATE and its idempotency receipt are one D1 batch. The receipt insert
 * selects a row only when that UPDATE changed one (`changes() = 1`) and the
 * relationship is still this trainer's and active, so a zero-row update stores
 * no success receipt. A duplicate key fails the insert and rolls the UPDATE
 * back with it: a same-key request that loses the race does not leave its write
 * behind, and the route replays the winner or answers IDEMPOTENCY_KEY_REUSE.
 * The stored answer is built from a fresh read of the row just before the
 * batch. D1 has no interactive transaction, so the receipt cannot be filled
 * from the UPDATE's RETURNING inside that same batch.
 */
export async function saveClientBasics(
  db: Db,
  relationship: RelationshipRow,
  patch: ClientBasicsPatch,
  context: WriteContext,
): Promise<SaveClientBasicsResult> {
  const set: ClientBasicsPatch = {};
  if (patch.clientDisplayName !== undefined) set.clientDisplayName = patch.clientDisplayName;
  if (patch.contactPhoneE164 !== undefined) set.contactPhoneE164 = patch.contactPhoneE164;
  if (Object.keys(set).length === 0) {
    // The request schema needs at least one field; never issue an empty SET.
    throw new Error("saveClientBasics needs at least one field");
  }
  const current = await loadOwnedRelationship(
    db,
    relationship.id,
    relationship.trainerUserId,
  );
  if (!current) return { kind: "not_found" };
  if (current.status !== "active") return { kind: "ended" };
  // The patch overwrites only the sent fields. Anything committed to the other
  // field before this read stays in the stored answer; the UPDATE below does
  // not write that column, so a later commit of it is kept on the row.
  const body = {
    data: await loadClientSettings(db, { ...current, ...set }, context.now),
  };
  const keyHash = await sha256Hex(context.idempotencyKey);
  const [written] = await db.batch([
    db.update(coachingRelationships).set(set).where(activeOwnedRelationship(relationship)),
    conditionalReceiptInsert(db, {
      relationship,
      operation: CLIENT_SETTINGS_BASICS_OPERATION,
      status: 200,
      actorUserId: context.actorUserId,
      keyHash,
      fingerprint: context.fingerprint,
      body,
      now: context.now,
    }),
  ]);
  // The receipt insert uses the same `changes() = 1` test, so a saved answer
  // exists only together with its receipt. Zero rows means the relationship
  // ended or is not this trainer's; the insert matched nothing.
  if (written.meta.changes !== 1) {
    if (written.meta.changes !== 0) {
      throw new Error("saveClientBasics wrote more than one row");
    }
    const after = await loadOwnedRelationship(
      db,
      relationship.id,
      relationship.trainerUserId,
    );
    if (!after) return { kind: "not_found" };
    if (after.status !== "active") return { kind: "ended" };
    throw new Error("saveClientBasics matched no row on an active relationship");
  }
  return { kind: "saved", status: 200, body };
}
