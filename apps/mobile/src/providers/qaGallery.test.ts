import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-linking", () => ({
  getInitialURL: vi.fn(async () => null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

import { LOCAL_QA_API_URLS, qaGalleryCommand } from "./qaGallery";

describe("qaGalleryCommand", () => {
  it("opens on fitbud://qa/primitives and closes on fitbud://qa/app", () => {
    expect(qaGalleryCommand("fitbud://qa/primitives")).toBe("open");
    expect(qaGalleryCommand("fitbud://qa/primitives/")).toBe("open");
    expect(qaGalleryCommand("fitbud://qa/app")).toBe("close");
  });

  it("ignores every other link, so the app's own deep links are untouched", () => {
    for (const url of [
      null,
      "",
      "fitbud://today/self",
      "fitbud://go/meal/abc",
      "https://fitbud.app/qa/primitives",
      "fitbud://qa/primitives-extra",
      "fitbud://qa",
    ]) {
      expect(qaGalleryCommand(url), String(url)).toBeNull();
    }
  });
});

describe("App.tsx gallery gate (kept out of store builds)", () => {
  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../App.tsx"),
    "utf8",
  );

  it("requires the gallery only inside the __DEV__ flag or local-API branches", () => {
    const requires = app.match(/require\("\.\/src\/components\/PrimitiveGallery"\)/g) ?? [];
    expect(requires).toHaveLength(2);
    expect(app).not.toMatch(/import\s+\{[^}]*PrimitiveGallery[^}]*\}\s+from/);
    expect(app).toMatch(/if \(__DEV__ && process\.env\.EXPO_PUBLIC_PRIMITIVE_GALLERY === "1"\)/);
  });

  it("compares the inlined API URL with literals (constant-foldable) that match the harness", () => {
    for (const url of LOCAL_QA_API_URLS) {
      expect(app).toContain(`process.env.EXPO_PUBLIC_API_BASE_URL === "${url}"`);
    }
  });

  it("no EAS profile points at a local QA API", () => {
    const eas = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../eas.json"),
      "utf8",
    );
    for (const url of LOCAL_QA_API_URLS) expect(eas).not.toContain(url);
  });
});
