#!/usr/bin/env node
/**
 * Capture all FitBud mobile TR/TM screens at 390×844 via Expo web + capture bridge.
 *
 * Prereqs:
 *   pnpm db:reset && pnpm api
 *   cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 EXPO_PUBLIC_SCREEN_CAPTURE=1 pnpm exec expo start --web --port 8081
 *   pnpm add -D playwright -w && pnpm exec playwright install chromium
 *
 * Usage: node scripts/capture-all-mobile-screens.mjs [baseUrl]
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/implementation/screens/mobile");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";

/** Batched logins to avoid auth rate limits. */
const BATCHES = [
  {
    login: "signOut",
    screens: ["TR-01"],
  },
  {
    login: "invite",
    screens: ["TR-02"],
  },
  {
    login: "trainee:vikram.onboarding@demo.fitbud.test",
    screens: ["TR-03"],
  },
  {
    login: "trainee:sneha.review@demo.fitbud.test",
    screens: ["TR-04"],
  },
  {
    login: "trainee:aarav.ontrack@demo.fitbud.test",
    screens: [
      "TR-05",
      "TR-06",
      "TR-09",
      "TR-10",
      "TR-11",
      "TR-12",
      "TR-13",
      "TR-14",
      "TR-15",
      "TR-16",
      "TR-17",
      "TR-18",
      "TR-19",
      "TR-20",
      "TR-21",
      "TR-23",
      "TR-24",
      "TR-25",
      "TR-26",
    ],
  },
  {
    login: "trainee:lakshmi.foods@demo.fitbud.test",
    screens: ["TR-07", "TR-08"],
  },
  {
    login: "trainee:kavya.ended@demo.fitbud.test",
    screens: ["TR-22"],
  },
  {
    login: "trainer",
    screens: ["TM-01", "TM-02", "TM-03", "TM-04", "TM-05", "TM-06", "TM-07", "TM-09"],
  },
  {
    login: "trainee:karan.dual@demo.fitbud.test",
    screens: ["TM-08"],
  },
];

const AUTH_SCREEN_MARKERS = [
  "Sign in",
  "Enter your mobile number or email",
  "Something went wrong",
  "We could not load your coaching account",
];

async function sha256File(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function pageLooksLikeAuthOrError(page) {
  const text = await page.locator("body").innerText();
  if (text.includes("Loading")) return true;
  for (const marker of AUTH_SCREEN_MARKERS) {
    if (text.includes(marker)) return true;
  }
  return false;
}

async function runLogin(page, login) {
  if (login === "signOut") {
    await page.evaluate(() => globalThis.__fitbudCapture.signOut());
    await page.waitForTimeout(800);
    return;
  }
  if (login === "invite") {
    await page.evaluate(() => globalThis.__fitbudCapture.loginInvite());
    await page.waitForTimeout(2500);
    return;
  }
  if (login === "trainer") {
    await page.evaluate(() => globalThis.__fitbudCapture.loginTrainer());
    await page.waitForTimeout(2500);
    return;
  }
  if (login.startsWith("trainee:")) {
    const email = login.slice("trainee:".length);
    await page.evaluate(
      (addr) => globalThis.__fitbudCapture.loginTrainee(addr),
      email,
    );
    await page.waitForTimeout(2500);
  }
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "Playwright missing. Run: pnpm add -D playwright -w && pnpm exec playwright install chromium",
    );
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () => globalThis.__fitbudCapture?.ready === true,
    { timeout: 120_000 },
  );

  const hashes = new Map();
  const sizes = [];

  for (const batch of BATCHES) {
    await runLogin(page, batch.login);

    for (const id of batch.screens) {
      await page.evaluate(
        async (screenId) => {
          await globalThis.__fitbudCapture.navigate(screenId, { skipAuth: true });
        },
        id,
      );

      if (id === "TR-11" || id === "TR-12") {
        const back = page.getByRole("button", { name: "Back" });
        if (await back.isVisible().catch(() => false)) {
          await back.click();
          await page.waitForTimeout(800);
        }
        const start = page
          .getByRole("button", { name: /Start [Ww]orkout|Continue workout/i })
          .first();
        if (await start.isVisible().catch(() => false)) {
          await start.click();
          await page.waitForTimeout(3500);
        }
      }

      if (id === "TR-08") {
        await page
          .getByText("What did you have instead?")
          .waitFor({ state: "visible", timeout: 45_000 });
        await page.waitForTimeout(1200);
      }

      if (id === "TR-12") {
        const finish = page.getByRole("button", { name: /Finish workout/i });
        if (await finish.isVisible().catch(() => false)) {
          await finish.click();
          await page.waitForTimeout(2000);
        }
      }

      await page.waitForTimeout(id === "TR-01" ? 1500 : 1200);

      const bodyText = await page.locator("body").innerText();
      if (id === "TR-02" && !bodyText.includes("Join your coach")) {
        throw new Error(`${id}: expected accept-invite screen.`);
      }
      if (
        id !== "TR-01" &&
        id !== "TR-02" &&
        (await pageLooksLikeAuthOrError(page))
      ) {
        throw new Error(
          `${id}: page still shows sign-in or error — navigation failed.`,
        );
      }

      const file = path.join(outDir, `${id}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const { size } = await stat(file);
      const hash = await sha256File(file);
      sizes.push({ id, size, hash });

      if (hashes.has(hash)) {
        throw new Error(
          `${id}: screenshot identical to ${hashes.get(hash)} (hash ${hash.slice(0, 12)}…).`,
        );
      }
      hashes.set(hash, id);
      console.log(`Saved ${id}.png (${size} bytes)`);
    }
  }

  await browser.close();

  const manifest = sizes
    .map((row) => `${row.id}\t${row.size}\t${row.hash}`)
    .join("\n");
  await writeFile(path.join(outDir, "manifest.txt"), `${manifest}\n`);
  console.log("\nAll captures OK.\n", manifest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
