import { and, eq, lt, sql } from "drizzle-orm";
import type { Role } from "@fitbud/contracts";
import { resolveSelectedRole } from "@fitbud/core";
import type { Db } from "../db/client";
import {
  traineeProfiles,
  trainerProfiles,
  userRoles,
  users,
  webSessions,
} from "../db/schema";
import { addDaysIso, createId, createSessionToken, nowIso, sha256Hex } from "../lib/crypto";
import type { ActorContext } from "../types";
import type { VerifiedFirebaseIdentity } from "./firebase";

/**
 * Per-request memo of `user_roles` reads (I1b). Create one per request with
 * `createIdentityRequestCache()` and pass it to every identity call in that
 * request; never keep one across requests, or role changes would go unseen.
 */
export type IdentityRequestCache = {
  roles: Map<string, Role[]>;
  /** Z14-1: the one-query identity row per user, so a request reads it once. */
  rows: Map<string, IdentityRow>;
};

export function createIdentityRequestCache(): IdentityRequestCache {
  return { roles: new Map(), rows: new Map() };
}

/**
 * Everything the auth layer needs about a user, read in one D1 round trip
 * (Z14-1, Diagnosis #1): the user row, its roles and both profile ids.
 * Before Z14-1 this took five serial queries on every request.
 */
export type IdentityRow = {
  id: string;
  firebaseUid: string;
  accountState: ActorContext["accountState"];
  timezone: string;
  purgeAfter: string | null;
  roles: Role[];
  trainerProfileId: string | null;
  traineeProfileId: string | null;
};

/** Correlated sub-selects on `users`: one statement, no row multiplication. */
function identityColumns() {
  return {
    id: users.id,
    firebaseUid: users.firebaseUid,
    accountState: users.accountState,
    timezone: users.timezone,
    purgeAfter: users.purgeAfter,
    // Spelled out in full: drizzle renders columns unqualified in a
    // single-table select, and an unqualified "id" here would bind to the
    // sub-select's own table.
    roles: sql<string | null>`(select group_concat("ur"."role") from "user_roles" "ur" where "ur"."user_id" = "users"."id")`,
    trainerProfileId: sql<string | null>`(select "tp"."id" from "trainer_profiles" "tp" where "tp"."user_id" = "users"."id" limit 1)`,
    traineeProfileId: sql<string | null>`(select "tep"."id" from "trainee_profiles" "tep" where "tep"."user_id" = "users"."id" limit 1)`,
  };
}

type IdentitySelectRow = {
  id: string;
  firebaseUid: string;
  accountState: ActorContext["accountState"];
  timezone: string;
  purgeAfter: string | null;
  roles: string | null;
  trainerProfileId: string | null;
  traineeProfileId: string | null;
};

function toIdentityRow(row: IdentitySelectRow): IdentityRow {
  const roles = (row.roles ?? "")
    .split(",")
    .filter((role): role is Role => role === "trainer" || role === "trainee");
  return {
    id: row.id,
    firebaseUid: row.firebaseUid,
    accountState: row.accountState,
    timezone: row.timezone,
    purgeAfter: row.purgeAfter,
    roles,
    trainerProfileId: row.trainerProfileId,
    traineeProfileId: row.traineeProfileId,
  };
}

function remember(cache: IdentityRequestCache | undefined, row: IdentityRow): IdentityRow {
  if (cache) {
    cache.rows.set(row.id, row);
    if (!cache.roles.has(row.id)) cache.roles.set(row.id, row.roles);
  }
  return row;
}

/** One query: the identity row for a user id, or null. */
export async function loadIdentityByUserId(
  db: Db,
  userId: string,
  cache?: IdentityRequestCache,
): Promise<IdentityRow | null> {
  const cached = cache?.rows.get(userId);
  if (cached) return cached;
  const [row] = await db
    .select(identityColumns())
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ? remember(cache, toIdentityRow(row)) : null;
}

/** One query: the identity row for a Firebase uid, or null. */
export async function loadIdentityByFirebaseUid(
  db: Db,
  firebaseUid: string,
  cache?: IdentityRequestCache,
): Promise<IdentityRow | null> {
  const [row] = await db
    .select(identityColumns())
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);
  return row ? remember(cache, toIdentityRow(row)) : null;
}

/** `last_seen_at` is written at most once per this interval per session (Z14-1). */
export const WEB_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type LiveWebSession = {
  id: string;
  userId: string;
  createdAt: string;
  identity: IdentityRow | null;
};

/**
 * One query for a live (not revoked, not expired) web session and its user's
 * identity row. `last_seen_at` is touched only when it is older than five
 * minutes, so most requests write nothing (Z14-1; it was written on every
 * request before).
 */
export async function loadLiveWebSessionIdentity(
  db: Db,
  token: string,
  cache?: IdentityRequestCache,
): Promise<LiveWebSession | null> {
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select({
      sessionId: webSessions.id,
      sessionUserId: webSessions.userId,
      sessionCreatedAt: webSessions.createdAt,
      sessionExpiresAt: webSessions.expiresAt,
      sessionRevokedAt: webSessions.revokedAt,
      sessionLastSeenAt: webSessions.lastSeenAt,
      ...identityColumns(),
    })
    .from(webSessions)
    .leftJoin(users, eq(users.id, webSessions.userId))
    .where(eq(webSessions.tokenHash, tokenHash))
    .limit(1);
  const now = nowIso();
  if (!row || row.sessionRevokedAt || row.sessionExpiresAt <= now) {
    return null;
  }
  const touchBefore = new Date(Date.parse(now) - WEB_SESSION_TOUCH_INTERVAL_MS).toISOString();
  if (!row.sessionLastSeenAt || row.sessionLastSeenAt < touchBefore) {
    await db
      .update(webSessions)
      .set({ lastSeenAt: now })
      .where(and(eq(webSessions.id, row.sessionId), lt(webSessions.lastSeenAt, touchBefore)));
  }
  return {
    id: row.sessionId,
    userId: row.sessionUserId,
    createdAt: row.sessionCreatedAt,
    identity: row.id ? remember(cache, toIdentityRow(row as IdentitySelectRow)) : null,
  };
}

/** The actor for an active identity with at least one role; null otherwise. */
export function actorFromIdentity(
  identity: IdentityRow,
  input: {
    surface: ActorContext["surface"];
    authMethod: ActorContext["authMethod"];
    requestedRole?: Role | null;
  },
  cache?: IdentityRequestCache,
): ActorContext | null {
  if (identity.accountState !== "active") {
    return null;
  }
  // A copy, so a caller changing the actor cannot change the memo. Roles added
  // earlier in the same request (ensureRoleAndProfile) live in the roles memo.
  const permittedRoles = [...(cache?.roles.get(identity.id) ?? identity.roles)];
  if (permittedRoles.length === 0) {
    return null;
  }
  const selectedRole = resolveSelectedRole({
    permittedRoles,
    requestedRole: input.requestedRole ?? null,
    surface: input.surface,
  });
  return {
    userId: identity.id,
    firebaseUid: identity.firebaseUid,
    accountState: identity.accountState,
    timezone: identity.timezone,
    permittedRoles,
    selectedRole,
    surface: input.surface,
    trainerProfileId: identity.trainerProfileId,
    traineeProfileId: identity.traineeProfileId,
    authMethod: input.authMethod,
  };
}

async function loadRoles(
  db: Db,
  userId: string,
  cache?: IdentityRequestCache,
): Promise<Role[]> {
  const cached = cache?.roles.get(userId);
  if (cached) {
    return cached;
  }
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  const roles = rows.map((row) => row.role);
  cache?.roles.set(userId, roles);
  return roles;
}

export async function findOrCreateUserFromFirebase(
  db: Db,
  identity: VerifiedFirebaseIdentity,
  timezone = "UTC",
): Promise<{ userId: string; created: boolean }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, identity.uid))
    .limit(1);

  const found = existing[0];
  if (found) {
    return { userId: found.id, created: false };
  }

  const userId = createId();
  const timestamp = nowIso();
  await db.insert(users).values({
    id: userId,
    firebaseUid: identity.uid,
    accountState: "active",
    timezone,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { userId, created: true };
}

export async function ensureRoleAndProfile(
  db: Db,
  input: {
    userId: string;
    role: Role;
    displayName: string;
  },
  cache?: IdentityRequestCache,
): Promise<void> {
  const timestamp = nowIso();
  const existingRoles = await loadRoles(db, input.userId, cache);

  if (!existingRoles.includes(input.role)) {
    await db.insert(userRoles).values({
      id: createId(),
      userId: input.userId,
      role: input.role,
      createdAt: timestamp,
    });
    cache?.roles.set(input.userId, [...existingRoles, input.role]);
  }

  const cachedRow = cache?.rows.get(input.userId);

  if (input.role === "trainer") {
    const profiles = await db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, input.userId))
      .limit(1);
    let profileId = profiles[0]?.id ?? null;
    if (!profileId) {
      profileId = createId();
      await db.insert(trainerProfiles).values({
        id: profileId,
        userId: input.userId,
        displayName: input.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (cachedRow) cache?.rows.set(input.userId, { ...cachedRow, trainerProfileId: profileId });
  }

  if (input.role === "trainee") {
    const profiles = await db
      .select({ id: traineeProfiles.id })
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, input.userId))
      .limit(1);
    let profileId = profiles[0]?.id ?? null;
    if (!profileId) {
      profileId = createId();
      await db.insert(traineeProfiles).values({
        id: profileId,
        userId: input.userId,
        displayName: input.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (cachedRow) cache?.rows.set(input.userId, { ...cachedRow, traineeProfileId: profileId });
  }
}

export async function createWebSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const tokenHash = await sha256Hex(token);
  const timestamp = nowIso();
  const expiresAt = addDaysIso(14);

  await db.insert(webSessions).values({
    id: createId(),
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: timestamp,
    lastSeenAt: timestamp,
  });

  return { token, expiresAt };
}

export async function revokeWebSession(db: Db, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db
    .update(webSessions)
    .set({ revokedAt: nowIso() })
    .where(eq(webSessions.tokenHash, tokenHash));
}

export async function loadActorByUserId(
  db: Db,
  input: {
    userId: string;
    surface: ActorContext["surface"];
    authMethod: ActorContext["authMethod"];
    requestedRole?: Role | null;
  },
  cache?: IdentityRequestCache,
): Promise<ActorContext | null> {
  const identity = await loadIdentityByUserId(db, input.userId, cache);
  return identity ? actorFromIdentity(identity, input, cache) : null;
}

export async function loadActorBySessionToken(
  db: Db,
  token: string,
  requestedRole?: Role | null,
  cache?: IdentityRequestCache,
): Promise<ActorContext | null> {
  const session = await loadLiveWebSessionIdentity(db, token, cache);
  if (!session?.identity) {
    return null;
  }
  return actorFromIdentity(
    session.identity,
    { surface: "trainer_web", authMethod: "session", requestedRole },
    cache,
  );
}

export async function loadActorByFirebaseUid(
  db: Db,
  firebaseUid: string,
  requestedRole?: Role | null,
  cache?: IdentityRequestCache,
): Promise<ActorContext | null> {
  const identity = await loadIdentityByFirebaseUid(db, firebaseUid, cache);
  if (!identity) {
    return null;
  }
  return actorFromIdentity(
    identity,
    { surface: "mobile", authMethod: "bearer", requestedRole },
    cache,
  );
}
