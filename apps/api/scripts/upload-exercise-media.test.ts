import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryR2Bucket } from "../src/lib/memory-r2.js";
import {
  BASE_DIR,
  parseUploadArgs,
  planMediaFiles,
  remotePutArgs,
  runUpload,
  uploadToSink,
  type MediaSink,
  type UploadDeps,
} from "./upload-exercise-media.js";

describe("upload-exercise-media (Z14-48)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fitbud-media-test-"));
    mkdirSync(path.join(dir, "media", "goblet-squat"), { recursive: true });
    writeFileSync(path.join(dir, "media/goblet-squat/start.png"), "png-start");
    writeFileSync(path.join(dir, "media/goblet-squat/end.jpg"), "jpg-end-bytes");
    writeFileSync(
      path.join(dir, "exercises.json"),
      JSON.stringify({
        exercises: [
          {
            slug: "goblet-squat",
            media: [
              { file: "media/goblet-squat/start.png" },
              { file: "media/goblet-squat/end.jpg" },
              { file: "media/goblet-squat/gone.png" },
            ],
          },
          { slug: "no-drawing", media: [] },
        ],
      }),
    );
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const bucketSink = (bucket: R2Bucket): MediaSink => bucket as unknown as MediaSink;

  function deps(overrides: Partial<UploadDeps> = {}) {
    const lines: string[] = [];
    const errors: string[] = [];
    const ran: string[][] = [];
    const value: UploadDeps = {
      openLocalSink: async () => {
        throw new Error("unexpected local sink");
      },
      runRemote: (args) => {
        ran.push(args);
      },
      out: (line) => {
        lines.push(line);
      },
      err: (line) => {
        errors.push(line);
      },
      ...overrides,
    };
    return { value, lines, errors, ran };
  }

  it("maps every file to the storage key D1 holds, with content types", () => {
    const files = planMediaFiles(dir);
    expect(files.map((f) => f.key)).toEqual([
      "exercises/goblet-squat/1.png",
      "exercises/goblet-squat/2.jpg",
      "exercises/goblet-squat/3.png",
    ]);
    expect(files.map((f) => f.contentType)).toEqual(["image/png", "image/jpeg", "image/png"]);
    expect(files.map((f) => f.size)).toEqual([9, 13, null]);
  });

  it("plans all 919 drawings of the real exercise base with none missing", () => {
    const files = planMediaFiles(BASE_DIR);
    expect(files).toHaveLength(919);
    expect(files.filter((f) => f.size === null)).toEqual([]);
    expect(new Set(files.map((f) => f.key)).size).toBe(919);
  });

  it("writes the expected keys with content types, skips same-size objects, and is idempotent", async () => {
    const bucket = createMemoryR2Bucket();
    const files = planMediaFiles(dir);

    const first = await uploadToSink(files, bucketSink(bucket));
    expect(first).toMatchObject({ total: 3, uploaded: 2, skipped: 0 });
    expect(first.missing).toHaveLength(1);
    const png = await bucket.get("exercises/goblet-squat/1.png");
    expect(png?.httpMetadata?.contentType).toBe("image/png");
    expect(await png?.text()).toBe("png-start");
    expect((await bucket.get("exercises/goblet-squat/2.jpg"))?.httpMetadata?.contentType).toBe(
      "image/jpeg",
    );
    expect(await bucket.get("exercises/goblet-squat/3.png")).toBeNull();

    const second = await uploadToSink(files, bucketSink(bucket));
    expect(second).toMatchObject({ uploaded: 0, skipped: 2 });

    // A different size is rewritten.
    await bucket.put("exercises/goblet-squat/1.png", "x");
    const third = await uploadToSink(files, bucketSink(bucket));
    expect(third).toMatchObject({ uploaded: 1, skipped: 1 });
  });

  it("local target writes through the local sink", async () => {
    const bucket = createMemoryR2Bucket();
    let closed = false;
    const { value: d } = deps({
      openLocalSink: async () => ({
        sink: bucketSink(bucket),
        close: async () => {
          closed = true;
        },
      }),
    });
    const code = await runUpload(["--target", "local"], planMediaFiles(dir), d);
    expect(code).toBe(1); // one file is missing from the repo
    expect(closed).toBe(true);
    expect(await bucket.head("exercises/goblet-squat/2.jpg")).not.toBeNull();
  });

  it("dry run lists counts and missing files and writes nothing", async () => {
    const d = deps();
    const code = await runUpload(["--target", "staging", "--dry-run"], planMediaFiles(dir), d.value);
    expect(code).toBe(1);
    expect(d.lines[0]).toContain("3 drawings, 2 present in the repo, 1 missing");
    expect(d.errors[0]).toContain("gone.png");
    expect(d.ran).toEqual([]);
  });

  it("staging and production print the exact commands and run nothing without --yes", async () => {
    const stagingDeps = deps();
    await runUpload(["--target", "staging"], planMediaFiles(dir), stagingDeps.value);
    const printed = stagingDeps.lines.join("\n");
    expect(printed).toContain("wrangler r2 object put fitbud-media-nonprod/staging/exercises/goblet-squat/1.png");
    expect(printed).toContain("--content-type image/png");
    expect(printed).toContain("--remote");
    expect(stagingDeps.ran).toEqual([]);

    const prodFile = planMediaFiles(dir)[0]!;
    expect(remotePutArgs("production", prodFile)).toContain("fitbud-media-prod/exercises/goblet-squat/1.png");
  });

  it("runs the remote commands only with --yes", async () => {
    const d = deps();
    await runUpload(["--target", "production", "--yes"], planMediaFiles(dir), d.value);
    expect(d.ran).toHaveLength(2);
    expect(d.ran[0]).toContain("--remote");
  });

  it("rejects bad arguments", () => {
    expect(() => parseUploadArgs([])).toThrow(/Unknown target/);
    expect(() => parseUploadArgs(["--target", "prod"])).toThrow(/Unknown target/);
    expect(() => parseUploadArgs(["--target", "local", "--nope"])).toThrow(/Unknown argument/);
    expect(parseUploadArgs(["--", "--target=local", "--dry-run"])).toEqual({
      target: "local",
      dryRun: true,
      yes: false,
    });
  });
});
