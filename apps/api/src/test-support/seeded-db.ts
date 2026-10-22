/**
 * Fast access to the full realistic demo seed for API tests (task H1).
 *
 * Building the demo world (migrations + library seed + ~37 MB of demo SQL) takes
 * seconds, so doing it in every `beforeEach` made hooks brush the 10 s hook limit.
 * Here it is built once per test file (vitest isolates modules per file) and per
 * reference instant, written to a template file with `VACUUM INTO`, and every test
 * gets its own private copy of that file. The seed content is exactly what
 * `buildDemoSeedSql` produces; nothing is trimmed. Tests stay independent because
 * no test ever writes to the template, only to its own copy.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import {
  closeOpenMemoryDbCopies,
  createMemoryDb,
  type MemoryDbHandle,
  openMemoryDbCopy,
} from "./memory-db.js";

const templates = new Map<string, Promise<string>>();
let templateDir: string | undefined;

function ensureTemplateDir(): string {
  if (!templateDir) {
    // The pid in the name lets the startup sweep (tmp-sweep.ts) tell live dirs from leftovers.
    templateDir = mkdtempSync(join(tmpdir(), `fitbud-demo-seed-${process.pid}-`));
    // test-support/vitest-setup.ts calls this after the test file (without importing
    // this module, so files that never seed do not pay for loading the seed builder).
    (globalThis as SeedCleanupGlobal)[SEED_CLEANUP_KEY] = releaseDemoSeededDbs;
  }
  return templateDir;
}

export const SEED_CLEANUP_KEY = "__fitbudReleaseDemoSeededDbs";
export type SeedCleanupGlobal = typeof globalThis & {
  [SEED_CLEANUP_KEY]?: () => Promise<void>;
};

/**
 * Deletes this file's templates and any seeded copies a test left open (~60 MB each).
 * Called after each test file. Interrupted runs are cleaned by the startup sweep.
 */
export async function releaseDemoSeededDbs(): Promise<void> {
  await Promise.allSettled(templates.values());
  closeOpenMemoryDbCopies();
  templates.clear();
  if (templateDir) {
    rmSync(templateDir, { recursive: true, force: true });
    templateDir = undefined;
  }
}

async function buildTemplate(referenceInstant: string): Promise<string> {
  const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant, passwordHash, libraryIndex }));
    const path = join(ensureTemplateDir(), `seed-${templates.size}.sqlite`);
    handle.sqlite.run("VACUUM INTO ?", [path]);
    return path;
  } finally {
    handle.close();
  }
}

/**
 * A fresh, writable database holding the full demo seed for `referenceInstant`
 * (migrations + library seed + demo seed, foreign keys on). The first call in a test
 * file pays the build; later calls only copy the template file.
 */
export async function createDemoSeededDb(referenceInstant: string): Promise<MemoryDbHandle> {
  let template = templates.get(referenceInstant);
  if (!template) {
    template = buildTemplate(referenceInstant);
    templates.set(referenceInstant, template);
    template.catch(() => templates.delete(referenceInstant));
  }
  return openMemoryDbCopy(await template, { foreignKeys: true });
}

/** Builds the template for `referenceInstant` up front; call from `beforeAll`. */
export async function prepareDemoSeededDb(referenceInstant: string): Promise<void> {
  (await createDemoSeededDb(referenceInstant)).close();
}
