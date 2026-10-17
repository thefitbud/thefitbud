import { DEFAULT_FEATURE_FLAGS, type FeatureFlagKey, envFlagOverride } from "@fitbud/core";
import type { Db } from "../db/client";
import { featureFlags } from "../db/schema";
import type { Env } from "../types";

export type ResolvedFlags = Record<FeatureFlagKey, boolean>;

const cache = new WeakMap<Env, ResolvedFlags>();

export async function getFlags(env: Env, db: Db): Promise<ResolvedFlags> {
  const cached = cache.get(env);
  if (cached) {
    return cached;
  }

  const rows = await db.select().from(featureFlags);
  const resolved: ResolvedFlags = { ...DEFAULT_FEATURE_FLAGS };
  for (const row of rows) {
    const key = row.key as FeatureFlagKey;
    if (key in resolved) {
      resolved[key] = row.enabled;
    }
  }
  for (const key of Object.keys(resolved) as FeatureFlagKey[]) {
    const override = envFlagOverride(env, key);
    if (override !== undefined) {
      resolved[key] = override;
    }
  }
  cache.set(env, resolved);
  return resolved;
}

export async function seedMissingFlags(db: Db, now: string): Promise<void> {
  for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    await db
      .insert(featureFlags)
      .values({ key, enabled, updatedAt: now })
      .onConflictDoNothing();
  }
}
