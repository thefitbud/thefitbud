/**
 * The staging API smoke signs in only as the `api` suite's QA accounts (D-W5-14, Z5-7).
 * Offline: reads the committed expectations and temporary files, never staging.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ALL_ACCOUNT_KEYS,
  COMMITTED_EXPECTATIONS,
  QA_SMOKE_SUITE,
  RUN_EXPECTATIONS,
  loadRun,
  loadStable,
} from "./expectations.js";

type SuiteEntry = { accounts: Array<{ key: string; email: string; userId: string; relationshipId?: string }> };
const committed = JSON.parse(readFileSync(COMMITTED_EXPECTATIONS, "utf8")) as {
  referenceDate: string;
  suites: Record<string, SuiteEntry>;
};

const dir = mkdtempSync(path.join(tmpdir(), "qa-smoke-suite-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeJson(name: string, value: unknown): string {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
}

describe("the API smoke's own persona set (D-W5-14)", () => {
  it("reads suites.api of the committed file, and only those accounts", () => {
    expect(QA_SMOKE_SUITE).toBe("api");
    const stable = loadStable();
    const emails = ALL_ACCOUNT_KEYS.map((key) => stable.accounts[key].email);
    expect(emails).toEqual(committed.suites.api!.accounts.map((a) => a.email));
    for (const suite of ["web", "android", "ios"]) {
      const theirs = new Set(committed.suites[suite]!.accounts.map((a) => a.userId));
      expect(ALL_ACCOUNT_KEYS.some((key) => theirs.has(stable.accounts[key].userId)), suite).toBe(false);
    }
  });

  it("refuses a committed file without an api suite rather than borrowing another's", () => {
    const file = writeJson("no-api.json", {
      referenceDate: committed.referenceDate,
      suites: { web: committed.suites.web },
    });
    expect(() => loadStable(file)).toThrow(/"api" suite/);
  });

  it("uses a run file only when it seeded the api suite", () => {
    expect(RUN_EXPECTATIONS).toContain(path.join(".qa-seed", "api", "expectations.json"));
    const webRun = writeJson("web-run.json", {
      referenceDate: "2026-11-02",
      suites: { web: committed.suites.web },
    });
    expect(loadRun(webRun)).toBeNull();
    const apiRun = writeJson("api-run.json", {
      referenceDate: "2026-11-02",
      suites: { api: committed.suites.api },
    });
    const run = loadRun(apiRun);
    expect(run?.referenceDate).toBe("2026-11-02");
    expect(Object.keys(run!.accounts).sort()).toEqual([...ALL_ACCOUNT_KEYS].sort());
  });
});
