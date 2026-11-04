import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_REHEARSAL_FLAG,
  STAGING_WEB_ORIGIN,
  assertAllowedNavigation,
  resolveStagingBaseUrl,
} from "./support/host-guard";
import { loadExpectations, missingSecrets, missingSecretsMessage } from "./support/env";
import { TEST_OTP_IDENTIFIER_RE } from "@fitbud/core";
import { SHOT_NAME_RE, isScreenshotSafe, shot } from "./support/screenshots";

// Proof that the suite cannot be pointed at anything but staging, and that it cannot
// publish a credential in a screenshot. Nothing here touches the network or needs a QA
// secret, so these run everywhere (the journeys use ./support/fixtures instead).

const trainerWebDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test.describe("host guard: resolveStagingBaseUrl", () => {
  test("defaults to the staging web host", () => {
    expect(resolveStagingBaseUrl({})).toBe(STAGING_WEB_ORIGIN);
    expect(resolveStagingBaseUrl({ STAGING_WEB_URL: "" })).toBe(STAGING_WEB_ORIGIN);
    expect(resolveStagingBaseUrl({ STAGING_WEB_URL: "https://app-staging.thefitbud.com/" })).toBe(
      STAGING_WEB_ORIGIN,
    );
  });

  const refused = [
    ["production web", "https://app.thefitbud.com"],
    ["production API", "https://api.thefitbud.com"],
    ["staging API host", "https://api-staging.thefitbud.com"],
    ["the apex site", "https://thefitbud.com"],
    ["plain http on the staging host", "http://app-staging.thefitbud.com"],
    ["another port on the staging host", "https://app-staging.thefitbud.com:8443"],
    ["a look-alike suffix", "https://app-staging.thefitbud.com.evil.test"],
    ["a look-alike prefix", "https://evil-app-staging.thefitbud.com"],
    ["userinfo before the staging host", "https://evil.test@app-staging.thefitbud.com"],
    ["credentials on the staging host", "https://user:pw@app-staging.thefitbud.com"],
    ["staging host in userinfo, production after it", "https://app-staging.thefitbud.com@app.thefitbud.com"],
    ["a path", "https://app-staging.thefitbud.com/sign-in"],
    ["a query", "https://app-staging.thefitbud.com/?next=https://app.thefitbud.com"],
    ["an unrelated host", "https://example.com"],
    ["a loopback host without the rehearsal flag", "http://127.0.0.1:8788"],
    ["not a URL", "app-staging.thefitbud.com"],
  ] as const;
  for (const [label, url] of refused) {
    test(`refuses ${label}`, () => {
      expect(() => resolveStagingBaseUrl({ STAGING_WEB_URL: url })).toThrow(/staging host guard/);
    });
  }

  test("the error never echoes credentials from the URL", () => {
    let message = "";
    try {
      resolveStagingBaseUrl({ STAGING_WEB_URL: "https://user:hunter2@app.thefitbud.com" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/staging host guard/);
    expect(message).not.toContain("hunter2");
  });

  test("the rehearsal flag admits loopback only, and only when exactly 1", () => {
    const on = { [LOCAL_REHEARSAL_FLAG]: "1" };
    expect(resolveStagingBaseUrl({ ...on, STAGING_WEB_URL: "http://127.0.0.1:8788" })).toBe(
      "http://127.0.0.1:8788",
    );
    expect(resolveStagingBaseUrl({ ...on, STAGING_WEB_URL: "http://localhost:5174" })).toBe(
      "http://localhost:5174",
    );
    for (const url of [
      "https://app.thefitbud.com",
      "https://api-staging.thefitbud.com",
      "http://127.0.0.1.evil.test",
      "http://evil.test@127.0.0.1:8788",
    ]) {
      expect(() => resolveStagingBaseUrl({ ...on, STAGING_WEB_URL: url })).toThrow(/staging host guard/);
    }
    for (const value of ["true", "0", "yes", ""]) {
      expect(() =>
        resolveStagingBaseUrl({ [LOCAL_REHEARSAL_FLAG]: value, STAGING_WEB_URL: "http://127.0.0.1:8788" }),
      ).toThrow(/staging host guard/);
    }
  });
});

test.describe("host guard: navigation", () => {
  test("a page that leaves the allowed origin fails", () => {
    expect(() => assertAllowedNavigation(`${STAGING_WEB_ORIGIN}/clients`, STAGING_WEB_ORIGIN)).not.toThrow();
    expect(() => assertAllowedNavigation("about:blank", STAGING_WEB_ORIGIN)).not.toThrow();
    expect(() => assertAllowedNavigation("https://app.thefitbud.com/", STAGING_WEB_ORIGIN)).toThrow(
      /staging host guard/,
    );
    expect(() =>
      assertAllowedNavigation("https://app-staging.thefitbud.com.evil.test/", STAGING_WEB_ORIGIN),
    ).toThrow(/staging host guard/);
  });
});

test.describe("host guard: the real config", () => {
  // Every child results dir this file created and has not removed yet. `listWith` clears
  // its own entry in a `finally`; `afterAll` is the backstop for anything that escaped.
  const childResultsDirs = new Set<string>();

  function removeChildResultsDir(dir: string): void {
    // `force` so a child that never wrote (it refused before the reporter ran) is fine too.
    rmSync(dir, { recursive: true, force: true });
    childResultsDirs.delete(dir);
  }

  test.afterAll(() => {
    for (const dir of [...childResultsDirs]) removeChildResultsDir(dir);
  });

  // Runs `playwright test -c playwright.staging.config.ts --list` in a child process, so
  // this proves the config itself refuses, not just the helper it calls.
  function listWith(env: Record<string, string>) {
    const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
    const clean = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) =>
          !k.startsWith("PW_") &&
          !k.startsWith("PLAYWRIGHT") &&
          k !== "STAGING_WEB_URL" &&
          k !== LOCAL_REHEARSAL_FLAG,
      ),
    ) as Record<string, string>;
    // Own results dir: the child loads the same config and LogReporter, and must never write
    // into (or truncate) this run's log and reports, whether QA_RESULTS_DIR is set or not.
    const childResultsDir = mkdtempSync(path.join(tmpdir(), "qt5-child-"));
    childResultsDirs.add(childResultsDir);
    try {
      // `spawnSync` returns however the child ended — clean exit, non-zero status, signal,
      // spawn error or timeout — so the `finally` removes the dir on every one of those
      // paths, not just the one where the child exits 0. Nothing reads the dir afterwards:
      // the assertions below only look at the child's status, stdout and stderr.
      return spawnSync(process.execPath, [cli, "test", "-c", "playwright.staging.config.ts", "--list"], {
        cwd: trainerWebDir,
        env: { ...clean, QA_RESULTS_DIR: childResultsDir, ...env },
        encoding: "utf8",
      });
    } finally {
      removeChildResultsDir(childResultsDir);
    }
  }

  test("refuses to load for the production web host", () => {
    const run = listWith({ STAGING_WEB_URL: "https://app.thefitbud.com" });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/staging host guard/);
    // It refused before listing a single test.
    expect(run.stdout).not.toMatch(/Total: \d+ tests/);
  });

  test("refuses to load for a loopback host without the rehearsal flag", () => {
    const run = listWith({ STAGING_WEB_URL: "http://127.0.0.1:8788" });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/staging host guard/);
  });

  test("lists the journeys for the staging host", () => {
    const run = listWith({});
    expect(`${run.stdout}${run.stderr}`).not.toMatch(/staging host guard/);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Total: \d+ tests/);
  });
});

test.describe("secrets", () => {
  test("missing secrets are named, never valued", () => {
    expect(missingSecrets({})).toEqual(["QA_TEST_OTP_CODE", "FITBUD_QA_PASSWORD"]);
    expect(missingSecretsMessage({})).toMatch(/^skipped: QA secrets not set/);
    expect(missingSecrets({ QA_TEST_OTP_CODE: "123456", FITBUD_QA_PASSWORD: "x" })).toEqual([]);
    expect(missingSecretsMessage({ QA_TEST_OTP_CODE: "123456", FITBUD_QA_PASSWORD: "x" })).toBeNull();
    const message = missingSecretsMessage({ QA_TEST_OTP_CODE: "123456", FITBUD_QA_PASSWORD: " " }) ?? "";
    expect(message).not.toContain("123456");
  });
});

test.describe("screenshots never carry a credential (D-QA1-14)", () => {
  const secrets = ["482915", "Not-A-Real-Pw-1"];

  test("a filled code field is refused", async ({ page }) => {
    await page.setContent(
      `<div class="otp-boxes">${[4, 8, 2, 9, 1, 5]
        .map((d) => `<input class="otp-box" value="${d}">`)
        .join("")}</div>`,
    );
    expect(await isScreenshotSafe(page, secrets)).toBe(false);
    await expect(shot(page, "web-guard__otp")).rejects.toThrow(/shows a credential/);
  });

  test("an empty code field is fine", async ({ page }) => {
    await page.setContent(
      `<div class="otp-boxes">${"<input class='otp-box'>".repeat(6)}</div>`,
    );
    expect(await isScreenshotSafe(page, secrets)).toBe(true);
  });

  test("a filled password field is refused, even if its value is unknown", async ({ page }) => {
    await page.setContent(`<input type="password" value="whatever">`);
    expect(await isScreenshotSafe(page, secrets)).toBe(false);
  });

  test("a secret value in any input or in the visible text is refused", async ({ page }) => {
    await page.setContent(`<input type="text" value="x-${secrets[0]}-y">`);
    expect(await isScreenshotSafe(page, secrets)).toBe(false);
    await page.setContent(`<p>Your code is ${secrets[0]}</p>`);
    expect(await isScreenshotSafe(page, secrets)).toBe(false);
    await page.setContent(`<p>Hello</p><input type="text" value="not secret">`);
    expect(await isScreenshotSafe(page, secrets)).toBe(true);
  });

  test("shot names follow web-<journey>__<step>", () => {
    expect(SHOT_NAME_RE.test("web-clients__list")).toBe(true);
    expect(SHOT_NAME_RE.test("clients__list")).toBe(false);
    expect(SHOT_NAME_RE.test("web-clients_list")).toBe(false);
    expect(SHOT_NAME_RE.test("web-Clients__List")).toBe(false);
  });
});

test.describe("QA accounts vs the QT1 allowlist", () => {
  test("all three committed QA emails match TEST_OTP_IDENTIFIER_RE (catches QT1 or QT2 drift)", () => {
    const emails = loadExpectations().accounts.map((a) => a.email);
    expect(emails).toHaveLength(3);
    for (const email of emails) expect(TEST_OTP_IDENTIFIER_RE.test(email), email).toBe(true);
  });
});
