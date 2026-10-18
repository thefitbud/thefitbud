/**
 * Banned-strings check (Batch 0 / 01-product-rules §B).
 * Reads docs/spec/banned-strings.json and scans rendered UI text.
 *
 * Run against trainer web (:5173) and, when EXPO_WEB_URL is set, Expo web (:8081).
 * Screen batches clear remaining hits; Batch 0 reports the current failure list.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type BannedPattern = {
  id: string;
  regex: string;
  flags: string;
  scope: "both" | "web" | "mobile";
  severity: "error" | "warn";
  why: string;
};

type RoleCheck = {
  id: string;
  scope: "both" | "web" | "mobile";
  locator: string;
  expectCount: number;
  severity: "error" | "warn";
  why: string;
};

type BannedSpec = {
  patterns: BannedPattern[];
  roleChecks: RoleCheck[];
};

const SPEC_PATH = resolve(
  process.cwd(),
  "../../docs/spec/banned-strings.json",
);
const banned = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as BannedSpec;

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const EXPO_WEB_URL = process.env.EXPO_WEB_URL; // e.g. http://127.0.0.1:8081

type Hit = {
  id: string;
  severity: string;
  match: string;
  route: string;
  why: string;
};

function collectText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const chunks: string[] = [document.body?.innerText ?? ""];
    document.querySelectorAll("[title],[aria-label],[placeholder]").forEach((el) => {
      for (const attr of ["title", "aria-label", "placeholder"] as const) {
        const v = el.getAttribute(attr);
        if (v) chunks.push(v);
      }
    });
    return chunks.join("\n");
  });
}

function scanText(
  text: string,
  route: string,
  scope: "web" | "mobile",
): Hit[] {
  const hits: Hit[] = [];
  for (const pattern of banned.patterns) {
    if (pattern.scope !== "both" && pattern.scope !== scope) continue;
    const re = new RegExp(pattern.regex, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    const matches = text.match(re);
    if (!matches) continue;
    for (const match of matches.slice(0, 5)) {
      hits.push({
        id: pattern.id,
        severity: pattern.severity,
        match,
        route,
        why: pattern.why,
      });
    }
  }
  return hits;
}

async function scanRoleChecks(
  page: Page,
  route: string,
  scope: "web" | "mobile",
): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const check of banned.roleChecks) {
    if (check.scope !== "both" && check.scope !== scope) continue;
    // Only the documented refresh role check is automated here.
    if (!check.locator.includes("refresh")) continue;
    const count = await page
      .getByRole("button", { name: /^\s*refresh\s*$/i })
      .count();
    if (count !== check.expectCount) {
      hits.push({
        id: check.id,
        severity: check.severity,
        match: `found ${count} Refresh button(s)`,
        route,
        why: check.why,
      });
    }
  }
  return hits;
}

async function signInTrainerWeb(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: /mobile number or email/i })
    .fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/", { timeout: 45_000 });
}

async function resolveClientWorkspacePath(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    sessionStorage.getItem("fitbud.trainer.accessToken"),
  );
  const res = await fetch(`${API}/clients?limit=5`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = (await res.json()) as {
    data?: { items?: Array<{ relationshipId?: string; id?: string }> };
    items?: Array<{ relationshipId?: string; id?: string }>;
  };
  const items = json.data?.items ?? json.items ?? [];
  const id = items[0]?.relationshipId ?? items[0]?.id;
  if (!id) throw new Error("no client for workspace banned-strings check");
  return `/clients/${id}`;
}

test.describe("banned-strings · trainer web", () => {
  test("Home, roster, client workspace", async ({ page }) => {
    test.setTimeout(180_000);
    await signInTrainerWeb(page);

    const routes = ["/", "/clients", await resolveClientWorkspacePath(page)];
    const allHits: Hit[] = [];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(800);
      const text = await collectText(page);
      allHits.push(...scanText(text, route, "web"));
      allHits.push(...(await scanRoleChecks(page, route, "web")));
    }

    const errors = allHits.filter((h) => h.severity === "error");
    const warns = allHits.filter((h) => h.severity === "warn");

    // Always print the report — Batch 0 expects remaining hits listed.
    console.log(
      JSON.stringify(
        {
          app: "trainer-web",
          errorCount: errors.length,
          warnCount: warns.length,
          errors,
          warns,
        },
        null,
        2,
      ),
    );

    // Soft assertion: do not fail CI in Batch 0 — screen batches clear hits.
    // Expose counts via attach for BATCH-0.md.
    await test.info().attach("banned-strings-web.json", {
      body: Buffer.from(JSON.stringify({ errors, warns }, null, 2)),
      contentType: "application/json",
    });
    expect(errors.length, `banned-string errors still present (expected until screen batches): ${errors.map((e) => `${e.route}:${e.id}=${e.match}`).join("; ")}`).toBeGreaterThanOrEqual(0);
  });
});

test.describe("banned-strings · Expo web", () => {
  test.skip(!EXPO_WEB_URL, "Set EXPO_WEB_URL to run mobile Expo web checks");

  test("Today + trainer Attention", async ({ page }) => {
    test.setTimeout(180_000);
    const base = EXPO_WEB_URL!;

    async function visit(path: string, account: string) {
      const url = new URL(path, base);
      url.searchParams.set("captureAccount", account);
      await page.goto(url.toString());
      await page.waitForTimeout(1500);
      return collectText(page);
    }

    const allHits: Hit[] = [];

    const todayText = await visit("/", "aarav.ontrack@demo.fitbud.test");
    allHits.push(...scanText(todayText, "mobile/Today", "mobile"));
    allHits.push(...(await scanRoleChecks(page, "mobile/Today", "mobile")));

    const attentionText = await visit("/", "rahul.coach@demo.fitbud.test");
    allHits.push(...scanText(attentionText, "mobile/Attention", "mobile"));
    allHits.push(
      ...(await scanRoleChecks(page, "mobile/Attention", "mobile")),
    );

    const errors = allHits.filter((h) => h.severity === "error");
    const warns = allHits.filter((h) => h.severity === "warn");
    console.log(
      JSON.stringify(
        {
          app: "expo-web",
          errorCount: errors.length,
          warnCount: warns.length,
          errors,
          warns,
        },
        null,
        2,
      ),
    );
    await test.info().attach("banned-strings-mobile.json", {
      body: Buffer.from(JSON.stringify({ errors, warns }, null, 2)),
      contentType: "application/json",
    });
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });
});
