// Z12-44 follow-up: the weekday logic of the workout device flows.
// Run with: node --test scripts/qa/maestro-ist-days.test.mjs
//
// apps/mobile/.maestro/device/z12-44/ist-days.js works out, from the device clock
// (IST), what Rohan Mehta's seed leaves open on each weekday and which workout each
// flow opens and finishes in each theme. Here it runs for all seven weekdays and both
// themes, because a weekday the gate does not happen to run on is where it broke
// before (Mon, Sat, Sun: Z12-44 review). Node only, no dependencies.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const flowDir = join(repoRoot, "apps/mobile/.maestro/device/z12-44");
const script = readFileSync(join(flowDir, "ist-days.js"), "utf8");

// Mon 16 Nov 2026 .. Sun 22 Nov 2026, 12:00 IST (06:30 UTC).
const DAYS = {
  Mon: Date.UTC(2026, 10, 16, 6, 30),
  Tue: Date.UTC(2026, 10, 17, 6, 30),
  Wed: Date.UTC(2026, 10, 18, 6, 30),
  Thu: Date.UTC(2026, 10, 19, 6, 30),
  Fri: Date.UTC(2026, 10, 20, 6, 30),
  Sat: Date.UTC(2026, 10, 21, 6, 30),
  Sun: Date.UTC(2026, 10, 22, 6, 30),
};

function run(utcMs, theme) {
  const output = {};
  const logs = [];
  class FakeDate extends Date {
    static now() {
      return utcMs;
    }
  }
  const context = {
    output,
    Date: FakeDate,
    console: { log: (line) => logs.push(line) },
  };
  if (theme) context.DEVICE_THEME = theme;
  vm.runInNewContext(script, context);
  return { output, logs };
}

const pass = (day, theme) => run(DAYS[day], theme).output;

// What each weekday does, worked out by hand from the seed rule (open: today, the two
// days before, and a Saturday within six days) and the flows' preferences.
//
// Fri dark banner stays "no": shouldLogWorkout completes Tue (before missFrom=Wed).
// Rohan's overlay can still DELETE Tue's execution when the seed runs before Thu's
// window closes (Fri before 07:00 IST → closed,0 = Tue), so the app may show
// "You missed Lower body A on Tue" after light finished Thu. That remaining miss
// is correct product behaviour; the flow must not blanket assertNotVisible every
// banner when fwBanner=no (it asserts fwClearedMiss instead).
const EXPECTED = {
  Mon: {
    light: { z36: "Sat 14 Nov", kind: "day", label: "Sat 14 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "" },
    dark: { z36: "", kind: "today", label: "Mon 16 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "" },
  },
  Tue: {
    light: { z36: "Sat 14 Nov", kind: "banner", label: "Mon 16 Nov", today: "To do", w01a: "yes", banner: "yes", cleared: "" },
    dark: { z36: "Sat 14 Nov", kind: "today", label: "Tue 17 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "Mon" },
  },
  Wed: {
    light: { z36: "Sat 14 Nov", kind: "banner", label: "Tue 17 Nov", today: "Rest", w01a: "no", banner: "yes", cleared: "" },
    dark: { z36: "Sat 14 Nov", kind: "banner", label: "Mon 16 Nov", today: "Rest", w01a: "no", banner: "yes", cleared: "Tue" },
  },
  Thu: {
    light: { z36: "Sat 14 Nov", kind: "banner", label: "Tue 17 Nov", today: "To do", w01a: "yes", banner: "yes", cleared: "" },
    dark: { z36: "Sat 14 Nov", kind: "today", label: "Thu 19 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "Tue" },
  },
  Fri: {
    light: { z36: "Sat 14 Nov", kind: "banner", label: "Thu 19 Nov", today: "Rest", w01a: "no", banner: "yes", cleared: "" },
    dark: { z36: "Sat 14 Nov", kind: "day", label: "Sat 14 Nov", today: "Rest", w01a: "no", banner: "no", cleared: "Thu" },
  },
  Sat: {
    light: { z36: "Thu 19 Nov", kind: "day", label: "Thu 19 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "" },
    dark: { z36: "", kind: "today", label: "Sat 21 Nov", today: "To do", w01a: "yes", banner: "no", cleared: "Thu" },
  },
  Sun: {
    light: { z36: "Sat 21 Nov", kind: "day", label: "Sat 21 Nov", today: "Rest", w01a: "no", banner: "no", cleared: "" },
    dark: { z36: "", kind: "none", label: "", today: "Rest", w01a: "no", banner: "no", cleared: "Sat" },
  },
};

for (const [day, themes] of Object.entries(EXPECTED)) {
  for (const [theme, want] of Object.entries(themes)) {
    test(`${day} ${theme}: z12-36/3 opens "${want.z36 || "nothing"}", z12-44/2 ${want.kind} ${want.label}`, () => {
      const { output, logs } = run(DAYS[day], theme);
      assert.equal(output.z36Label, want.z36);
      assert.equal(output.fwKind, want.kind);
      assert.equal(output.fwLabel, want.label);
      assert.equal(output.rohanToday, want.today);
      assert.equal(output.fwW01a, want.w01a);
      assert.equal(output.fwBanner, want.banner);
      assert.equal(output.fwClearedMiss, want.cleared);
      // Every skip is said out loud, in the output and in the Maestro log.
      assert.equal(Boolean(output.z36Skip), want.z36 === "");
      assert.equal(Boolean(output.fwSkip), want.kind === "none");
      for (const skip of [output.z36Skip, output.fwSkip].filter(Boolean)) {
        assert.ok(logs.some((line) => line.includes("SKIP") && line.includes(skip)), `skip not logged: ${skip}`);
      }
    });
  }
}

test("Fri dark: slipping model has no banner miss, but light cleared Thu for the harness assert", () => {
  const dark = pass("Fri", "dark");
  assert.equal(dark.fwBanner, "no");
  assert.equal(dark.fwClearedMiss, "Thu");
  assert.equal(dark.rohanToday, "Rest");
});

test("Tuesday and Thursday, the days with three open workouts, give both themes W-01a and a finished session", () => {
  for (const day of ["Tue", "Thu"]) {
    const light = pass(day, "light");
    const dark = pass(day, "dark");
    assert.equal(light.fwW01a, "yes", `${day} light W-01a`);
    assert.equal(dark.fwW01a, "yes", `${day} dark W-01a`);
    assert.equal(light.fwBanner, "yes", `${day} light TR-10c`);
    assert.equal(light.z36Skip + light.fwSkip + dark.z36Skip + dark.fwSkip, "");
  }
});

test("no weekday opens the same workout for two finishes, and 'today' only when it is still to do", () => {
  for (const day of Object.keys(DAYS)) {
    const light = pass(day, "light");
    const dark = pass(day, "dark");
    if (light.fwKind !== "none" && dark.fwKind !== "none") {
      assert.notEqual(light.fwLabel, dark.fwLabel, `${day}: both themes finish ${light.fwLabel}`);
    }
    for (const o of [light, dark]) {
      if (o.fwKind === "today") assert.equal(o.rohanToday, "To do");
      assert.equal(o.fwW01a === "yes", o.rohanToday === "To do");
    }
  }
});

test("today's state follows the training days (Mon, Tue, Thu, Sat) and Aarav's follows it", () => {
  const training = { Mon: true, Tue: true, Wed: false, Thu: true, Fri: false, Sat: true, Sun: false };
  for (const [day, yes] of Object.entries(training)) {
    const o = pass(day, "light");
    assert.equal(o.trainingDay, yes ? "yes" : "no", day);
    assert.equal(o.aaravToday, yes ? "Done" : "Rest", day);
  }
});

test("the labels are the strip's ('Tue 17 Nov') and use the IST date, not UTC", () => {
  // 20:00 UTC on Tue 17 Nov is 01:30 IST on Wed 18 Nov.
  const o = run(Date.UTC(2026, 10, 17, 20, 0), "light").output;
  assert.equal(o.today, "Wed 18 Nov");
  assert.equal(o.lastSat, "Sat 14 Nov");
});

test("without a DEVICE_THEME the pass is light", () => {
  assert.equal(run(DAYS.Tue).output.fwKind, "banner");
});

test("every output the flows read is set on every weekday", () => {
  const wanted = new Set();
  for (const file of readdirSync(flowDir).filter((f) => f.endsWith(".yaml"))) {
    const text = readFileSync(join(flowDir, file), "utf8");
    for (const m of text.matchAll(/output\.(\w+)/g)) wanted.add(m[1]);
  }
  const trainee36 = readFileSync(join(flowDir, "../z12-36/3-trainee-workout.yaml"), "utf8");
  for (const m of trainee36.matchAll(/output\.(\w+)/g)) wanted.add(m[1]);
  for (const day of Object.keys(DAYS)) {
    for (const theme of ["light", "dark"]) {
      const o = pass(day, theme);
      for (const name of wanted) {
        assert.ok(name in o, `${day} ${theme}: output.${name} is not set by ist-days.js`);
        assert.equal(typeof o[name], "string");
      }
    }
  }
});

test("the seed still leaves the workouts the plan assumes open", () => {
  // ist-days.js replays history.ts's slipping rule; when the rule moves, so must it.
  const history = readFileSync(join(repoRoot, "apps/api/src/seed/demo/history.ts"), "utf8");
  assert.match(history, /missFrom = addDaysFromLocalDate\(refDate, -2\)/);
  assert.match(history, /dow === 6 && localDate >= addDaysFromLocalDate\(refDate, -6\)/);
  assert.match(history, /if \(localDate >= missFrom\) return false;/);
});
