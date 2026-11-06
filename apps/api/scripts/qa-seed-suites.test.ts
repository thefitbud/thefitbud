/**
 * Z5-7 (BT8, G13): one QA persona set per suite (D-W5-14).
 *
 * `qa-seed --suite web|android|ios|api` seeds only that suite's personas, the suites
 * never share a trainee, and resetting one suite leaves every other suite's world
 * exactly as it was. Like `qa-seed.test.ts`, these tests do not trust the predicates
 * by reading them: they apply every suite's SQL to one database, identify each suite's
 * rows from the primary keys its seed emitted (`rowKeys`), and check the boundary from
 * the persisted rows and through the product API.
 *
 * The last block checks `.github/workflows/qa.yml` wires the same thing: one seed job
 * per suite, each suite job waiting for its own seed only, and no shared `qa-staging`
 * chain left.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/index.js";
import { setTestDbOverride } from "../src/db/client.js";
import { createMemoryR2Bucket } from "../src/lib/memory-r2.js";
import { createMemoryDb, yieldToEventLoop, type MemoryDbHandle } from "../src/test-support/memory-db.js";
import type { Env } from "../src/types.js";
import {
  QA_ACCOUNTS,
  QA_EMAIL_PATTERN,
  QA_SUITES,
  QA_SUITE_ACCOUNTS,
  parseQaSuiteArg,
  qaSuiteAccounts,
  qaUserId,
  type QaSuite,
} from "../src/seed/qa/accounts.js";
import {
  buildQaSeed,
  buildQaSeeds,
  committedQaExpectationsFile,
  qaExpectationsFile,
  stableExpectations,
  suiteExpectations,
  type QaExpectationsFile,
  type QaSeedResult,
} from "../src/seed/qa/build.js";
import { qaScopeIdentity } from "../src/seed/qa/identity.js";
import { QA_TABLE_PLAN } from "../src/seed/qa/ownership.js";
import { qaPasswordHash } from "../src/seed/qa/password.js";
import { buildQaResetSql, qaResetGuardSql } from "../src/seed/qa/reset.js";

const REFERENCE_DATE = "2026-11-02";
/** Test input only; the staging password is a GitHub Actions secret. */
const TEST_QA_PASSWORD = "qa-seed-vitest-input-2026";
const APP_SUITES = ["web", "android", "ios"] as const;

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const committedFile = JSON.parse(
  readFileSync(path.join(apiRoot, "src/seed/qa/expectations.json"), "utf8"),
) as QaExpectationsFile;

type Sqlite = MemoryDbHandle["sqlite"];

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when the test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

function scalar(sqlite: Sqlite, sql: string): unknown {
  return sqlite.exec(sql)[0]?.values[0]?.[0];
}

function pkColumns(sqlite: Sqlite, table: string): string[] {
  return (
    sqlite.exec(`SELECT name FROM pragma_table_info('${table}') WHERE pk > 0 ORDER BY pk`)[0]
      ?.values ?? []
  ).map((row) => String(row[0]));
}

/** `{ key, json }` of every row of `table`, keyed like `QaSeedResult.rowKeys`. */
function tableRows(sqlite: Sqlite, table: string): Array<{ key: string; json: string }> {
  const [result] = sqlite.exec(`SELECT * FROM ${table}`);
  if (!result) {
    return [];
  }
  const indexes = pkColumns(sqlite, table).map((column) => result.columns.indexOf(column));
  return result.values.map((values) => ({
    key: indexes.map((index) => String(values[index])).join("\u0000"),
    json: JSON.stringify(values),
  }));
}

/** Checksum of exactly the rows whose primary key `seed` emitted. */
function seedChecksum(sqlite: Sqlite, seed: QaSeedResult): string {
  const hash = createHash("sha256");
  for (const [table, keys] of Object.entries(seed.rowKeys).sort(([a], [b]) => a.localeCompare(b))) {
    const wanted = new Set(keys);
    const rows = tableRows(sqlite, table)
      .filter((row) => wanted.has(row.key))
      .map((row) => row.json)
      .sort();
    hash.update(`${table}:${rows.length}\n${rows.join("\n")}\n`);
  }
  return hash.digest("hex");
}

/** How many of `seed`'s own rows are in the database. */
function seededRowsPresent(sqlite: Sqlite, seed: QaSeedResult): number {
  let total = 0;
  for (const [table, keys] of Object.entries(seed.rowKeys)) {
    const wanted = new Set(keys);
    total += tableRows(sqlite, table).filter((row) => wanted.has(row.key)).length;
  }
  return total;
}

function seedRowCount(seed: QaSeedResult): number {
  return Object.values(seed.rowKeys).reduce((sum, keys) => sum + keys.length, 0);
}

/** Rows that still carry one of `userIds` in a plan table's own user column. */
function rowsReferencingUsers(sqlite: Sqlite, userIds: readonly string[]): number {
  const ids = userIds.map((id) => `'${id}'`).join(", ");
  let total = 0;
  for (const plan of QA_TABLE_PLAN) {
    for (const column of plan.userColumns ?? []) {
      total += Number(scalar(sqlite, `SELECT count(*) FROM ${plan.table} WHERE ${column} IN (${ids})`) ?? 0);
    }
  }
  return total;
}

async function login(email: string): Promise<Record<string, string>> {
  const response = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: TEST_QA_PASSWORD }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return {
    Authorization: `Bearer ${(JSON.parse(text) as { data: { token: string } }).data.token}`,
    "x-fitbud-role": "trainer",
  };
}

describe("QA personas per suite (D-W5-14)", () => {
  it("gives web, android and ios their own qa+<suite>-<role> trainer and trainees", () => {
    for (const suite of APP_SUITES) {
      const accounts = qaSuiteAccounts(suite);
      expect(accounts.map((a) => [a.key, a.role, a.email])).toEqual([
        ["trainer", "trainer", `qa+${suite}-trainer@thefitbud.com`],
        ["ontrack", "trainee", `qa+${suite}-ontrack@thefitbud.com`],
        ["slipping", "trainee", `qa+${suite}-slipping@thefitbud.com`],
      ]);
      for (const account of accounts) {
        expect(account.suite).toBe(suite);
        expect(account.firebaseUid).toBe(`qa-seed-${suite}-${account.key}`);
      }
    }
  });

  it("keeps the api suite on the QA1 accounts, so the API smoke needs no change", () => {
    expect(QA_ACCOUNTS).toBe(QA_SUITE_ACCOUNTS.api);
    expect(QA_ACCOUNTS.map((a) => a.email)).toEqual([
      "qa+trainer@thefitbud.com",
      "qa+ontrack@thefitbud.com",
      "qa+slipping@thefitbud.com",
      "qa+trainer2@thefitbud.com",
      "qa+client2@thefitbud.com",
    ]);
  });

  it("stays inside D-QA1-2's allowlist and shares no identity between suites", () => {
    const all = QA_SUITES.flatMap((suite) => qaSuiteAccounts(suite));
    for (const account of all) {
      // The staging test-mode OTP allowlists exactly this shape (QT1); no API change.
      expect(account.email).toMatch(QA_EMAIL_PATTERN);
      expect(account.displayName.startsWith("QA ")).toBe(true);
    }
    for (const field of ["email", "firebaseUid"] as const) {
      expect(new Set(all.map((a) => a[field])).size, field).toBe(all.length);
    }
    expect(new Set(all.map(qaUserId)).size).toBe(all.length);
    // Android and iOS in particular: separate jobs, so no shared trainee.
    const android = new Set(qaSuiteAccounts("android").map(qaUserId));
    expect(qaSuiteAccounts("ios").some((a) => android.has(qaUserId(a)))).toBe(false);
  });

  it("scopes a suite's reset identity to that suite's accounts only", () => {
    for (const suite of QA_SUITES) {
      const others = new Set(
        QA_SUITES.filter((s) => s !== suite).flatMap((s) => qaSuiteAccounts(s).map(qaUserId)),
      );
      const identity = qaScopeIdentity(suite);
      expect(identity.userIds).toEqual(qaSuiteAccounts(suite).map(qaUserId));
      expect(identity.userIds.some((id) => others.has(id))).toBe(false);
    }
    // Guards for one suite above deletes for another would be checking the wrong ids.
    expect(() => buildQaResetSql(qaScopeIdentity("web"), "android")).toThrow(/android/);
  });

  it("requires --suite on the command line and accepts only a known suite", () => {
    for (const suite of QA_SUITES) {
      expect(parseQaSuiteArg(["node", "qa-seed.ts", "--suite", suite])).toBe(suite);
    }
    expect(() => parseQaSuiteArg(["node", "qa-seed.ts"])).toThrow(/--suite/);
    expect(() => parseQaSuiteArg(["node", "qa-seed.ts", "--suite"])).toThrow(/--suite/);
    expect(() => parseQaSuiteArg(["node", "qa-seed.ts", "--suite", "mobile"])).toThrow(/--suite/);
    expect(() => parseQaSuiteArg(["node", "qa-seed.ts", "--suite", "all"])).toThrow(/--suite/);
  });
});

describe("per-suite QA seeds (D-W5-14)", () => {
  let seeds: Record<QaSuite, QaSeedResult>;

  beforeAll(async () => {
    seeds = await buildQaSeeds({
      suites: QA_SUITES,
      referenceDate: REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
  }, 240_000);

  it("keeps the Maestro runners' top-level accounts a copy of one app suite's, never the API smoke's", () => {
    // scripts/qa/run-maestro*.sh read `.accounts[]`; qa.yml replaces it per job, and
    // a default that pointed at the api suite would put a platform on the smoke's world.
    const generated = committedQaExpectationsFile(QA_SUITES.map((suite) => seeds[suite].expectations));
    expect(generated.accounts).toEqual(seeds.android.expectations.accounts);
    const stableFields = (accounts: QaExpectationsFile["accounts"]) =>
      (accounts ?? []).map((a) => [a.key, a.email, a.userId, a.relationshipId ?? null]);
    expect(stableFields(committedFile.accounts)).toEqual(stableFields(generated.accounts));
    const apiIds = new Set(qaSuiteAccounts("api").map(qaUserId));
    expect((committedFile.accounts ?? []).some((a) => apiIds.has(a.userId))).toBe(false);
  });

  it("keeps every suite of the committed expectations.json in step with the generator", () => {
    expect(Object.keys(committedFile.suites).sort()).toEqual([...QA_SUITES].sort());
    for (const suite of QA_SUITES) {
      const committed = suiteExpectations(committedFile, suite);
      expect(committed, suite).not.toBeNull();
      expect(stableExpectations(committed!)).toBe(stableExpectations(seeds[suite].expectations));
    }
    // The keyed file round-trips: what the script writes is what the suites read.
    const file = qaExpectationsFile(QA_SUITES.map((suite) => seeds[suite].expectations));
    for (const suite of QA_SUITES) {
      expect(suiteExpectations(file, suite)).toEqual(seeds[suite].expectations);
    }
  });

  it("builds the same seed for a suite alone as alongside the others", async () => {
    const alone = await buildQaSeed({
      suite: "android",
      referenceDate: REFERENCE_DATE,
      qaPasswordHash: qaPasswordHash(TEST_QA_PASSWORD),
      forbiddenStrings: [TEST_QA_PASSWORD],
    });
    expect(alone.sql).toBe(seeds.android.sql);
    expect(alone.expectations).toEqual(seeds.android.expectations);
  }, 120_000);

  it("seeds only the suite's own accounts and the guarantees each suite promises", () => {
    for (const suite of QA_SUITES) {
      const { sql, expectations } = seeds[suite];
      expect(expectations.suite).toBe(suite);
      expect(expectations.accounts.map((a) => a.email)).toEqual(
        qaSuiteAccounts(suite).map((a) => a.email),
      );
      for (const account of qaSuiteAccounts(suite)) {
        expect(sql, `${suite} seeds ${account.email}`).toContain(account.email);
      }
      for (const other of QA_SUITES.filter((s) => s !== suite)) {
        for (const account of qaSuiteAccounts(other)) {
          expect(sql, `${suite} must not seed ${account.email}`).not.toContain(`'${account.email}'`);
          expect(sql, `${suite} must not mention ${other}'s ${account.key}`).not.toContain(
            qaUserId(account),
          );
        }
      }
      const trainees = expectations.accounts.filter((a) => a.role === "trainee");
      expect(trainees.length).toBe(
        expectations.guarantees.clientsFirstTrainer + expectations.guarantees.clientsSecondTrainer,
      );
    }
    expect(seeds.api.expectations.guarantees.clientsSecondTrainer).toBe(1);
    for (const suite of APP_SUITES) {
      expect(seeds[suite].expectations.guarantees.clientsSecondTrainer).toBe(0);
      // What the app suites drive: a slipping client with a check-in to start and one
      // waiting for review, and an on-track client with a meal already logged today.
      const slipping = seeds[suite].expectations.accounts.find((a) => a.key === "slipping")!;
      expect(slipping.today?.startableCheckinId).toBeTruthy();
      expect(slipping.today?.pendingCheckinId).toBeTruthy();
      const onTrack = seeds[suite].expectations.accounts.find((a) => a.key === "ontrack")!;
      expect(onTrack.today?.loggedMealCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives no two suites the same row, user or relationship", () => {
    const seen = new Map<string, QaSuite>();
    for (const suite of QA_SUITES) {
      for (const [table, keys] of Object.entries(seeds[suite].rowKeys)) {
        for (const key of keys) {
          const id = `${table}\u0000${key}`;
          expect(seen.get(id), `${table} ${key} is in ${seen.get(id)} and ${suite}`).toBeUndefined();
          seen.set(id, suite);
        }
      }
    }
    const relationships = QA_SUITES.flatMap((suite) =>
      seeds[suite].expectations.accounts
        .map((a) => a.relationshipId)
        .filter((id): id is string => Boolean(id)),
    );
    expect(new Set(relationships).size).toBe(relationships.length);
  });

  it("applies every suite to one database, and no trainee belongs to two suites", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      for (const suite of QA_SUITES) {
        handle.sqlite.exec(seeds[suite].sql);
        await yieldToEventLoop();
      }
      for (const suite of QA_SUITES) {
        expect(seededRowsPresent(handle.sqlite, seeds[suite]), suite).toBe(seedRowCount(seeds[suite]));
      }
      // From the persisted relationships, not the expectations: every QA trainee's
      // trainer is in the trainee's own suite, and each trainee is in exactly one.
      const suiteOfUser = new Map<string, QaSuite>();
      for (const suite of QA_SUITES) {
        for (const account of qaSuiteAccounts(suite)) {
          suiteOfUser.set(qaUserId(account), suite);
        }
      }
      const ids = [...suiteOfUser.keys()].map((id) => `'${id}'`).join(", ");
      const rows =
        handle.sqlite.exec(
          `SELECT trainer_user_id, trainee_user_id FROM coaching_relationships WHERE trainee_user_id IN (${ids}) OR trainer_user_id IN (${ids})`,
        )[0]?.values ?? [];
      const traineeSuites = new Map<string, Set<QaSuite>>();
      for (const [trainer, trainee] of rows) {
        const trainerSuite = suiteOfUser.get(String(trainer));
        const traineeSuite = suiteOfUser.get(String(trainee));
        expect(trainerSuite, `relationship ${String(trainer)} -> ${String(trainee)}`).toBeDefined();
        expect(traineeSuite).toBe(trainerSuite);
        const set = traineeSuites.get(String(trainee)) ?? new Set<QaSuite>();
        set.add(traineeSuite!);
        traineeSuites.set(String(trainee), set);
      }
      const trainees = QA_SUITES.flatMap((suite) =>
        qaSuiteAccounts(suite).filter((a) => a.role === "trainee").map(qaUserId),
      );
      expect([...traineeSuites.keys()].sort()).toEqual([...trainees].sort());
      for (const [trainee, suites] of traineeSuites) {
        expect(suites.size, trainee).toBe(1);
      }
    } finally {
      handle.close();
    }
  }, 180_000);

  it("shows each suite's trainer only that suite's clients, through the product API", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      for (const suite of QA_SUITES) {
        handle.sqlite.exec(seeds[suite].sql);
        await yieldToEventLoop();
      }
      setTestDbOverride(handle.db);
      const relationshipsOf = (suite: QaSuite) =>
        seeds[suite].expectations.accounts
          .filter((a) => a.key === "ontrack" || a.key === "slipping")
          .map((a) => a.relationshipId!)
          .sort();
      const directory = async (headers: Record<string, string>) =>
        (
          JSON.parse(await (await app.request("/clients", { headers }, testEnv())).text()) as {
            data: { items: Array<{ relationshipId: string }> };
          }
        ).data.items
          .map((item) => item.relationshipId)
          .sort();
      for (const suite of QA_SUITES) {
        const trainer = seeds[suite].expectations.accounts.find((a) => a.key === "trainer")!;
        const headers = await login(trainer.email);
        expect(await directory(headers), suite).toEqual(relationshipsOf(suite));
      }
      // The two platforms in particular: Android's trainer cannot open iOS's client.
      const androidTrainer = await login(qaSuiteAccounts("android")[0]!.email);
      const iosSlipping = seeds.ios.expectations.accounts.find((a) => a.key === "slipping")!;
      const refused = await app.request(
        `/workspaces/relationships/${iosSlipping.relationshipId}`,
        { headers: androidTrainer },
        testEnv(),
      );
      expect(refused.status).toBe(404);
    } finally {
      setTestDbOverride(null);
      handle.close();
    }
  }, 180_000);

  it("resets one suite and leaves every other suite's world exactly as it was", async () => {
    for (const target of QA_SUITES) {
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        for (const suite of QA_SUITES) {
          handle.sqlite.exec(seeds[suite].sql);
          await yieldToEventLoop();
        }
        const others = QA_SUITES.filter((suite) => suite !== target);
        const before = others.map((suite) => seedChecksum(handle.sqlite, seeds[suite]));
        handle.sqlite.exec(buildQaResetSql(qaScopeIdentity(target), target));
        await yieldToEventLoop();
        const targetIds = qaSuiteAccounts(target).map(qaUserId);
        expect(seededRowsPresent(handle.sqlite, seeds[target]), target).toBe(0);
        expect(rowsReferencingUsers(handle.sqlite, targetIds), target).toBe(0);
        expect(others.map((suite) => seedChecksum(handle.sqlite, seeds[suite])), target).toEqual(before);
        for (const suite of others) {
          expect(seededRowsPresent(handle.sqlite, seeds[suite]), `${suite} after ${target} reset`).toBe(
            seedRowCount(seeds[suite]),
          );
        }
      } finally {
        handle.close();
      }
    }
  }, 300_000);

  it("guards each suite's reset against its own accounts only", async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    try {
      for (const suite of QA_SUITES) {
        handle.sqlite.exec(seeds[suite].sql);
        await yieldToEventLoop();
      }
      // Every suite seeded side by side: no suite's guard mistakes another suite's
      // accounts for an intruder.
      for (const suite of QA_SUITES) {
        expect(() => handle.sqlite.exec(qaResetGuardSql(suite)), suite).not.toThrow();
      }
      // A foreign address on an ios id trips the ios guard and no other suite's.
      const iosTrainerId = qaUserId(qaSuiteAccounts("ios")[0]!);
      handle.sqlite.exec(
        `UPDATE user_identities SET email_norm = 'qa+web-trainer-copy@thefitbud.com' WHERE user_id = '${iosTrainerId}'`,
      );
      expect(() => handle.sqlite.exec(qaResetGuardSql("ios"))).toThrow(/malformed JSON/i);
      expect(() => handle.sqlite.exec(qaResetGuardSql("android"))).not.toThrow();
    } finally {
      handle.close();
    }
  }, 120_000);
});

/**
 * `.github/workflows/qa.yml`, read as text: jobs are the two-space keys under `jobs:`.
 * Deliberately simple, because the file's own shape is what is being checked.
 */
function workflowJobs(): Map<string, string> {
  const source = readFileSync(path.join(repoRoot, ".github/workflows/qa.yml"), "utf8");
  const body = source.slice(source.indexOf("\njobs:\n"));
  const jobs = new Map<string, string>();
  const matches = [...body.matchAll(/^ {2}([a-z0-9-]+):\n/gm)];
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1]!.index : body.length;
    jobs.set(match[1]!, body.slice(match.index, end));
  });
  return jobs;
}

function needsOf(job: string): string[] {
  const inline = job.match(/^ {4}needs: \[([^\]]*)\]/m);
  if (inline) {
    return inline[1]!.split(",").map((name) => name.trim());
  }
  const single = job.match(/^ {4}needs: ([a-z0-9-]+)$/m);
  return single ? [single[1]!] : [];
}

function groupOf(job: string): string | null {
  return job.match(/^ {6}group: (\S+)$/m)?.[1] ?? null;
}

describe("qa.yml wires one seed per suite (D-W5-14)", () => {
  const jobs = workflowJobs();
  const suiteJob: Record<QaSuite, string> = {
    api: "api-smoke",
    web: "web-staging",
    android: "android",
    ios: "ios",
  };

  it("has no shared qa-staging seed chain left", () => {
    expect(jobs.has("seed-reset")).toBe(false);
    for (const [name, job] of jobs) {
      expect(groupOf(job), name).not.toBe("qa-staging");
    }
  });

  it("seeds and resets each suite in its own job, scoped by --suite", () => {
    for (const suite of QA_SUITES) {
      const job = jobs.get(`seed-${suite}`);
      expect(job, `seed-${suite}`).toBeDefined();
      expect(job).toMatch(new RegExp(`^ {6}QA_SEED_SUITE: ${suite}$`, "m"));
      expect(job).toContain('scripts/qa-reset.ts --suite "$QA_SEED_SUITE"');
      expect(job).toContain('scripts/qa-seed.ts --suite "$QA_SEED_SUITE"');
      expect(job).toContain('--file ".qa-seed/$QA_SEED_SUITE/qa-reset.sql"');
      expect(job).toContain('--file ".qa-seed/$QA_SEED_SUITE/qa-seed.sql"');
      expect(job).toContain("environment: staging-qa");
      expect(job).toContain("github.event_name != 'pull_request' && github.ref == 'refs/heads/main'");
      expect(job).toContain(`needs.changes.outputs.suites == '${suite}'`);
      expect(groupOf(job!)).toBe(`qa-staging-${suite}`);
    }
  });

  it("runs each suite after its own seed only, in its own group", () => {
    const allSuiteJobs = new Set(Object.values(suiteJob));
    for (const suite of QA_SUITES) {
      const name = suiteJob[suite];
      const job = jobs.get(name)!;
      expect(job, name).toBeDefined();
      const needs = needsOf(job);
      expect(needs, name).toContain(`seed-${suite}`);
      expect(job).toContain(`needs.seed-${suite}.result`);
      for (const other of needs) {
        // Another suite's seed or suite job would put the shared chain back.
        if (other === `seed-${suite}`) continue;
        expect(other.startsWith("seed-"), `${name} needs ${other}`).toBe(false);
        expect(allSuiteJobs.has(other), `${name} needs ${other}`).toBe(false);
      }
      expect(groupOf(job), name).toBe(`qa-staging-${suite}`);
    }
  });

  it("points each Maestro job at its own suite's personas before the suite runs", () => {
    for (const suite of ["android", "ios"] as const) {
      const job = jobs.get(suite)!;
      expect(job).toMatch(new RegExp(`^ {6}QA_SEED_SUITE: ${suite}$`, "m"));
      const point = job.indexOf(`- name: Point the Maestro runner at the ${suite} personas`);
      const run = job.indexOf(suite === "android" ? "script: scripts/qa/run-maestro.sh" : "run: scripts/qa/run-maestro-ios.sh");
      expect(point, suite).toBeGreaterThan(0);
      expect(run, suite).toBeGreaterThan(point);
      expect(job).toContain(".suites[$s].accounts");
      expect(job).toContain('select(startswith("qa+\\($s)-") | not)');
    }
  });

  it("keeps qa-scripts, unit and report outside every group, and report waiting for every seed", () => {
    for (const name of ["changes", "qa-scripts", "unit", "report"]) {
      expect(groupOf(jobs.get(name)!), name).toBeNull();
    }
    const reportNeeds = needsOf(jobs.get("report")!);
    for (const suite of QA_SUITES) {
      expect(reportNeeds).toContain(`seed-${suite}`);
      expect(reportNeeds).toContain(suiteJob[suite]);
    }
    expect(jobs.get("report")).toContain("NOT_IN_GROUP: changes qa-scripts unit");
  });
});
