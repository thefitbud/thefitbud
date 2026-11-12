#!/usr/bin/env node
// Visual diff and design-review step (W11 Z11-1, D-W11-2, D-W11-3).
//
// Sets each screenshot beside its locked design frame, scores the pixel difference with
// ImageMagick (`compare -metric AE -fuzz 8%`, `montage`) and runs the design-guide text
// checks. Advisory only: it never fails a PR. Node built-ins plus the ImageMagick
// binaries; no npm dependency.
//
//   node scripts/qa/visual/diff.mjs --task <ID>
//       Compares docs/qa/<ID>/*.png against the frames named in docs/specs/<ID>.md
//       (`frames:` front matter), pairing by frame name or number prefix. Writes
//       docs/qa/<ID>/design-review.md and docs/qa/<ID>/design-review/*.png.
//   node scripts/qa/visual/diff.mjs --artifact <dir> [--out design-review]
//       Same for a QA1 `qa-report` artifact folder (screenshots/<suite>/<name>.png) using
//       scripts/qa/visual/frame-map.json. Writes <out>/summary.md, worst first.
//
// Options: --frames-dir, --specs-dir, --qa-dir, --map, --banned, --labels (all default to
// the repo's own paths, overridable for tests).
//
// Exit 0 for everything reportable: missing ImageMagick, a missing frame, an unmapped
// screenshot. Exit 1 only for a script error (bad arguments, unreadable input).
//
// The diff score is a review aid and never appears in the product (no percentages in the
// UI). How to read it: docs/runbooks/design-review.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

export const FUZZ = "8%";
export const MATCH_BELOW = 3; // percent: normally matches the frame
export const GAP_ABOVE = 12; // percent: likely a gap
export const MIN_TAP_PX = 44;
const IM_MISSING = "ImageMagick not available";

// ---------- ImageMagick ----------

/** Resolve an ImageMagick tool: IM6 binary on PATH, else IM7 `magick <tool>`. */
const toolCache = new Map();
export function resolveTool(tool) {
  const key = `${process.env.PATH}\0${tool}`;
  if (!toolCache.has(key)) toolCache.set(key, probeTool(tool));
  return toolCache.get(key);
}

function probeTool(tool) {
  const direct = spawnSync(tool, ["-version"], { encoding: "utf8" });
  if (!direct.error && direct.status === 0) return [tool];
  const m7 = spawnSync("magick", [tool, "-version"], { encoding: "utf8" });
  if (!m7.error && m7.status === 0) return ["magick", tool];
  return null;
}

export function imageMagickAvailable() {
  return Boolean(resolveTool("compare") && resolveTool("montage") && resolveTool("convert") && resolveTool("identify"));
}

function run(tool, args) {
  const cmd = resolveTool(tool);
  if (!cmd) throw new Error(IM_MISSING);
  return spawnSync(cmd[0], [...cmd.slice(1), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Width probe for the tap-target scale; an unreadable image is reported later by processPair. */
function safeWidth(file) {
  try {
    return imageSize(file).w;
  } catch {
    return null;
  }
}

export function imageSize(file) {
  const r = run("identify", ["-format", "%w %h", `${file}[0]`]);
  if (r.status !== 0) throw new Error(`identify failed for ${file}`);
  const [w, h] = r.stdout.trim().split(/\s+/).map(Number);
  return { w, h };
}

/**
 * Compare a capture with a frame. The capture is resized to the frame's width and padded
 * or cropped at the bottom to the frame's height. Returns the changed-pixel percentage
 * and writes a frame | capture | difference montage to `sideBySide`.
 */
export function compareImages(frameFile, captureFile, sideBySide, tmpDir) {
  const { w, h } = imageSize(frameFile);
  const cap = imageSize(captureFile);
  const fitted = path.join(tmpDir, "capture.png");
  const flat = path.join(tmpDir, "frame.png");
  const diff = path.join(tmpDir, "diff.png");
  const flatten = ["-background", "white", "-alpha", "remove", "-alpha", "off"];
  let r = run("convert", [`${captureFile}[0]`, ...flatten, "-resize", `${w}x`, "-gravity", "North", "-extent", `${w}x${h}`, fitted]);
  if (r.status !== 0) throw new Error(`convert failed for ${captureFile}`);
  r = run("convert", [`${frameFile}[0]`, ...flatten, flat]);
  if (r.status !== 0) throw new Error(`convert failed for ${frameFile}`);
  // compare exits 0 identical, 1 different, 2 error. The AE count is printed on stderr.
  r = run("compare", ["-metric", "AE", "-fuzz", FUZZ, flat, fitted, diff]);
  if (r.status !== 0 && r.status !== 1) throw new Error(`compare failed: ${(r.stderr || "").trim()}`);
  const changed = Number.parseFloat((r.stderr || "").trim().split(/\s+/)[0]);
  if (!Number.isFinite(changed)) throw new Error(`compare gave no pixel count: ${(r.stderr || "").trim()}`);
  fs.mkdirSync(path.dirname(sideBySide), { recursive: true });
  r = run("montage", [flat, fitted, diff, "-tile", "3x1", "-geometry", "420x+6+6", "-background", "white", `PNG8:${sideBySide}`]);
  if (r.status !== 0) throw new Error(`montage failed: ${(r.stderr || "").trim()}`);
  const scaledH = Math.round((cap.h * w) / cap.w);
  const tol = h * 0.03;
  const note = scaledH > h + tol ? "capture taller than frame: top part compared" : scaledH < h - tol ? "capture shorter than frame: padded white" : "";
  return { percent: (changed / (w * h)) * 100, note };
}

// ---------- pairing ----------

const VIEWPORT_SUFFIX = /-(\d{3,4})x(\d{3,4})$/;

export function stripCapture(name) {
  let stem = name.replace(/\.png$/i, "");
  const vp = stem.match(VIEWPORT_SUFFIX);
  if (vp) stem = stem.slice(0, vp.index);
  return { stem, viewport: vp ? `${vp[1]}x${vp[2]}` : null };
}

export const numberPrefix = (s) => (s.match(/^(\d+[a-z]?)-/) || [])[1] ?? null;

export function platformOf(stemOrSuite, viewport) {
  const t = stemOrSuite.match(/(?:^|[-_])(ios|android|web)(?:[-_]|$)/);
  if (t) return t[1];
  if (stemOrSuite === "mobile") return "android";
  if (viewport) {
    const w = Number(viewport.split("x")[0]);
    if (w >= 1000) return "web";
    if (w >= 400) return "android";
    if (w > 0) return "ios";
  }
  return null;
}

const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x && !/^\d+$/.test(x)));

/**
 * Pick the frame for a capture name from `candidates` ([{ frame, viewport? }]).
 * Exact stem match wins; otherwise the same number prefix, ranked by platform, viewport and
 * shared words. Returns null when nothing shares the stem or the number prefix.
 */
export function pickFrame(captureName, candidates, platformHint = null) {
  const { stem, viewport } = stripCapture(captureName);
  const prefix = numberPrefix(stem);
  const platform = platformHint ?? platformOf(stem, viewport);
  const capWords = words(stem);
  let best = null;
  for (const c of candidates) {
    const fStem = c.frame.replace(/\.png$/i, "");
    let score;
    if (fStem === stem) score = 1000;
    else if (prefix && numberPrefix(fStem) === prefix) score = 10;
    else continue;
    const fPlatform = platformOf(fStem, c.viewport ?? null);
    if (platform && fPlatform === platform) score += 3;
    if (viewport && c.viewport === viewport) score += 2;
    for (const w of words(fStem)) if (capWords.has(w)) score += 1;
    if (!best || score > best.score) best = { ...c, score };
  }
  if (!best) return null;
  const ties = candidates.filter((c) => numberPrefix(c.frame) === prefix).length;
  return { frame: best.frame, viewport: best.viewport ?? null, exact: best.score >= 1000, candidates: ties };
}

// ---------- spec and frame files ----------

/** `frames:` entries from a spec's front matter: [{ frame, viewport }]. */
export function parseSpecFrames(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const lines = fm[1].split(/\r?\n/);
  const i = lines.findIndex((l) => /^frames:/.test(l));
  if (i < 0) return [];
  const out = [];
  for (const line of lines.slice(i + 1)) {
    if (/^\S/.test(line)) break;
    const frame = line.match(/frame:\s*"?([^",}\s]+\.png)"?/);
    if (!frame) continue;
    const vp = line.match(/viewport:\s*"?(\d+x\d+)"?/);
    out.push({ frame: frame[1], viewport: vp ? vp[1] : null });
  }
  return out;
}

/** Frame map: { "<screenshot name>": "<frame>" | { frames: [...], viewport } }. */
export function loadFrameMap(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map();
  for (const [name, v] of Object.entries(raw)) {
    const frames = typeof v === "string" ? [v] : Array.isArray(v) ? v : (v.frames ?? []);
    map.set(name.replace(/\.png$/i, ""), { frames, viewport: typeof v === "object" && !Array.isArray(v) ? (v.viewport ?? null) : null });
  }
  return map;
}

function listPng(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "design-review") continue; // our own output
        walk(p);
      } else if (e.name.toLowerCase().endsWith(".png")) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// ---------- design-guide checks ----------

/** Underscored enum values (keys) from packages/core/src/labels.ts, read as text. */
export function loadEnumValues(labelsFile) {
  const text = fs.readFileSync(labelsFile, "utf8");
  const set = new Set();
  for (const m of text.matchAll(/^\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*:/gm)) set.add(m[1]);
  return set;
}

export function loadBanned(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  // Covered by the dedicated checks below.
  const skip = new Set(["iso-date", "snake-case", "percent"]);
  return (data.patterns ?? [])
    .filter((p) => !skip.has(p.id))
    .map((p) => ({ id: p.id, re: new RegExp(p.regex, `${p.flags ?? ""}g`), severity: p.severity }));
}

/** Text findings: [{ check, detail }]. */
export function checkText(text, { enumValues = new Set(), banned = [] } = {}) {
  const found = [];
  const add = (check, detail) => {
    if (!found.some((f) => f.check === check && f.detail === detail)) found.push({ check, detail });
  };
  for (const m of text.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) add("ISO date", m[0]);
  for (const m of text.matchAll(/(?<![\w@./:=-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w@./-])/g)) {
    if (enumValues.has(m[0])) add("Raw enum value", m[0]);
  }
  for (const m of text.matchAll(/\d+(?:\.\d+)?\s?%/g)) add("Percentage", m[0]);
  for (const b of banned) {
    b.re.lastIndex = 0;
    for (const m of text.matchAll(b.re)) add(`Banned string (${b.id}${b.severity === "warn" ? ", warn" : ""})`, m[0].trim());
  }
  return found;
}

function parseBounds(b) {
  if (!b) return null;
  if (typeof b === "string") {
    const m = b.match(/\[?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]?\[?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]?/);
    return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null;
  }
  if (typeof b === "object") {
    if ("width" in b && "height" in b) return { w: Number(b.width), h: Number(b.height) };
    if ("left" in b && "right" in b) return { w: b.right - b.left, h: b.bottom - b.top };
    if ("x" in b && "w" in b) return { w: Number(b.w), h: Number(b.h) };
  }
  return null;
}

/**
 * Strings and small tap targets from a saved accessibility tree or DOM dump (JSON).
 * `scale` converts capture pixels to logical points when the capture is denser.
 */
export function readTree(json, scale = 1) {
  const strings = [];
  const small = [];
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const attrs = n.attributes && typeof n.attributes === "object" ? n.attributes : {};
    const own = { ...attrs, ...n };
    for (const k of ["text", "accessibilityText", "label", "hintText", "value", "title", "innerText", "content-desc"]) {
      if (typeof own[k] === "string" && own[k].trim()) strings.push(own[k]);
    }
    const tappable = own.clickable === true || own.clickable === "true" || own.focusable === true || ["button", "link", "tab", "switch"].includes(String(own.role ?? "").toLowerCase());
    const size = parseBounds(own.bounds ?? own.frame ?? own.rect);
    if (tappable && size && size.w > 0 && size.h > 0) {
      const w = size.w * scale;
      const h = size.h * scale;
      if (w < MIN_TAP_PX || h < MIN_TAP_PX) {
        const label = String(own.text || own.accessibilityText || own.label || own.id || "control").slice(0, 40);
        small.push(`${label} (${Math.round(w)}x${Math.round(h)})`);
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === "object") visit(v);
  };
  visit(json);
  return { text: strings.join("\n"), small };
}

/** Findings for one capture, from `<base>.txt` or `<base>.json` next to it. */
export function designChecks(captureFile, ctx, scale = 1) {
  const base = captureFile.replace(/\.png$/i, "");
  let text = null;
  let small = [];
  if (fs.existsSync(`${base}.json`)) {
    try {
      const t = readTree(JSON.parse(fs.readFileSync(`${base}.json`, "utf8")), scale);
      text = t.text;
      small = t.small;
    } catch {
      return { checked: false, findings: [], note: "text file unreadable" };
    }
  } else if (fs.existsSync(`${base}.txt`)) {
    text = fs.readFileSync(`${base}.txt`, "utf8");
  }
  if (text === null) return { checked: false, findings: [], note: "no text captured" };
  const findings = checkText(text, ctx);
  for (const s of small) findings.push({ check: `Tap target under ${MIN_TAP_PX}`, detail: s });
  return { checked: true, findings, note: "" };
}

// ---------- the report ----------

export function verdict(percent) {
  if (percent === null || percent === undefined) return "";
  if (percent < MATCH_BELOW) return "matches";
  if (percent <= GAP_ABOVE) return "check by eye";
  return "likely gap";
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/**
 * @param {Array} rows { screen, frame, percent|null, sideBySide|null, findings, checked, note }
 * @param {{title: string, warnings?: string[], unmapped?: string[], magick: boolean, sideBySideBase?: string}} meta
 */
export function renderReport(rows, meta) {
  const sorted = [...rows].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.screen.localeCompare(b.screen));
  const out = [`# ${meta.title}`, ""];
  out.push(
    "Advisory report (D-W11-2, D-W11-3). The score is the share of pixels that differ from the frame after the capture is fitted to the frame size (`compare -metric AE -fuzz 8%`). It is a review aid and never appears in the product. " +
      `Under ${MATCH_BELOW}% normally matches; ${MATCH_BELOW}-${GAP_ABOVE}% check by eye; over ${GAP_ABOVE}% likely a gap. How to read it: docs/runbooks/design-review.md.`,
    "",
  );
  if (!meta.magick) out.push(`**${IM_MISSING}.** Pixel scores and side-by-side images were skipped; pairing and text checks still ran.`, "");
  const withFindings = rows.filter((r) => r.findings.length).length;
  out.push(`Screens: ${rows.length} compared or paired, ${withFindings} with design-guide findings, ${(meta.unmapped ?? []).length} unmapped.`, "");
  if (rows.length) {
    out.push("| Screen | Frame | Diff | Side by side | Design-guide findings |", "|---|---|---|---|---|");
    for (const r of sorted) {
      const diff = r.percent === null || r.percent === undefined ? esc(r.note || "not compared") : `${r.percent.toFixed(1)}% (${verdict(r.percent)})${r.note ? `, ${esc(r.note)}` : ""}`;
      const side = r.sideBySide ? `\`${r.sideBySide}\`` : "none";
      const f = r.checked ? (r.findings.length ? r.findings.map((x) => `${esc(x.check)}: \`${esc(x.detail)}\``).join("<br>") : "none") : esc(r.textNote || "no text captured");
      out.push(`| ${esc(r.screen)} | ${r.frame ? `\`${r.frame}\`` : "none"} | ${diff} | ${side} | ${f} |`);
    }
    out.push("");
  }
  if (meta.unmapped?.length) {
    out.push("## Unmapped screenshots", "", "No frame was found for these. They are listed, not failed. Add a line to `scripts/qa/visual/frame-map.json` (artifact mode) or name the capture after its frame (task mode).", "");
    for (const u of meta.unmapped) out.push(`- ${u}`);
    out.push("");
  }
  if (meta.warnings?.length) {
    out.push("## Warnings", "");
    for (const w of meta.warnings) out.push(`- ${w}`);
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

// ---------- modes ----------

function context(opts) {
  return {
    enumValues: fs.existsSync(opts.labels) ? loadEnumValues(opts.labels) : new Set(),
    banned: fs.existsSync(opts.banned) ? loadBanned(opts.banned) : [],
  };
}

function processPair({ screen, captureFile, frameRel, framesDir, sideBySideFile, sideBySideShown, magick, ctx, scale, tmpRoot, extraNote }) {
  const row = { screen, frame: frameRel, percent: null, sideBySide: null, note: extraNote ?? "", findings: [], checked: false };
  const checks = designChecks(captureFile, ctx, scale);
  row.findings = checks.findings;
  row.checked = checks.checked;
  row.textNote = checks.note;
  const frameFile = path.join(framesDir, frameRel);
  if (!fs.existsSync(frameFile)) {
    row.note = `frame ${frameRel} not found`;
    return row;
  }
  if (!magick) {
    row.note = IM_MISSING;
    return row;
  }
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "cmp-"));
  try {
    const r = compareImages(frameFile, captureFile, sideBySideFile, tmp);
    row.percent = r.percent;
    row.note = [extraNote, r.note].filter(Boolean).join("; ");
    row.sideBySide = sideBySideShown;
  } catch (e) {
    row.note = `compare failed: ${e.message}`;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return row;
}

export function runTask(taskId, opts) {
  const qaDir = path.join(opts.qaDir, taskId);
  if (!fs.existsSync(qaDir)) throw new Error(`no captures folder ${qaDir}`);
  const captures = listPng(qaDir);
  const specFile = path.join(opts.specsDir, `${taskId}.md`);
  const warnings = [];
  let specFrames = [];
  if (fs.existsSync(specFile)) specFrames = parseSpecFrames(fs.readFileSync(specFile, "utf8"));
  else warnings.push(`no spec ${path.relative(REPO, specFile) || specFile}: frames chosen from the whole frame folder by name prefix`);
  if (fs.existsSync(specFile) && !specFrames.length) warnings.push(`spec ${taskId} lists no frames: frames chosen from the whole frame folder by name prefix`);
  const allFrames = fs.existsSync(opts.framesDir) ? fs.readdirSync(opts.framesDir).filter((f) => f.endsWith(".png")).map((f) => ({ frame: f, viewport: null })) : [];
  const magick = imageMagickAvailable();
  const ctx = context(opts);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "design-review-"));
  const rows = [];
  const unmapped = [];
  try {
    for (const file of captures) {
      const name = path.basename(file);
      const pick = pickFrame(name, specFrames) ?? pickFrame(name, allFrames);
      if (!pick) {
        unmapped.push(`\`${name}\`: no spec frame or frame-folder file shares its name or number prefix`);
        continue;
      }
      const { viewport } = stripCapture(name);
      const logical = viewport ? Number(viewport.split("x")[0]) : null;
      const img = magick ? safeWidth(file) : null;
      const scale = logical && img ? logical / img : 1;
      const notes = [];
      if (!pick.exact) notes.push(pick.candidates > 1 ? `paired by number prefix, ${pick.candidates} candidate frames` : "paired by number prefix");
      const base = name.replace(/\.png$/i, "");
      const relSide = path.posix.join("docs/qa", taskId, "design-review", `${base}.png`);
      rows.push(
        processPair({
          screen: name, captureFile: file, frameRel: pick.frame, framesDir: opts.framesDir, magick, ctx, scale, tmpRoot,
          sideBySideFile: path.join(qaDir, "design-review", `${base}.png`), sideBySideShown: relSide, extraNote: notes.join("; "),
        }),
      );
    }
    for (const sf of specFrames) {
      if (!rows.some((r) => r.frame === sf.frame)) warnings.push(`spec frame \`${sf.frame}\` has no capture in docs/qa/${taskId}/`);
    }
    if (!captures.length) warnings.push(`no PNG captures in docs/qa/${taskId}/`);
    const report = renderReport(rows, { title: `Design review: ${taskId}`, warnings, unmapped, magick });
    const outFile = path.join(qaDir, "design-review.md");
    fs.writeFileSync(outFile, report);
    return { outFile, rows, unmapped, warnings, magick };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export function runArtifact(dir, opts) {
  if (!fs.existsSync(dir)) throw new Error(`artifact folder ${dir} not found`);
  const map = fs.existsSync(opts.map) ? loadFrameMap(opts.map) : new Map();
  // QA1's summarize.mjs records the frame it found for each screenshot in summary.json.
  const fromSummary = new Map();
  const summaryFile = path.join(dir, "summary.json");
  if (fs.existsSync(summaryFile)) {
    try {
      for (const s of JSON.parse(fs.readFileSync(summaryFile, "utf8")).screenshots ?? []) if (s.frame) fromSummary.set(`${s.suite}/${s.name}`, s.frame);
    } catch {
      /* optional */
    }
  }
  const files = listPng(dir);
  const magick = imageMagickAvailable();
  const ctx = context(opts);
  const outDir = opts.out;
  fs.mkdirSync(outDir, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "design-review-"));
  const rows = [];
  const unmapped = [];
  const warnings = [];
  try {
    for (const file of files) {
      const rel = path.relative(dir, file).split(path.sep).join("/");
      const parts = rel.split("/");
      const suite = parts.length >= 3 && parts[0] === "screenshots" ? parts[1] : parts.length >= 2 ? parts[parts.length - 2] : "";
      const name = path.basename(file, ".png");
      const entry = map.get(name);
      let candidates = (entry?.frames ?? []).map((f) => ({ frame: f, viewport: null }));
      const summaryFrame = fromSummary.get(`${suite}/${name}`);
      if (!candidates.length && summaryFrame) candidates = [{ frame: summaryFrame, viewport: null }];
      if (!candidates.length) {
        unmapped.push(`\`${rel}\``);
        continue;
      }
      const platform = platformOf(suite) ?? null;
      let frame = candidates[0].frame;
      if (candidates.length > 1 && platform) {
        frame = candidates.find((c) => platformOf(c.frame.replace(/\.png$/, "")) === platform)?.frame ?? frame;
      }
      const logical = suite === "ios" ? 393 : suite === "mobile" ? 412 : suite === "web" ? 1440 : null;
      const img = magick ? safeWidth(file) : null;
      const scale = logical && img ? logical / img : 1;
      const safe = rel.replace(/\.png$/i, "").replace(/[^\w.-]+/g, "_");
      rows.push(
        processPair({
          screen: rel, captureFile: file, frameRel: frame, framesDir: opts.framesDir, magick, ctx, scale, tmpRoot,
          sideBySideFile: path.join(outDir, "side-by-side", `${safe}.png`), sideBySideShown: `side-by-side/${safe}.png`,
        }),
      );
    }
    if (!files.length) warnings.push("no screenshots found in the artifact");
    const report = renderReport(rows, { title: "Design review: QA screenshots", warnings, unmapped, magick });
    const outFile = path.join(outDir, "summary.md");
    fs.writeFileSync(outFile, report);
    return { outFile, rows, unmapped, warnings, magick };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// ---------- CLI ----------

export function parseArgs(argv) {
  const o = {
    task: null, artifact: null, out: "design-review",
    framesDir: path.join(REPO, "docs/design/mockups/png"),
    specsDir: path.join(REPO, "docs/specs"),
    qaDir: path.join(REPO, "docs/qa"),
    map: path.join(HERE, "frame-map.json"),
    banned: path.join(REPO, "docs/spec/banned-strings.json"),
    labels: path.join(REPO, "packages/core/src/labels.ts"),
  };
  const keys = { "--task": "task", "--artifact": "artifact", "--out": "out", "--frames-dir": "framesDir", "--specs-dir": "specsDir", "--qa-dir": "qaDir", "--map": "map", "--banned": "banned", "--labels": "labels" };
  for (let i = 0; i < argv.length; i++) {
    const k = keys[argv[i]];
    if (!k || argv[i + 1] === undefined) throw new Error(`bad argument: ${argv[i]}`);
    o[k] = argv[++i];
  }
  if (o.task && !/^[A-Za-z0-9-]+$/.test(o.task)) throw new Error("--task must be a task id such as Z11-1");
  if (Boolean(o.task) === Boolean(o.artifact)) throw new Error("give exactly one of --task <ID> or --artifact <dir>");
  return o;
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
    const res = opts.task ? runTask(opts.task, opts) : runArtifact(opts.artifact, opts);
    console.log(`design-review: ${res.rows.length} compared or paired, ${res.unmapped.length} unmapped${res.magick ? "" : `, ${IM_MISSING}`}`);
    console.log(`design-review: wrote ${res.outFile}`);
    return 0;
  } catch (e) {
    console.error(`design-review: ${e.message}`);
    console.error("usage: node scripts/qa/visual/diff.mjs --task <ID> | --artifact <dir> [--out <dir>]");
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
