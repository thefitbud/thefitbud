// The staging web suite signs in only as the `web` suite's QA accounts (D-W5-14, Z5-7).
// Offline: reads the committed expectations and a temporary file, never staging.
import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_WEB_SUITE, account, loadExpectations, trainerEmail } from "./support/env";

const committedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../api/src/seed/qa/expectations.json",
);
type Entry = { accounts: Array<{ key: string; email: string; userId: string; relationshipId?: string }> };
const committed = JSON.parse(readFileSync(committedPath, "utf8")) as {
  referenceDate: string;
  suites: Record<string, Entry>;
};

test.describe("the web suite's own persona set (D-W5-14)", () => {
  test("reads suites.web and signs in as the web trainer by default", () => {
    expect(QA_WEB_SUITE).toBe("web");
    const expectations = loadExpectations({});
    expect(expectations.accounts.map((a) => a.email)).toEqual(
      committed.suites.web!.accounts.map((a) => a.email),
    );
    for (const a of expectations.accounts) expect(a.email.startsWith("qa+web-"), a.email).toBe(true);
    expect(trainerEmail(expectations, {})).toBe("qa+web-trainer@thefitbud.com");
    expect(account(expectations, "slipping").email).toBe("qa+web-slipping@thefitbud.com");
  });

  test("shares no account or client with any other suite", () => {
    const web = committed.suites.web!.accounts;
    for (const suite of Object.keys(committed.suites).filter((s) => s !== "web")) {
      const other = committed.suites[suite]!.accounts;
      for (const field of ["email", "userId", "relationshipId"] as const) {
        const theirs = new Set(other.map((a) => a[field]).filter(Boolean));
        expect(web.some((a) => a[field] && theirs.has(a[field])), `${suite} ${field}`).toBe(false);
      }
    }
  });

  test("refuses an expectations file without a web suite rather than borrowing another's", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "web-suite-"));
    try {
      const file = path.join(dir, "no-web.json");
      writeFileSync(file, JSON.stringify({ referenceDate: committed.referenceDate, suites: { api: committed.suites.api } }));
      expect(() => loadExpectations({ QA_EXPECTATIONS_FILE: file })).toThrow(/"web" suite/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
