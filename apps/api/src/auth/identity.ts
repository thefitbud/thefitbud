import { eq } from "drizzle-orm";
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
export type IdentityRequestCache = { roles: Map<string, Role[]> };

export function createIdentityRequestCache(): IdentityRequestCache {
  return { roles: new Map() };
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

  if (input.role === "trainer") {
    const profiles = await db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, input.userId))
      .limit(1);
    if (!profiles[0]) {
      await db.insert(trainerProfiles).values({
        id: createId(),
        userId: input.userId,
        displayName: input.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  if (input.role === "trainee") {
    const profiles = await db
      .select({ id: traineeProfiles.id })
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, input.userId))
      .limit(1);
    if (!profiles[0]) {
      await db.insert(traineeProfiles).values({
        id: createId(),
        userId: input.userId,
        displayName: input.displayName,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
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
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || user.accountState !== "active") {
    return null;
  }

  // A copy, so a caller changing the actor cannot change the memo.
  const permittedRoles = [...(await loadRoles(db, user.id, cache))];
  if (permittedRoles.length === 0) {
    return null;
  }

  const trainer = await db
    .select({ id: trainerProfiles.id })
    .from(trainerProfiles)
    .where(eq(trainerProfiles.userId, user.id))
    .limit(1);
  const trainee = await db
    .select({ id: traineeProfiles.id })
    .from(traineeProfiles)
    .where(eq(traineeProfiles.userId, user.id))
    .limit(1);

  const selectedRole = resolveSelectedRole({
    permittedRoles,
    requestedRole: input.requestedRole ?? null,
    surface: input.surface,
  });

  return {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    accountState: user.accountState,
    timezone: user.timezone,
    permittedRoles,
    selectedRole,
    surface: input.surface,
    trainerProfileId: trainer[0]?.id ?? null,
    traineeProfileId: trainee[0]?.id ?? null,
    authMethod: input.authMethod,
  };
}

export async function loadActorBySessionToken(
  db: Db,
  token: string,
  requestedRole?: Role | null,
  cache?: IdentityRequestCache,
): Promise<ActorContext | null> {
  const tokenHash = await sha256Hex(token);
  const sessions = await db
    .select()
    .from(webSessions)
    .where(eq(webSessions.tokenHash, tokenHash))
    .limit(1);
  const session = sessions[0];
  if (!session || session.revokedAt || session.expiresAt <= nowIso()) {
    return null;
  }

  await db
    .update(webSessions)
    .set({ lastSeenAt: nowIso() })
    .where(eq(webSessions.id, session.id));

  return loadActorByUserId(
    db,
    {
      userId: session.userId,
      surface: "trainer_web",
      authMethod: "session",
      requestedRole,
    },
    cache,
  );
}

export async function loadActorByFirebaseUid(
  db: Db,
  firebaseUid: string,
  requestedRole?: Role | null,
  cache?: IdentityRequestCache,
): Promise<ActorContext | null> {
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, firebaseUid))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return null;
  }

  return loadActorByUserId(
    db,
    {
      userId: user.id,
      surface: "mobile",
      authMethod: "bearer",
      requestedRole,
    },
    cache,
  );
}
