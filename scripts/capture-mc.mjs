#!/usr/bin/env node
/**
 * Capture MC evidence screenshots from Expo web.
 * Prereqs: API :8787, Expo web :8081 with EXPO_PUBLIC_SCREEN_CAPTURE=1
 */
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/spec/evidence");
const artifactsDir = "/opt/cursor/artifacts/screenshots";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";

const VIEWPORTS = [
  { name: "ios", width: 393, height: 852 },
  { name: "small", width: 360, height: 800 },
];

async function main() {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true }).catch(() => {});
  const browser = await chromium.launch();

  async function withPage(viewport, fn) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("console", msg.text().slice(0, 180));
    });
    try {
      await fn(page);
    } finally {
      await page.close();
    }
  }

  async function shot(page, id) {
    const file = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("Saved", file);
    try {
      await copyFile(file, path.join(artifactsDir, `${id}.png`));
    } catch {
      /* optional */
    }
  }

  async function gotoApp(page) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => Boolean(window.__fitbudCapture?.ready),
      { timeout: 90_000 },
    );
    await page.waitForTimeout(1500);
  }

  async function login(page, email) {
    await page.evaluate(async (value) => {
      await window.__fitbudCapture.loginTrainee(value);
    }, email);
    await page.waitForTimeout(2800);
  }

  async function nav(page, id, skipAuth = false) {
    await page.evaluate(
      async ({ screenId, skip }) => {
        await window.__fitbudCapture.navigate(screenId, { skipAuth: skip });
      },
      { screenId: id, skip: skipAuth },
    );
    await page.waitForTimeout(2200);
  }

  async function textOf(page) {
    return page.evaluate(() => document.body.innerText);
  }

  const notes = [];

  await withPage(VIEWPORTS[0], async (page) => {
    await gotoApp(page);
    await login(page, "aarav.ontrack@demo.fitbud.test");
    await nav(page, "TR-20", true);
    await shot(page, "TR-20");
    notes.push(["TR-20", (await textOf(page)).slice(0, 500)]);

    await nav(page, "TR-16", true);
    await shot(page, "TR-16");
    notes.push(["TR-16", (await textOf(page)).slice(0, 700)]);

    await nav(page, "TR-17", true);
    await shot(page, "TR-17");
    notes.push(["TR-17", (await textOf(page)).slice(0, 500)]);

    await nav(page, "TR-24", true);
    await shot(page, "TR-24");
    notes.push(["TR-24", (await textOf(page)).slice(0, 800)]);

    await nav(page, "TR-19", true);
    await shot(page, "TR-19");
    notes.push(["TR-19", (await textOf(page)).slice(0, 500)]);

    await nav(page, "TR-21", true);
    await shot(page, "TR-21");
    notes.push(["TR-21", (await textOf(page)).slice(0, 600)]);

    await nav(page, "TR-25", true);
    await shot(page, "TR-25");
    notes.push(["TR-25", (await textOf(page)).slice(0, 400)]);

    await login(page, "farhan.paused@demo.fitbud.test");
    await nav(page, "TR-16", true);
    await shot(page, "TR-16--farhan-paused");
    notes.push(["TR-16-farhan", (await textOf(page)).slice(0, 600)]);

    await login(page, "ishita.pushoff@demo.fitbud.test");
    await nav(page, "TR-16", true);
    await shot(page, "TR-16--ishita-pushoff");
    notes.push(["TR-16-ishita", (await textOf(page)).slice(0, 600)]);

    await login(page, "deepak.dubai@demo.fitbud.test");
    await nav(page, "TR-24", true);
    await shot(page, "TR-24--deepak-dubai");
    notes.push(["TR-24-deepak", (await textOf(page)).slice(0, 700)]);

    await login(page, "kavya.ended@demo.fitbud.test");
    await nav(page, "TR-22", false);
    await shot(page, "TR-22");
    notes.push(["TR-22", (await textOf(page)).slice(0, 700)]);

    await login(page, "nikhil.reactivate@demo.fitbud.test");
    await nav(page, "TR-22", true);
    await shot(page, "TR-22--nikhil-reactivate");
    notes.push(["TR-22-nikhil", (await textOf(page)).slice(0, 700)]);
  });

  await withPage(VIEWPORTS[1], async (page) => {
    await gotoApp(page);
    await login(page, "aarav.ontrack@demo.fitbud.test");
    await nav(page, "TR-20", true);
    await shot(page, "TR-20-small");
    await nav(page, "TR-16", true);
    await shot(page, "TR-16-small");
  });

  await browser.close();
  console.log("--- notes ---");
  for (const [id, text] of notes) {
    console.log("\n##", id, "\n", text.replaceAll("\n", " | "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
