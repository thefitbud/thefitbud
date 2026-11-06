// Z5-7b: the QA seed jobs in .github/workflows/qa.yml never run two D1 imports at once.
//
// A D1 database accepts one `wrangler d1 execute --remote --file` import at a time; a
// second is refused with "Currently processing a long-running import" (run 42079586761,
// where seed-ios lost that race to the three other seeds). Two halves:
//
//   * Wiring: the four seed jobs form one chain, seed-api -> seed-web -> seed-android ->
//     seed-ios, and each later link runs whatever the earlier one's result was (only a
//     cancelled run stops it), while keeping every gate of its own.
//   * Behaviour: the retry around the imports, copied out of qa.yml exactly as the runner
//     gets it, run against a fake `pnpm` (standing in for wrangler) and a fake `sleep`.
//     It retries only on that exact message, a bounded number of times.
//
// Node built-ins only, and qa.yml is read as text (like staging-queue.test.mjs), so this
// runs in the qa-scripts job, which has no `pnpm install`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const qaYml = path.join(here, "..", "..", ".github", "workflows", "qa.yml");
const source = fs.readFileSync(qaYml, "utf8");

const CHAIN = ["seed-api", "seed-web", "seed-android", "seed-ios"];
const BUSY = "Currently processing a long-running import";

function workflowJobs() {
  const body = source.slice(source.indexOf("\njobs:\n"));
  const jobs = new Map();
  const matches = [...body.matchAll(/^ {2}([a-z0-9-]+):\n/gm)];
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    jobs.set(match[1], body.slice(match.index, end));
  });
  return jobs;
}
const jobs = workflowJobs();

function needsOf(job) {
  const inline = job.match(/^ {4}needs: \[([^\]]*)\]$/m);
  if (inline) return inline[1].split(",").map((name) => name.trim());
  const single = job.match(/^ {4}needs: ([a-z0-9-]+)$/m);
  return single ? [single[1]] : [];
}

function gateOf(job) {
  const gate = job.match(/^ {4}if: >-\n([\s\S]*?\}\})$/m);
  assert.ok(gate, "seed job has a folded `if: >-` gate");
  return gate[1].replace(/\s+/g, " ").trim();
}

/** The body of the step that applies the reset and the seed, de-indented as the runner gets it. */
function applyStep(name) {
  const job = jobs.get(name);
  const suite = name.replace(/^seed-/, "");
  const header = `      - name: Apply the ${suite} suite's reset, then its seed, to fitbud-staging\n`;
  const start = job.indexOf(header);
  assert.ok(start > 0, `${name} has its apply step`);
  const step = job.slice(start + header.length);
  const runAt = step.indexOf("        run: |\n");
  assert.ok(runAt >= 0, `${name} apply step has a run block`);
  const lines = [];
  for (const line of step.slice(runAt + "        run: |\n".length).split("\n")) {
    if (line.length > 0 && !line.startsWith("          ")) break;
    lines.push(line.slice(10));
  }
  return lines.join("\n").trimEnd() + "\n";
}

function retrySnippet(name) {
  const body = applyStep(name);
  const start = body.indexOf("# BEGIN d1-import-retry");
  const end = body.indexOf("# END d1-import-retry");
  assert.ok(start >= 0 && end > start, `${name} carries the d1-import-retry block`);
  return body.slice(start, end);
}

// ---------------------------------------------------------------- qa.yml wiring

test("the seed jobs form one chain, api -> web -> android -> ios", () => {
  for (const name of CHAIN) assert.ok(jobs.get(name), `${name} exists`);
  assert.deepEqual(needsOf(jobs.get("seed-api")), ["changes"]);
  for (let i = 1; i < CHAIN.length; i++) {
    const needs = needsOf(jobs.get(CHAIN[i]));
    assert.ok(needs.includes(CHAIN[i - 1]), `${CHAIN[i]} needs ${CHAIN[i - 1]}`);
    // Exactly one predecessor among the seeds: the chain, not a fan-in.
    assert.deepEqual(
      needs.filter((need) => need.startsWith("seed-")),
      [CHAIN[i - 1]],
      `${CHAIN[i]}'s seed needs`,
    );
  }
  // Z5-24 wiring stays: each mobile seed still waits for its own queue job.
  assert.ok(needsOf(jobs.get("seed-android")).includes("queue-android"));
  assert.ok(needsOf(jobs.get("seed-ios")).includes("queue-ios"));
  // report still waits for every seed.
  const reportNeeds = needsOf(jobs.get("report"));
  for (const name of CHAIN) assert.ok(reportNeeds.includes(name), `report needs ${name}`);
});

test("a skipped, failed or cancelled earlier seed never blocks a later suite's seed", () => {
  for (const name of CHAIN.slice(1)) {
    const gate = gateOf(jobs.get(name));
    // !cancelled(), not the implicit success() (which a skipped or failed predecessor
    // fails) and not always() (which would also run after the run was cancelled).
    assert.ok(gate.startsWith("${{ !cancelled() && needs.changes.result == 'success'"), `${name}: ${gate}`);
    assert.doesNotMatch(gate, /\balways\(\)|\bsuccess\(\)|\bfailure\(\)/, name);
    // Nothing in the gate looks at an earlier seed's result.
    assert.doesNotMatch(gate, /needs\.seed-/, name);
  }
  // seed-api has no predecessor and keeps the default gate.
  assert.doesNotMatch(gateOf(jobs.get("seed-api")), /cancelled\(\)|always\(\)/);
});

test("every seed keeps its own gates inside the chain", () => {
  for (const name of CHAIN) {
    const suite = name.replace(/^seed-/, "");
    const job = jobs.get(name);
    const gate = gateOf(job);
    assert.ok(gate.includes("github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"), name);
    assert.ok(gate.includes("needs.changes.outputs.staging == 'true'"), name);
    assert.ok(gate.includes(`needs.changes.outputs.suites == '${suite}'`), name);
    assert.match(job, /^ {4}environment: staging-qa$/m, name);
    assert.match(job, new RegExp(`^ {6}group: qa-staging-${suite}\\n {6}cancel-in-progress: false$`, "m"), name);
  }
  for (const suite of ["android", "ios"]) {
    const gate = gateOf(jobs.get(`seed-${suite}`));
    // Dropping success() must not let a seed run without its queue turn.
    assert.ok(gate.includes(`needs.queue-${suite}.result == 'success'`), `seed-${suite} requires its queue's success`);
    assert.ok(gate.includes(`&& needs.queue-${suite}.outputs.attempt == format('{0}', github.run_attempt)`), `seed-${suite} attempt gate`);
  }
});

test("every D1 import in qa.yml goes through the same retry, reset before seed", () => {
  const snippet = retrySnippet("seed-api");
  for (const name of CHAIN) {
    assert.equal(retrySnippet(name), snippet, `${name}'s retry block matches seed-api's`);
    const body = applyStep(name);
    const reset = body.indexOf('d1_execute --file ".qa-seed/$QA_SEED_SUITE/qa-reset.sql"');
    const seed = body.indexOf('d1_execute --file ".qa-seed/$QA_SEED_SUITE/qa-seed.sql"');
    assert.ok(reset > body.indexOf("# END d1-import-retry") && seed > reset, `${name}: reset, then seed`);
  }
  // No import outside the retry: exactly one `d1 execute` per seed job, the snippet's.
  const imports = source.match(/^(?! *#).*wrangler d1 execute/gm) ?? [];
  assert.equal(imports.length, CHAIN.length);
});

// ---------------------------------------------------------------- retry behaviour

/**
 * Runs `script` the way a `run:` step runs (bash --noprofile --norc -eo pipefail) with a
 * fake `pnpm` that fails the first `failTimes` calls with `failMessage` and exit code
 * `failCode`, then succeeds, and a fake `sleep` that only records its argument.
 */
function runWithFakes(script, { failTimes, failMessage, failCode = 1, failOn = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-serial-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const calls = path.join(dir, "calls.log");
  const sleeps = path.join(dir, "sleeps.log");
  fs.writeFileSync(
    path.join(bin, "pnpm"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
n=$(wc -l < "${calls}")
if [ -n "$FAKE_FAIL_ON" ] && [[ "$*" != *"$FAKE_FAIL_ON"* ]]; then echo "fake ok"; exit 0; fi
if [ "$n" -le "$FAKE_FAIL_TIMES" ]; then
  echo "✘ [ERROR] $FAKE_FAIL_MESSAGE" >&2
  exit "$FAKE_FAIL_CODE"
fi
echo "fake ok"
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(bin, "sleep"), `#!/usr/bin/env bash\nprintf '%s\\n' "$1" >> "${sleeps}"\n`, { mode: 0o755 });
  const file = path.join(dir, "step.sh");
  fs.writeFileSync(file, script);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", file], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      QA_SEED_SUITE: "ios",
      FAKE_FAIL_TIMES: String(failTimes),
      FAKE_FAIL_MESSAGE: failMessage,
      FAKE_FAIL_CODE: String(failCode),
      FAKE_FAIL_ON: failOn ?? "",
    },
  });
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter(Boolean) : []);
  const out = { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: read(calls), sleeps: read(sleeps) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const BUSY_LINE = `${BUSY}. Cannot start another import until that completes or times out.`;
const oneImport = () => `${retrySnippet("seed-ios")}\nd1_execute --file x.sql\n`;

test("retries an import refused because another is running, with backoff, then succeeds", () => {
  const run = runWithFakes(oneImport(), { failTimes: 2, failMessage: BUSY_LINE });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(run.calls.length, 3);
  for (const call of run.calls) {
    assert.equal(call, "--filter @fitbud/api exec wrangler d1 execute fitbud-staging --env staging --remote --yes --file x.sql");
  }
  assert.deepEqual(run.sleeps, ["15", "30"]);
  assert.match(run.stdout, /::warning title=D1 import busy::.*attempt 1 of 6/);
  assert.match(run.stdout, /fake ok/);
});

test("does not retry any other wrangler error, and keeps its exit code", () => {
  const run = runWithFakes(oneImport(), { failTimes: 1, failMessage: "SQLITE_TOOBIG: string or blob too big", failCode: 7 });
  assert.equal(run.status, 7);
  assert.equal(run.calls.length, 1);
  assert.deepEqual(run.sleeps, []);
  // The error stays visible in the log.
  assert.match(run.stdout, /SQLITE_TOOBIG/);
});

test("gives up after 6 attempts when the other import never finishes", () => {
  const run = runWithFakes(oneImport(), { failTimes: 100, failMessage: BUSY_LINE });
  assert.notEqual(run.status, 0);
  assert.equal(run.calls.length, 6);
  assert.deepEqual(run.sleeps, ["15", "30", "60", "120", "240"]);
  assert.match(run.stdout, /::error title=D1 import still busy::/);
});

test("the whole apply step imports the reset then the seed, and stops at a failed reset", () => {
  const step = applyStep("seed-ios");
  const ok = runWithFakes(step, { failTimes: 1, failMessage: BUSY_LINE });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.deepEqual(
    ok.calls.map((call) => call.split(" --file ")[1]),
    [".qa-seed/ios/qa-reset.sql", ".qa-seed/ios/qa-reset.sql", ".qa-seed/ios/qa-seed.sql"],
  );
  const broken = runWithFakes(step, { failTimes: 1, failMessage: "Authentication error [code: 10000]", failOn: "qa-reset.sql" });
  assert.notEqual(broken.status, 0);
  assert.deepEqual(broken.calls.map((call) => call.split(" --file ")[1]), [".qa-seed/ios/qa-reset.sql"]);
});
