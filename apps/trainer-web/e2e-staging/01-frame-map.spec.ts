import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHOT_NAME_RE } from "./support/screenshots";

// The screenshot -> frame table in playwright.staging.config.ts is the contract with the
// UI bot. This reads it with the summarizer's own parser (scripts/qa/summarize.mjs, QT8),
// so what passes here is what the bot will see.

const here = path.dirname(fileURLToPath(import.meta.url));
const trainerWebDir = path.resolve(here, "..");
const repoRoot = path.resolve(trainerWebDir, "../..");
const configFile = path.join(trainerWebDir, "playwright.staging.config.ts");
const frameDir = path.join(repoRoot, "docs/design/mockups/png");

async function loadMap(): Promise<Map<string, string>> {
  const mod = (await import(pathToFileURL(path.join(repoRoot, "scripts/qa/summarize.mjs")).href)) as {
    parseFrameMap: (text: string) => Map<string, string>;
  };
  return mod.parseFrameMap(readFileSync(configFile, "utf8"));
}

/** Every "web-<journey>__<step>" string literal in the journey specs (the 00- and 01- specs only mention names). */
function shotsTaken(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(here).filter((f) => f.endsWith(".spec.ts") && !/^0[01]-/.test(f))) {
    const source = readFileSync(path.join(here, file), "utf8");
    for (const m of source.matchAll(/"(web-[a-z0-9-]+__[a-z0-9-]+)"/g)) names.add(m[1]!);
  }
  return [...names];
}

test.describe("screenshot to frame mapping", () => {
  test("every mapped frame exists in docs/design/mockups/png", async () => {
    const map = await loadMap();
    expect(map.size).toBeGreaterThan(0);
    for (const [name, frame] of map) {
      expect(SHOT_NAME_RE.test(name), `${name} is a valid shot name`).toBe(true);
      expect(existsSync(path.join(frameDir, frame)), `${name} -> ${frame} exists`).toBe(true);
    }
  });

  test("every screenshot a journey takes has a mapping, and every mapping is used", async () => {
    const map = await loadMap();
    const taken = shotsTaken();
    expect(taken.length).toBeGreaterThan(0);
    for (const name of taken) expect(map.has(name), `${name} has a frame mapping`).toBe(true);
    for (const name of map.keys()) expect(taken, `${name} is taken by a journey`).toContain(name);
  });
});
