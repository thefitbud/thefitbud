import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apiPortToProbe, localD1File } from "./local-d1.js";

describe("apiPortToProbe", () => {
  it("probes only FITBUD_API_PORT when set, else 8787", () => {
    expect(apiPortToProbe({ FITBUD_API_PORT: "8788" })).toBe(8788);
    expect(apiPortToProbe({})).toBe(8787);
    expect(apiPortToProbe({ FITBUD_API_PORT: "" })).toBe(8787);
    expect(apiPortToProbe({ FITBUD_API_PORT: "nope" })).toBe(8787);
  });
});

describe("localD1File", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const withFiles = (names: string[]) => {
    root = mkdtempSync(path.join(tmpdir(), "fitbud-d1-"));
    const dir = path.join(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
    mkdirSync(dir, { recursive: true });
    for (const name of names) writeFileSync(path.join(dir, name), "");
    return dir;
  };

  it("returns the single database and ignores metadata and WAL files", () => {
    const dir = withFiles(["abc.sqlite", "abc.sqlite-wal", "abc.sqlite-shm", "metadata.sqlite"]);
    expect(localD1File(root)).toBe(path.join(dir, "abc.sqlite"));
  });

  it("refuses when there is none", () => {
    withFiles(["metadata.sqlite"]);
    expect(() => localD1File(root)).toThrow(/not found/);
  });

  it("refuses when there is more than one instead of guessing", () => {
    withFiles(["abc.sqlite", "def.sqlite", "metadata.sqlite"]);
    expect(() => localD1File(root)).toThrow(/2 local D1 databases/);
  });
});
