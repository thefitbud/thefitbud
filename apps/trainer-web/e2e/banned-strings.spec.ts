/**
 * Banned-strings check (Batch 0 / 01-product-rules §B).
 * Reads docs/spec/banned-strings.json and scans rendered UI text.
 *
 * Batch 0 cleans a subset of screens — those hard-fail on error hits.
 * Remaining screens (Home, roster, workspace, mobile Today/Attention) are
 * report-only until their screen batches.
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
const EXPO_WEB_URL = process.env.EXPO_WEB_URL;

const ROHAN_RID = "c422296e-ed7b-4196-a2b4-647096af3002";
const SNEHA_RID = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const UNKNOWN_RID = "00000000-0000-4000-8000-000000000000";

/** Screens Batch 0 + TW-A + TW-B + TW-C cleaned — error hits fail the suite. */
const WEB_HARD_FAIL_ROUTES = new Set([
  "/sign-in",
  "/sign-in/code",
  "/forgot-password",
  "/welcome",
  "/clients",
  "/clients/add",
  "/invitations/06b54e81-016c-4220-a9a8-31195324669b",
  "/",
  "/checkins",
  "/templates",
  "/settings",
  "/not-a-real-route",
  "/?exception",
  "/?ask",
  `/clients/${ROHAN_RID}/overview`,
  `/clients/${ROHAN_RID}/configure`,
  `/clients/${ROHAN_RID}/plan`,
  `/clients/${ROHAN_RID}/activity`,
  `/clients/${ROHAN_RID}/history`,
  `/clients/${SNEHA_RID}/onboarding`,
  `/clients/${UNKNOWN_RID}`,
  `/clients/${UNKNOWN_RID}/overview`,
]);
const MOBILE_HARD_FAIL_ROUTES = new Set([
  "mobile/sign-in",
  "mobile/Workout",
  "mobile/Progress",
  "mobile/Notifications",
  "mobile/Clients",
  "mobile/More",
  "mobile/Waiting",
]);

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
    const re = new RegExp(
      pattern.regex,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
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

function partitionHits(
  hits: Hit[],
  hardFailRoutes: Set<string>,
): { hard: Hit[]; report: Hit[] } {
  const hard: Hit[] = [];
  const report: Hit[] = [];
  for (const hit of hits) {
    if (hit.severity === "error" && hardFailRoutes.has(hit.route)) {
      hard.push(hit);
    } else {
      report.push(hit);
    }
  }
  return { hard, report };
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
  const withWorkspace = items.find(
    (item) => typeof item.relationshipId === "string" && item.relationshipId,
  );
  const id = withWorkspace?.relationshipId ?? withWorkspace?.id;
  if (!id) throw new Error("no client for workspace banned-strings check");
  return `/clients/${id}`;
}

test.describe("banned-strings · trainer web", () => {
  test("sign-in + TW-A/TW-B/TW-C routes hard-fail", async ({ page }) => {
    test.setTimeout(240_000);

    const allHits: Hit[] = [];

    for (const route of ["/sign-in", "/sign-in/code", "/forgot-password"]) {
      await page.goto(route);
      await page.waitForTimeout(500);
      allHits.push(...scanText(await collectText(page), route, "web"));
      allHits.push(...(await scanRoleChecks(page, route, "web")));
    }

    await signInTrainerWeb(page);
    const hardRoutes = [
      "/",
      "/welcome?capture=welcome",
      "/clients",
      "/clients/add",
      "/invitations/06b54e81-016c-4220-a9a8-31195324669b",
      "/checkins",
      "/templates",
      "/settings",
      "/?exception=95af751f-156c-44ac-a945-ec30870134ae",
      "/?ask=b532e1ca-7fea-4563-8d50-4468bc66f586",
      "/not-a-real-route",
      `/clients/${ROHAN_RID}/overview`,
      `/clients/${ROHAN_RID}/configure`,
      `/clients/${ROHAN_RID}/plan`,
      `/clients/${ROHAN_RID}/activity`,
      `/clients/${ROHAN_RID}/history`,
      `/clients/${SNEHA_RID}/onboarding`,
      `/clients/${UNKNOWN_RID}/overview`,
    ];
    for (const route of hardRoutes) {
      await page.goto(route);
      await page.waitForTimeout(800);
      const key =
        route.startsWith("/?exception")
          ? "/?exception"
          : route.startsWith("/?ask")
            ? "/?ask"
            : route.startsWith("/welcome")
              ? "/welcome"
              : route;
      const text = await collectText(page);
      allHits.push(...scanText(text, key, "web"));
      allHits.push(...(await scanRoleChecks(page, key, "web")));
    }

    const errors = allHits.filter((h) => h.severity === "error");
    const warns = allHits.filter((h) => h.severity === "warn");
    const { hard, report } = partitionHits(allHits, WEB_HARD_FAIL_ROUTES);

    console.log(
      JSON.stringify(
        {
          app: "trainer-web",
          hardFailErrors: hard.filter((h) => h.severity === "error"),
          reportOnlyErrors: report.filter((h) => h.severity === "error"),
          warns,
          errorCount: errors.length,
          warnCount: warns.length,
        },
        null,
        2,
      ),
    );

    await test.info().attach("banned-strings-web.json", {
      body: Buffer.from(
        JSON.stringify(
          {
            hardFail: hard,
            reportOnly: report.filter((h) => h.severity === "error"),
            warns,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });

    const hardErrors = hard.filter((h) => h.severity === "error");
    expect(
      hardErrors,
      hardErrors.map((e) => `${e.route}:${e.id}=${e.match}`).join("; "),
    ).toEqual([]);
  });
});

test.describe("banned-strings · Expo web", () => {
  test.skip(!EXPO_WEB_URL, "Set EXPO_WEB_URL to run mobile Expo web checks");

  test("cleaned screens hard-fail; Today/Attention report", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const base = EXPO_WEB_URL!;

    type CaptureBridge = {
      navigate: (screenId: string) => Promise<void>;
      ready?: boolean;
    };

    async function waitForCaptureBridge() {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () =>
          Boolean(
            (globalThis as { __fitbudCapture?: CaptureBridge }).__fitbudCapture
              ?.ready,
          ),
        { timeout: 60_000 },
      );
    }

    async function captureScreen(screenId: string, route: string) {
      await page.evaluate(async (id) => {
        const bridge = (globalThis as { __fitbudCapture?: CaptureBridge })
          .__fitbudCapture;
        if (!bridge) {
          throw new Error(
            "capture bridge missing — set EXPO_PUBLIC_SCREEN_CAPTURE=1",
          );
        }
        await bridge.navigate(id);
      }, screenId);
      await page.waitForTimeout(1500);
      const text = await collectText(page);
      return {
        textHits: scanText(text, route, "mobile" as const),
        roleHits: await scanRoleChecks(page, route, "mobile"),
      };
    }

    const allHits: Hit[] = [];

    // Sign-in (no capture bridge required).
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    allHits.push(
      ...scanText(await collectText(page), "mobile/sign-in", "mobile"),
    );

    await waitForCaptureBridge();

    // Cleaned trainee screens
    for (const [id, route] of [
      ["TR-10", "mobile/Workout"],
      ["TR-13", "mobile/Progress"],
      ["TR-15", "mobile/Notifications"],
    ] as const) {
      const result = await captureScreen(id, route);
      allHits.push(...result.textHits, ...result.roleHits);
    }

    // Cleaned trainer screens
    for (const [id, route] of [
      ["TM-02", "mobile/Clients"],
      ["TM-07", "mobile/More"],
    ] as const) {
      const result = await captureScreen(id, route);
      allHits.push(...result.textHits, ...result.roleHits);
    }

    // Waiting review (sneha)
    {
      const result = await captureScreen("TR-04", "mobile/Waiting");
      allHits.push(...result.textHits, ...result.roleHits);
    }

    // Report-only until screen batches
    for (const [id, route] of [
      ["TR-06", "mobile/Today"],
      ["TM-01", "mobile/Attention"],
    ] as const) {
      const result = await captureScreen(id, route);
      allHits.push(...result.textHits, ...result.roleHits);
    }

    const errors = allHits.filter((h) => h.severity === "error");
    const warns = allHits.filter((h) => h.severity === "warn");
    const { hard, report } = partitionHits(allHits, MOBILE_HARD_FAIL_ROUTES);

    console.log(
      JSON.stringify(
        {
          app: "expo-web",
          hardFailErrors: hard.filter((h) => h.severity === "error"),
          reportOnlyErrors: report.filter((h) => h.severity === "error"),
          warns,
          errorCount: errors.length,
          warnCount: warns.length,
        },
        null,
        2,
      ),
    );

    await test.info().attach("banned-strings-mobile.json", {
      body: Buffer.from(
        JSON.stringify(
          {
            hardFail: hard,
            reportOnly: report.filter((h) => h.severity === "error"),
            warns,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });

    const hardErrors = hard.filter((h) => h.severity === "error");
    expect(
      hardErrors,
      hardErrors.map((e) => `${e.route}:${e.id}=${e.match}`).join("; "),
    ).toEqual([]);
  });
});
