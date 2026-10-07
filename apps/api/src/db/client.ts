import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

let testDbOverride: Db | null = null;

export function createDb(d1: D1Database): Db {
  if (testDbOverride) {
    return testDbOverride;
  }
  return drizzle(d1, { schema });
}

/** Test-only hook so route tests can use better-sqlite3 instead of D1. */
export function setTestDbOverride(db: Db | null): void {
  testDbOverride = db;
}

export function getTestDbOverride(): Db | null {
  return testDbOverride;
}

export { schema };
