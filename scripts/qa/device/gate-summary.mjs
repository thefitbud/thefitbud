#!/usr/bin/env node
// Builds one platform's device-gate verdict from what run-gate.sh wrote (Z12-35).
//
//   node scripts/qa/device/gate-summary.mjs --dir <$DEVICE_RESULTS/<platform>> --platform ios|android
//
// Reads, under --dir:
//   <theme>/junit.xml          Maestro's report per theme (missing = the run died)
//   <theme>/maestro-exit       Maestro's exit code per theme
//   scan.json                  scan-logs.mjs
//   extras/*.json              push, lock-screen and offline evidence (optional)
//   flows.txt                  the flow files that were selected
// Writes summary.json and summary.md next to them and exits 1 when the gate fails:
//   * any Maestro flow failed, or a theme has no report, or Maestro exited non-zero;
//   * the device-log scan failed (crash, red box, LogBox, JS console.error/warn, React
//     warning, or a log that never showed the app starting).
// Extras are evidence, reported but not part of the verdict: each task names the push,
// lock-screen or offline outcome it needs (prompt §3 item 5).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJUnit } from "../summarize.mjs";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * One theme's Maestro result: junit.xml, or junit-01.xml, junit-02.xml ... when the
 * flows ran one at a time (a device-offline flow was selected). With one report per
 * flow, `expectedReports` (the number of selected flows) catches a flow whose run
 * died before it wrote one.
 */
export function themeResult(dir, theme, expectedReports = null) {
  const themeDir = path.join(dir, theme);
  const exitFile = path.join(themeDir, "maestro-exit");
  const exit = fs.existsSync(exitFile) ? Number(fs.readFileSync(exitFile, "utf8").trim()) : null;
  const r = { theme, maestroExit: exit, total: 0, passed: 0, failed: 0, failures: [], error: null };
  const reports = fs.existsSync(themeDir)
    ? fs.readdirSync(themeDir).filter((f) => /^junit(-\d+)?\.xml$/.test(f)).sort()
    : [];
  if (reports.length === 0) {
    r.error = "no JUnit report (Maestro did not finish)";
    return r;
  }
  const perFlow = reports.some((f) => f !== "junit.xml");
  if (perFlow && expectedReports !== null && reports.length < expectedReports) {
    r.error = `${expectedReports - reports.length} of ${expectedReports} flows wrote no JUnit report`;
  }
  for (const report of reports) {
    try {
      const { cases } = parseJUnit(fs.readFileSync(path.join(themeDir, report), "utf8"), `${theme}/${report}`);
      r.total += cases.length;
      for (const c of cases) {
        if (c.status === "fail") {
          r.failed++;
          r.failures.push({ flow: c.name, message: c.message.split("\n")[0].slice(0, 300) });
        } else if (c.status === "pass") r.passed++;
      }
    } catch (err) {
      r.error = r.error ? `${r.error}; ${err.message}` : err.message;
    }
  }
  return r;
}

export function buildGateSummary({ dir, platform }) {
  const themes = fs
    .readdirSync(dir)
    .filter((d) => ["light", "dark"].includes(d) && fs.statSync(path.join(dir, d)).isDirectory())
    .sort((a, b) => (a === "light" ? -1 : b === "light" ? 1 : 0));
  const flowsFile = path.join(dir, "flows.txt");
  const flows = fs.existsSync(flowsFile)
    ? fs.readFileSync(flowsFile, "utf8").split("\n").filter(Boolean).map((f) => f.replace(/^.*apps\/mobile\/\.maestro\//, ""))
    : [];
  const results = themes.map((t) => themeResult(dir, t, flows.length || null));
  const scan = readJson(path.join(dir, "scan.json"));
  const extrasDir = path.join(dir, "extras");
  const extras = fs.existsSync(extrasDir)
    ? fs.readdirSync(extrasDir).filter((f) => f.endsWith(".json")).sort().map((f) => ({ file: f, ...readJson(path.join(extrasDir, f)) }))
    : [];

  const reasons = [];
  if (results.length === 0) reasons.push("no theme ran");
  for (const r of results) {
    if (r.error) reasons.push(`${r.theme}: ${r.error}`);
    if (r.failed) reasons.push(`${r.theme}: ${r.failed} of ${r.total} flows failed`);
    if (!r.error && !r.failed && r.maestroExit !== 0) reasons.push(`${r.theme}: Maestro exited ${r.maestroExit}`);
  }
  if (!scan) reasons.push("no device-log scan");
  else if (scan.status !== "pass") {
    reasons.push(`device log: ${Object.entries(scan.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
  return { platform, status: reasons.length ? "fail" : "pass", reasons, flows, themes: results, scan, extras };
}

export function toMarkdown(s) {
  const out = [`### Device gate · ${s.platform} · ${s.status === "pass" ? "PASS" : "FAIL"}`, ""];
  if (s.reasons.length) out.push(...s.reasons.map((r) => `- ${r}`), "");
  out.push(`Flows (${s.flows.length}): ${s.flows.map((f) => `\`${f}\``).join(", ") || "none"}`, "");
  out.push("| theme | flows | passed | failed | Maestro exit |", "|---|---|---|---|---|");
  for (const t of s.themes) out.push(`| ${t.theme} | ${t.total} | ${t.passed} | ${t.failed} | ${t.maestroExit ?? "—"} |`);
  const failures = s.themes.flatMap((t) => t.failures.map((f) => `- ${t.theme} · ${f.flow}: ${f.message}`));
  if (failures.length) out.push("", "<details><summary>Failed flows</summary>", "", ...failures, "", "</details>");
  if (s.scan) {
    const counts = Object.entries(s.scan.counts).map(([k, n]) => `${k}: ${n}`).join(" · ");
    out.push("", `**Device log:** ${s.scan.status === "pass" ? "clean" : `FAILED (${counts})`}${s.scan.allowed?.length ? ` · ${s.scan.allowed.length} allowed by allowlist.json` : ""}`);
    if (s.scan.findings?.length) {
      out.push("", "<details><summary>First log findings</summary>", "", "```");
      for (const f of s.scan.findings.slice(0, 20)) out.push(`[${f.kind}] ${f.file}:${f.line} ${f.text}`);
      out.push("```", "</details>");
    }
  }
  if (s.extras.length) {
    out.push("", "**Evidence (not part of the verdict):**", "");
    for (const e of s.extras) {
      const what = e.method ? `${e.method}` : e.outcome ? `${e.outcome}` : e.result ?? "";
      out.push(`- ${e.file.replace(/\.json$/, "")}: ${what}${e.note ? ` — ${e.note}` : ""}`);
    }
  }
  return `${out.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "--platform") args[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.dir || !["ios", "android"].includes(args.platform)) throw new Error("--dir and --platform ios|android are required");
  return args;
}

export function main(argv) {
  const args = parseArgs(argv);
  const s = buildGateSummary(args);
  fs.writeFileSync(path.join(args.dir, "summary.json"), `${JSON.stringify(s, null, 2)}\n`);
  const md = toMarkdown(s);
  fs.writeFileSync(path.join(args.dir, "summary.md"), md);
  process.stdout.write(md);
  return s.status === "pass" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`gate-summary: ${err.message}`);
    process.exitCode = 2;
  }
}
