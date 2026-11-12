import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkText, compareImages, imageMagickAvailable, loadBanned, loadEnumValues, loadFrameMap, main, parseArgs,
  parseSpecFrames, pickFrame, readTree, runArtifact, runTask, stripCapture,
} from "./diff.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const REPO = path.resolve(HERE, "../../..");
const magick = imageMagickAvailable();
const skipIM = magick ? false : "ImageMagick not installed";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "dr-test-"));
const ctx = () => ({
  enumValues: loadEnumValues(path.join(REPO, "packages/core/src/labels.ts")),
  banned: loadBanned(path.join(REPO, "docs/spec/banned-strings.json")),
});

/** A throwaway repo layout: frames, a spec, and captures for task ZZ-1. */
function layout() {
  const root = tmp();
  const frames = path.join(root, "frames");
  const specs = path.join(root, "specs");
  const qa = path.join(root, "qa");
  for (const d of [frames, specs, path.join(qa, "ZZ-1")]) fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(FIX, "frame.png"), path.join(frames, "01-fixture-screen-ios.png"));
  fs.copyFileSync(path.join(FIX, "frame.png"), path.join(frames, "02-fixture-other-ios.png"));
  fs.writeFileSync(
    path.join(specs, "ZZ-1.md"),
    `---\nid: ZZ-1\nframes:\n  - { frame: "01-fixture-screen-ios.png", viewport: "393x852" }\n  - { frame: "02-fixture-other-ios.png", viewport: "393x852" }\nmodel: sonnet\n---\nbody\n`,
  );
  return { root, frames, specs, qa };
}
const opts = (l, extra = {}) => ({
  ...parseArgs(["--task", "ZZ-1"]), framesDir: l.frames, specsDir: l.specs, qaDir: l.qa, ...extra,
});

test("parseSpecFrames reads the frames list, and an empty one", () => {
  const f = parseSpecFrames(fs.readFileSync(path.join(REPO, "docs/specs/Z10-5.md"), "utf8"));
  assert.deepEqual(f.map((x) => x.frame), ["35-trainer-mobile-exception-more-sheet-ios.png", "36-trainer-mobile-note-composer-sheet-ios.png"]);
  assert.equal(f[0].viewport, "393x852");
  assert.deepEqual(parseSpecFrames("---\nid: X\nframes: []\nmodel: sonnet\n---\n"), []);
});

test("pickFrame pairs by exact stem, then number prefix, then rejects", () => {
  const cands = [
    { frame: "35-trainer-mobile-exception-more-sheet-ios.png", viewport: "393x852" },
    { frame: "36-trainer-mobile-note-composer-sheet-ios.png", viewport: "393x852" },
  ];
  assert.equal(pickFrame("35-trainer-mobile-exception-more-sheet-ios-393x852.png", cands).exact, true);
  const byPrefix = pickFrame("36-note-saved-ios-393x852.png", cands);
  assert.equal(byPrefix.frame, "36-trainer-mobile-note-composer-sheet-ios.png");
  assert.equal(byPrefix.exact, false);
  assert.equal(pickFrame("99-nothing-ios-393x852.png", cands), null);
  assert.deepEqual(stripCapture("179-client-ended-1440x900.png"), { stem: "179-client-ended", viewport: "1440x900" });
});

test("pickFrame prefers the frame on the capture's platform", () => {
  const cands = [{ frame: "18-status-ios.png" }, { frame: "18-status-android.png" }];
  assert.equal(pickFrame("18-client-status-android-412x915.png", cands).frame, "18-status-android.png");
  assert.equal(pickFrame("18-client-status-ios-393x852.png", cands).frame, "18-status-ios.png");
});

test("the real frame map names only frames that exist", () => {
  const map = loadFrameMap(path.join(HERE, "frame-map.json"));
  assert.ok(map.size >= 40);
  for (const [name, { frames }] of map) {
    assert.ok(frames.length, name);
    for (const f of frames) assert.ok(fs.existsSync(path.join(REPO, "docs/design/mockups/png", f)), `${name} -> ${f}`);
  }
});

test("checkText flags an ISO date, a raw enum, a percent and a banned string", () => {
  const found = checkText("Due 2026-11-12 · body_weight_kg · 80% done · Day Streak", ctx());
  const checks = found.map((f) => f.check);
  assert.ok(checks.includes("ISO date"));
  assert.ok(checks.includes("Raw enum value"));
  assert.ok(checks.includes("Percentage"));
  assert.ok(checks.some((c) => c.startsWith("Banned string")));
});

test("checkText leaves clean copy and unknown snake_case alone", () => {
  assert.deepEqual(checkText("Wed 21 Oct · Body weight · 80 kg · some_other_token", ctx()), []);
});

test("readTree collects strings and tap targets under 44 from an accessibility tree", () => {
  const tree = { children: [
    { text: "Save", clickable: true, bounds: "[10,10][40,40]" },
    { text: "Big", clickable: true, bounds: "[0,0][200,60]" },
    { text: "Plain label", bounds: "[0,0][5,5]" },
  ] };
  const t = readTree(tree);
  assert.match(t.text, /Save/);
  assert.equal(t.small.length, 1);
  assert.match(t.small[0], /Save/);
});

test("task mode pairs captures to frames, reports unmapped ones and exits 0", { skip: skipIM }, () => {
  const l = layout();
  const q = path.join(l.qa, "ZZ-1");
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(q, "01-fixture-screen-ios-393x852.png"));
  fs.copyFileSync(path.join(FIX, "different.png"), path.join(q, "02-something-else-ios-393x852.png"));
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(q, "99-no-frame-ios-393x852.png"));
  fs.writeFileSync(path.join(q, "01-fixture-screen-ios-393x852.txt"), "Logged 2026-11-12 body_weight_kg 50% streak");
  const res = runTask("ZZ-1", opts(l));
  assert.equal(res.rows.length, 2);
  assert.equal(res.unmapped.length, 1);
  const same = res.rows.find((r) => r.screen.startsWith("01-"));
  const diff = res.rows.find((r) => r.screen.startsWith("02-"));
  assert.equal(same.percent, 0);
  assert.ok(diff.percent > 20, `different capture scored ${diff.percent}`);
  assert.ok(same.findings.length >= 3);
  const md = fs.readFileSync(path.join(q, "design-review.md"), "utf8");
  assert.match(md, /Unmapped screenshots/);
  assert.match(md, /99-no-frame/);
  assert.ok(md.indexOf("02-something-else") < md.indexOf("01-fixture-screen"), "worst first");
  assert.ok(fs.existsSync(path.join(q, "design-review", "01-fixture-screen-ios-393x852.png")));
});

test("compareImages scores identical images 0 and different images above 0", { skip: skipIM }, () => {
  const d = tmp();
  const a = compareImages(path.join(FIX, "frame.png"), path.join(FIX, "same.png"), path.join(d, "a.png"), d);
  const b = compareImages(path.join(FIX, "frame.png"), path.join(FIX, "different.png"), path.join(d, "b.png"), d);
  assert.equal(a.percent, 0);
  assert.ok(b.percent > 0);
  assert.ok(fs.existsSync(path.join(d, "b.png")));
});

test("artifact mode maps by frame-map.json, sorts worst first and lists unmapped", { skip: skipIM }, () => {
  const l = layout();
  const art = tmp();
  fs.mkdirSync(path.join(art, "screenshots", "ios"), { recursive: true });
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(art, "screenshots/ios/shot-a__ok.png"));
  fs.copyFileSync(path.join(FIX, "different.png"), path.join(art, "screenshots/ios/shot-b__drift.png"));
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(art, "screenshots/ios/shot-c__none.png"));
  const map = path.join(art, "map.json");
  fs.writeFileSync(map, JSON.stringify({
    "shot-a__ok": { frames: ["01-fixture-screen-ios.png"] },
    "shot-b__drift": "02-fixture-other-ios.png",
  }));
  const out = path.join(art, "out");
  const res = runArtifact(art, { ...opts(l), map, out });
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.unmapped, ["`screenshots/ios/shot-c__none.png`"]);
  const md = fs.readFileSync(path.join(out, "summary.md"), "utf8");
  assert.ok(md.indexOf("shot-b__drift") < md.indexOf("shot-a__ok"));
});

test("a missing frame is reported, not thrown", () => {
  const l = layout();
  fs.rmSync(path.join(l.frames, "01-fixture-screen-ios.png"));
  const q = path.join(l.qa, "ZZ-1");
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(q, "01-fixture-screen-ios-393x852.png"));
  const res = runTask("ZZ-1", opts(l));
  // The spec still names the frame, but the folder no longer has it.
  assert.match(res.rows[0].note, /not found/);
});

test("without ImageMagick the report says so and still pairs and checks text", () => {
  const l = layout();
  const q = path.join(l.qa, "ZZ-1");
  fs.copyFileSync(path.join(FIX, "same.png"), path.join(q, "01-fixture-screen-ios-393x852.png"));
  fs.writeFileSync(path.join(q, "01-fixture-screen-ios-393x852.txt"), "on 2026-01-02");
  const saved = process.env.PATH;
  process.env.PATH = "/nonexistent";
  let res;
  try {
    res = runTask("ZZ-1", opts(l));
  } finally {
    process.env.PATH = saved;
  }
  assert.equal(res.magick, false);
  assert.equal(res.rows[0].percent, null);
  assert.equal(res.rows[0].findings[0].check, "ISO date");
  assert.match(fs.readFileSync(path.join(q, "design-review.md"), "utf8"), /ImageMagick not available/);
});

test("bad arguments exit 1, a normal run exits 0", () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(main([]), 1);
    assert.equal(main(["--task", "A", "--artifact", "b"]), 1);
    assert.equal(main(["--task", "NO-SUCH-TASK", "--qa-dir", tmp()]), 1);
  } finally {
    console.error = quiet;
  }
  const l = layout();
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(main(["--task", "ZZ-1", "--frames-dir", l.frames, "--specs-dir", l.specs, "--qa-dir", l.qa]), 0);
  } finally {
    console.log = log;
  }
});

test("a zero-byte PNG gives a 'compare failed' row and exit 0", { skip: skipIM }, () => {
  const l = layout();
  const art = tmp();
  fs.mkdirSync(path.join(art, "screenshots", "ios"), { recursive: true });
  fs.writeFileSync(path.join(art, "screenshots/ios/shot-a__empty.png"), "");
  const map = path.join(art, "map.json");
  fs.writeFileSync(map, JSON.stringify({ "shot-a__empty": "01-fixture-screen-ios.png" }));
  const out = path.join(art, "out");
  const log = console.log;
  console.log = () => {};
  let code;
  try {
    code = main(["--artifact", art, "--out", out, "--map", map, "--frames-dir", l.frames]);
  } finally {
    console.log = log;
  }
  assert.equal(code, 0);
  assert.match(fs.readFileSync(path.join(out, "summary.md"), "utf8"), /compare failed/);
});

test("--task rejects path traversal", () => {
  assert.throws(() => parseArgs(["--task", "../etc"]), /task id/);
});
