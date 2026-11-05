// Z5-24 (W4 gap G22): the android and ios suites QUEUE for their staging QA accounts
// instead of evicting each other.
//
// Two halves. The first pins the concurrency wiring in .github/workflows/qa.yml: the
// `queue-<suite>` jobs, their per-pull-request groups, the seed and suite jobs waiting
// for them, and the `qa-staging-<suite>` backstop groups that must never cancel a
// running job. The second runs the queue script itself (copied out of qa.yml, exactly
// as the runner gets it) against a fake GitHub Actions API, and checks it waits for an
// older run, passes a newer one, and never treats an error as a clear queue.
//
// Node built-ins only, and qa.yml is read as text (like apps/api/scripts/
// qa-seed-suites.test.ts), so this runs in the qa-scripts job, which has no
// `pnpm install`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const qaYml = path.join(here, "..", "..", ".github", "workflows", "qa.yml");
const source = fs.readFileSync(qaYml, "utf8");
const SUITES = ["android", "ios"];

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

function concurrencyOf(job) {
  const block = job.match(/^ {4}concurrency:\n {6}group: (.+)\n {6}cancel-in-progress: (.+)$/m);
  return block ? { group: block[1], cancel: block[2] } : null;
}

function queueScript(suite) {
  const job = jobs.get(`queue-${suite}`);
  const start = job.indexOf("node --input-type=module <<'QA_QUEUE_JS'\n");
  const end = job.indexOf("\n          QA_QUEUE_JS\n");
  assert.ok(start > 0 && end > start, `queue-${suite} carries the QA_QUEUE_JS heredoc`);
  return job
    .slice(job.indexOf("\n", start) + 1, end)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

// ---------------------------------------------------------------- qa.yml wiring

test("each Maestro suite has a queue job, before its seed and its suite job", () => {
  for (const suite of SUITES) {
    const queue = jobs.get(`queue-${suite}`);
    assert.ok(queue, `queue-${suite} exists`);
    assert.deepEqual(needsOf(queue), ["changes"]);
    assert.match(queue, new RegExp(`^ {10}QA_QUEUE_SUITE: ${suite}$`, "m"));
    // Runs exactly when the suite runs: the nightly/dispatch branch and the mobile PR branch.
    assert.ok(queue.includes(`needs.changes.outputs.suites == '${suite}'`), `queue-${suite} gate names its suite`);
    assert.ok(queue.includes("(github.event_name == 'pull_request' && needs.changes.outputs.mobile == 'true')"));
    assert.ok(needsOf(jobs.get(`seed-${suite}`)).includes(`queue-${suite}`), `seed-${suite} needs queue-${suite}`);
    const suiteJob = jobs.get(suite);
    assert.ok(needsOf(suiteJob).includes(`queue-${suite}`), `${suite} needs queue-${suite}`);
    // `always()` in the suite gate would otherwise run the suite after a failed or
    // superseded queue job, i.e. without its turn.
    assert.ok(suiteJob.includes(`&& needs.queue-${suite}.result == 'success'`), `${suite} requires its queue job's success`);
  }
});

test("the queue job holds no write scope and no checkout", () => {
  for (const suite of SUITES) {
    const queue = jobs.get(`queue-${suite}`);
    assert.match(queue, /^ {4}permissions:\n {6}actions: read\n {4}#/m);
    assert.equal((queue.match(/^ {6}[a-z-]+: (read|write)$/gm) ?? []).length, 1, "exactly one scope");
    assert.ok(!queue.includes("actions/checkout"), "no checkout");
  }
  // The workflow default stays read-only contents.
  assert.match(source, /^permissions:\n {2}contents: read\n/m);
});

test("a PR update supersedes only that PR's own waiting run, never another PR's", () => {
  for (const suite of SUITES) {
    const c = concurrencyOf(jobs.get(`queue-${suite}`));
    assert.ok(c, `queue-${suite} has a concurrency block`);
    // Per pull request on pull_request events, per run otherwise: no shared group that
    // a third arrival could evict another PR's or main's place from.
    assert.equal(
      c.group,
      `\${{ github.event_name == 'pull_request' && format('qa-queue-${suite}-pr-{0}', github.event.pull_request.number) || format('qa-queue-${suite}-run-{0}', github.run_id) }}`,
    );
    assert.equal(c.cancel, "${{ github.event_name == 'pull_request' }}");
  }
});

test("the qa-staging-<suite> backstop groups never cancel a running job", () => {
  for (const [name, job] of jobs) {
    const c = concurrencyOf(job);
    if (!c) continue;
    if (c.group.startsWith("qa-staging")) {
      assert.equal(c.cancel, "false", `${name} keeps cancel-in-progress: false`);
    } else {
      // Any other group must be per-PR or per-run, never a constant shared by runs.
      assert.ok(c.group.includes("github.event.pull_request.number") && c.group.includes("github.run_id"), `${name}: ${c.group}`);
    }
  }
  for (const suite of SUITES) {
    for (const name of [`seed-${suite}`, suite]) {
      assert.deepEqual(concurrencyOf(jobs.get(name)), { group: `qa-staging-${suite}`, cancel: "false" }, name);
    }
  }
  // A workflow-level group would drag the required qa-scripts check into a queue.
  assert.doesNotMatch(source, /^concurrency:/m);
});

test("the report says in the run summary how android and ios took their turn", () => {
  const report = jobs.get("report");
  for (const suite of SUITES) assert.ok(needsOf(report).includes(`queue-${suite}`), `report needs queue-${suite}`);
  const step = report.slice(report.indexOf("      - name: Staging queue\n"));
  assert.ok(step.length > 0 && report.includes("      - name: Staging queue\n"));
  const body = step.slice(0, step.indexOf("\n      - name:", 1));
  assert.match(body, /^ {8}if: always\(\)$/m);
  assert.ok(body.includes('} >> "$GITHUB_STEP_SUMMARY"'));
  assert.ok(body.includes("queue, not evict"));
  assert.ok(body.includes("for suite in android ios; do"));
  for (const result of ["success)", "skipped)", "cancelled)", "failure)"]) assert.ok(body.includes(result), result);
  // The eviction step leaves queue jobs to this step rather than calling them evicted.
  assert.ok(report.includes('case "$job" in queue-*) continue ;; esac'));
});

test("the header no longer says the run's conclusion is untouched (report exits 3 on partial)", () => {
  const header = source.slice(0, source.indexOf("\nname: QA\n"));
  assert.ok(!header.includes("conclusion is untouched"));
  assert.ok(header.includes("QUEUE, NOT EVICT"));
  assert.ok(header.includes("exits 3"));
});

test("queue-android and queue-ios run the same script", () => {
  assert.equal(queueScript("android"), queueScript("ios"));
  const timeout = Number(jobs.get("queue-android").match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  const max = Number(jobs.get("queue-android").match(/QA_QUEUE_MAX_MINUTES: "(\d+)"/)[1]);
  // The script must give up, and say why, before the runner kills the job.
  assert.ok(max < timeout, `${max} < ${timeout}`);
  assert.ok(timeout <= 360, "within the 6-hour job limit");
});

// ------------------------------------------------------- the queue script itself

const T0 = Date.parse("2026-11-05T10:00:00Z");
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();
const SELF = 500;

function job(name, status, startedSeconds, id, conclusion = null) {
  return { id, name, status, conclusion, started_at: startedSeconds == null ? null : at(startedSeconds) };
}

// state.runs: id -> run; state.jobs: id -> job list. `hook(path, url)` may return
// { status, headers } to inject an error, or mutate state before the answer.
async function fakeApi(state, hook = () => null) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    calls.push(url.pathname + url.search);
    const injected = hook(url.pathname, url);
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (injected) return send(injected.status, { message: "injected" }, injected.headers);
    if (req.headers.authorization !== "Bearer test-token") return send(401, { message: "no token" });
    let m;
    if ((m = url.pathname.match(/^\/repos\/o\/r\/actions\/runs\/(\d+)\/jobs$/))) {
      assert.equal(url.searchParams.get("filter"), "latest");
      return send(200, { jobs: state.jobs[m[1]] ?? [] });
    }
    if ((m = url.pathname.match(/^\/repos\/o\/r\/actions\/runs\/(\d+)$/))) {
      const run = state.runs[m[1]];
      return run ? send(200, run) : send(404, { message: "Not Found" });
    }
    if ((m = url.pathname.match(/^\/repos\/o\/r\/actions\/workflows\/77\/runs$/))) {
      const status = url.searchParams.get("status");
      return send(200, { workflow_runs: Object.values(state.runs).filter((run) => run.status === status) });
    }
    return send(404, { message: "Not Found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() };
}

function run(id, status, extra = {}) {
  return { id, run_number: id, status, event: "pull_request", workflow_id: 77, pull_requests: [{ number: id - 400 }], ...extra };
}

// The self run: its own queue job started at T0.
function baseState(suite = "android") {
  return {
    runs: { [SELF]: run(SELF, "in_progress") },
    jobs: { [SELF]: [job("changes", "completed", -30, 5000, "success"), job(`queue-${suite}`, "in_progress", 0, 5001)] },
  };
}

async function runQueue(state, { suite = "android", hook, maxMinutes = 0.02, poll = 0.02 } = {}) {
  const api = await fakeApi(state, hook);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-queue-"));
  const script = path.join(dir, "queue.mjs");
  const summaryFile = path.join(dir, "summary.md");
  fs.writeFileSync(script, queueScript(suite));
  const env = {
    PATH: process.env.PATH,
    GITHUB_API_URL: api.url,
    GITHUB_REPOSITORY: "o/r",
    GITHUB_RUN_ID: String(SELF),
    GITHUB_STEP_SUMMARY: summaryFile,
    GH_TOKEN: "test-token",
    QA_QUEUE_SUITE: suite,
    QA_QUEUE_POLL_SECONDS: String(poll),
    QA_QUEUE_SETTLE_SECONDS: "0",
    QA_QUEUE_MAX_MINUTES: String(maxMinutes),
  };
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], { env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (out += chunk));
      const kill = setTimeout(() => child.kill("SIGKILL"), 20000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(kill);
        const summary = fs.existsSync(summaryFile) ? fs.readFileSync(summaryFile, "utf8") : "";
        resolve({ code, out, summary, calls: api.calls });
      });
    });
  } finally {
    api.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("queue: nothing ahead, so it passes at once and says so in the summary", async () => {
  const result = await runQueue(baseState());
  assert.equal(result.code, 0, result.out);
  assert.match(result.summary, /### android staging queue/);
  assert.match(result.summary, /No earlier run held the android suite's QA accounts/);
  assert.match(result.summary, /never cancels an older run's android job/);
});

test("queue: waits for an older run's android job, then passes and names it", async () => {
  const state = baseState();
  state.runs[490] = run(490, "in_progress");
  state.jobs[490] = [job("queue-android", "completed", -600, 4001, "success"), job("android", "in_progress", -590, 4002)];
  let polls = 0;
  const result = await runQueue(state, {
    maxMinutes: 0.2,
    hook: (pathname) => {
      if (pathname.endsWith("/runs/490/jobs") && ++polls === 3) state.jobs[490][1] = job("android", "completed", -590, 4002, "failure");
      return null;
    },
  });
  assert.equal(result.code, 0, result.out);
  assert.ok(polls >= 3, `polled the holder ${polls} times`);
  assert.match(result.out, /Waiting \(\d+ min so far\) for run #490 \(PR #90\) to finish its android job/);
  assert.match(result.summary, /Waited \d+ min for run #490 \(PR #90\) to finish its android job/);
});

test("queue: an older run counts while its seed runs and its android job has not started", async () => {
  const state = baseState();
  state.runs[480] = run(480, "in_progress", { event: "schedule", pull_requests: [] });
  state.jobs[480] = [job("queue-android", "completed", -60, 3001, "success"), job("seed-android", "in_progress", -50, 3002)];
  const result = await runQueue(state);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /::error title=Staging queue timed out::.*run #480 \(schedule\)/);
  assert.match(result.summary, /Gave up after \d+ min waiting for run #480 \(schedule\)\. The android suite did not run/);
});

test("queue: a newer run, or one whose queue job has not started, does not hold us", async () => {
  const state = baseState();
  state.runs[510] = run(510, "in_progress");
  state.jobs[510] = [job("queue-android", "completed", 5, 6001, "success"), job("android", "in_progress", 8, 6002)];
  state.runs[505] = run(505, "queued");
  state.jobs[505] = [job("queue-android", "queued", -100, 5501)];
  state.runs[470] = run(470, "in_progress");
  state.jobs[470] = [job("queue-android", "completed", -900, 2001, "skipped"), job("android", "queued", null, 2002)];
  const result = await runQueue(state);
  assert.equal(result.code, 0, result.out);
  assert.match(result.summary, /No earlier run held/);
});

test("queue: same start second, the lower job id goes first", async () => {
  const ahead = baseState();
  ahead.runs[499] = run(499, "in_progress");
  ahead.jobs[499] = [job("queue-android", "completed", 0, 5000, "success"), job("android", "in_progress", 1, 5002)];
  assert.equal((await runQueue(ahead)).code, 1, "job 5000 started the same second as ours (5001): we wait");
  const behind = baseState();
  behind.runs[499] = run(499, "in_progress");
  behind.jobs[499] = [job("queue-android", "completed", 0, 5009, "success"), job("android", "in_progress", 1, 5010)];
  assert.equal((await runQueue(behind)).code, 0, "job 5009 is behind ours (5001): we pass");
});

test("queue: an older run that completes, or is re-run (back of the queue), stops holding us", async () => {
  const state = baseState();
  state.runs[460] = run(460, "in_progress");
  state.jobs[460] = [job("queue-android", "completed", -300, 1001, "success"), job("android", "in_progress", -290, 1002)];
  state.runs[461] = run(461, "in_progress");
  state.jobs[461] = [job("queue-android", "completed", -200, 1101, "success"), job("android", "in_progress", -190, 1102)];
  let n = 0;
  const result = await runQueue(state, {
    maxMinutes: 0.2,
    hook: (pathname) => {
      if (pathname === "/repos/o/r/actions/runs/460" && ++n === 2) state.runs[460].status = "completed";
      if (pathname === "/repos/o/r/actions/runs/461" && n >= 2) {
        // Re-run: the latest attempt's queue job started after ours.
        state.jobs[461] = [job("queue-android", "in_progress", 30, 7001)];
      }
      return null;
    },
  });
  assert.equal(result.code, 0, result.out);
  assert.match(result.summary, /run #460 \(PR #60\), run #461 \(PR #61\)/);
});

test("queue: a run holding android does not hold ios", async () => {
  const state = baseState("ios");
  state.runs[490] = run(490, "in_progress");
  state.jobs[490] = [
    job("queue-android", "completed", -600, 4001, "success"),
    job("android", "in_progress", -590, 4002),
    job("queue-ios", "completed", -600, 4003, "skipped"),
    job("ios", "completed", -600, 4004, "skipped"),
  ];
  const result = await runQueue(state, { suite: "ios" });
  assert.equal(result.code, 0, result.out);
  assert.match(result.summary, /### ios staging queue/);
});

test("queue: an unreadable queue never counts as clear", async () => {
  // Server errors, then a rate limit: keep waiting, then time out, never pass.
  const result = await runQueue(baseState(), {
    hook: (pathname) => (pathname.includes("/workflows/") ? { status: 502 } : null),
  });
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /::warning title=Staging queue unreadable::the GitHub API answered 502/);
  assert.match(result.out, /::error title=Staging queue timed out::.*a queue it could not read/);

  const limited = await runQueue(baseState(), {
    hook: (pathname) => (pathname.includes("/workflows/") ? { status: 403, headers: { "x-ratelimit-remaining": "0" } } : null),
  });
  assert.equal(limited.code, 1, limited.out);
  assert.match(limited.out, /Staging queue unreadable::the GitHub API answered 403/);

  // A transient error, then a clear answer: passes only after the clear answer.
  let failures = 2;
  const recovered = await runQueue(baseState(), {
    maxMinutes: 0.2,
    hook: (pathname) => (pathname.includes("/workflows/") && failures-- > 0 ? { status: 500 } : null),
  });
  assert.equal(recovered.code, 0, recovered.out);
  assert.equal((recovered.out.match(/Staging queue unreadable/g) ?? []).length, 2);
});

test("queue: a permission error fails at once rather than waiting", async () => {
  const result = await runQueue(baseState(), {
    maxMinutes: 1,
    hook: (pathname) => (pathname.includes("/workflows/") ? { status: 403 } : null),
  });
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /::error title=Staging queue failed::the GitHub API answered 403/);
  assert.match(result.summary, /Could not read the queue/);
});
