import { afterAll } from "vitest";

// Keep in sync with SEED_CLEANUP_KEY in ./seeded-db.ts (not imported here on purpose:
// only files that seed should load the demo seed builder).
const SEED_CLEANUP_KEY = "__fitbudReleaseDemoSeededDbs";

// Runs once after each test file: removes that file's demo-seed template files.
afterAll(async () => {
  const g = globalThis as typeof globalThis & { [SEED_CLEANUP_KEY]?: () => Promise<void> };
  const release = g[SEED_CLEANUP_KEY];
  delete g[SEED_CLEANUP_KEY];
  await release?.();
});
