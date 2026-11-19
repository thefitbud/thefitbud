// Z12-44 follow-up: what the local demo seed and the device gate's own flows leave
// on the Workout tab, for each weekday in Asia/Kolkata (the demo trainees' timezone),
// from the device clock. Run by ist-days.yaml. A pure script: the node test
// scripts/qa/maestro-ist-days.test.mjs runs it for all seven weekdays and both
// themes, so keep it ES5 (Maestro's JS engine) and free of imports.
//
// The seed (apps/api/src/seed/demo/history.ts, shouldLogWorkout, "slipping"; plan
// days personas.ts) leaves Rohan's workouts open on: today, the two days before it,
// and a Saturday in the last six days. Wed, Fri and Sun are rest days in every
// demo plan; training days are Mon, Tue, Thu, Sat. The missed banner (TR-10c) lists
// only the open past workouts of the current Monday-first week.
//
// The device gate runs themes one after the other on one seed, and inside a theme
// the flows in path order, so one run mutates what the next sees. The script
// replays that: per theme, z12-36/3 starts or continues one session (it leaves it
// open: light starts, dark continues the same one), then z12-44/2 finishes one.
// Each takes the first open workout in its preference order:
//   z12-36/3  last Saturday, else the newest missed one of this week
//   z12-44/2  light: banner, an open session, last Saturday, today
//             dark:  today, banner, an open session, last Saturday
// (light leaves today for dark's W-01a). Tuesday and Thursday have three, which is
// every pass's workout and W-01a in both themes. Other days run out: the pass with
// nothing to open SKIPS, logging why (output.*Skip, console), never silently, and
// every strip and banner state is still asserted, so a seed made for another day
// (or another time of day) fails the flow instead of passing it.
//
// Sets (all strings):
//   today, lastSat   strip labels, e.g. "Thu 19 Nov"
//   trainingDay      "yes" on Mon, Tue, Thu, Sat; aaravToday "Done"/"Rest"
//   rohanToday       Rohan's strip state for today when z12-44/2 starts this theme:
//                    "To do" (open), "Done" (an earlier pass finished it) or "Rest"
//   z36Label         the day z12-36/3 opens ("" = skip), z36Skip why
//   fwKind           what z12-44/2 opens: "today" | "banner" | "day" | "none"
//   fwLabel          its day (strip label), fwSkip why when none
//   fwBanner         "yes" when the missed banner shows when z12-44/2 starts
//   fwW01a           "yes" when today is still to do when z12-44/2 starts
//   plan             the whole plan for this theme, for the log
(function () {
var NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var TRAINING = [1, 2, 4, 6];

var nowIst = Date.now() + 5.5 * 3600 * 1000;
var dow = new Date(nowIst).getUTCDay();
var sinceMonday = (dow + 6) % 7;
var theme = typeof DEVICE_THEME !== "undefined" && DEVICE_THEME === "dark" ? "dark" : "light";

function labelFor(back) {
  var d = new Date(nowIst - back * 86400 * 1000);
  return NAMES[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
}
function weekdayOf(back) {
  return (dow - back + 7) % 7;
}
function isTraining(weekday) {
  return TRAINING.indexOf(weekday) >= 0;
}

// back (days before today) -> "open" | "progress" | "done"
var status = {};
for (var k = 0; k <= 6; k++) {
  var w = weekdayOf(k);
  if (isTraining(w) && (k <= 2 || w === 6)) status[k] = "open";
}
var satBack = (dow + 1) % 7 || 7;
var sat = satBack <= 6 && status[satBack] ? satBack : -1;

// The newest back whose status is `want`; banner true = only the current week's past
// days, false = only the others; -1 when none.
function newest(want, banner) {
  for (var i = 0; i <= 6; i++) {
    if (status[i] !== want) continue;
    var inBanner = i >= 1 && i <= sinceMonday;
    if (banner === true && !inBanner) continue;
    if (banner === false && inBanner) continue;
    return i;
  }
  return -1;
}

var result = {};
var themes = ["light", "dark"];
for (var t = 0; t < themes.length; t++) {
  var th = themes[t];
  var r = {};

  // z12-36/3
  var z36 = sat >= 0 && status[sat] !== "done" ? sat : newest("open", true);
  if (z36 >= 0) {
    r.z36Label = labelFor(z36);
    r.z36Skip = "";
    status[z36] = "progress";
  } else {
    r.z36Label = "";
    r.z36Skip = "no open workout for z12-36/3 on " + labelFor(0) + " (" + th + ")";
  }

  // z12-44/2
  r.rohanToday = status[0] === "open" ? "To do" : status[0] === "done" ? "Done" : "Rest";
  r.fwW01a = status[0] === "open" ? "yes" : "no";
  r.fwBanner = newest("open", true) >= 0 ? "yes" : "no";
  var order = th === "dark" ? ["today", "banner", "progress", "open"] : ["banner", "progress", "open", "today"];
  var pick = -1;
  var kind = "none";
  for (var o = 0; o < order.length && pick < 0; o++) {
    var want = order[o];
    if (want === "today") pick = status[0] === "open" ? 0 : -1;
    else if (want === "banner") pick = newest("open", true);
    else if (want === "progress") pick = newest("progress");
    else pick = newest("open", false);
    if (pick >= 0) kind = want === "today" ? "today" : want === "banner" ? "banner" : "day";
  }
  if (pick >= 0) {
    r.fwKind = kind;
    r.fwLabel = labelFor(pick);
    r.fwSkip = "";
    status[pick] = "done";
  } else {
    r.fwKind = "none";
    r.fwLabel = "";
    r.fwSkip = "no workout left for z12-44/2 on " + labelFor(0) + " (" + th + "): its finish steps are skipped";
  }
  result[th] = r;
}

var mine = result[theme];
output.today = labelFor(0);
output.lastSat = labelFor(satBack);
output.trainingDay = isTraining(dow) ? "yes" : "no";
output.aaravToday = isTraining(dow) ? "Done" : "Rest";
for (var key in mine) output[key] = mine[key];
output.plan =
  theme + " " + output.today + ": z12-36/3 " + (mine.z36Label || "SKIP") +
  "; z12-44/2 " + mine.fwKind + " " + mine.fwLabel +
  ", today " + mine.rohanToday + ", banner " + mine.fwBanner;
if (typeof console !== "undefined") {
  if (mine.z36Skip) console.log("[ist-days] SKIP " + mine.z36Skip);
  if (mine.fwSkip) console.log("[ist-days] SKIP " + mine.fwSkip);
  console.log("[ist-days] " + output.plan);
}
})();
