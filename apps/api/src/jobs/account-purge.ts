import type { Env } from "../types";

// W6 Z6-14/Z6-17: scaffold from Z5-4. The purge job is filled in by Z6-17; called once from scheduled().
export async function runAccountPurge(_env: Env, _now: Date): Promise<void> {
  // Intentionally empty until Z6-17.
}
