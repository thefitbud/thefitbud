/**
 * The one definition of what a rest countdown shows at a given instant, and of
 * when the surface showing it has to be redrawn (LA3d).
 *
 * It exists because two surfaces count the same rest and neither of them can
 * ask the app what to draw once the app is asleep:
 *
 * - the in-app activity model (`liveActivity.ts`), and
 * - the Android ongoing notification, whose countdown is a system
 *   `Chronometer` with a base in the future (LA3c). A `Chronometer` keeps
 *   ticking past its base and renders negative elapsed time ("-0:14"), so the
 *   notification has to be redrawn at the rest's end by something that does
 *   not need the JS process to be alive. On Android that is a one-shot alarm
 *   scheduled from `restAlarmPlan` below.
 *
 * KEEP IN SYNC with the Kotlin side, which is split across two files and two
 * directories:
 *
 * - `RestAlarm.plan` in
 *   modules/live-activity/android/src/main/java/com/thefitbud/liveactivity/RestAlarm.kt
 *   mirrors `restAlarmPlan` below;
 * - the rest-over rule itself is `WorkoutSetNotification.resting` in
 *   targets/android/WorkoutSetNotification.kt (LA3c), which is the exact
 *   complement of `restCountdownRender` returning "ended".
 *
 * Only `kind`/`fireAtMs` are mirrored. `remainingMs`, `elapsedMs` and
 * `totalMs` have no Kotlin counterpart: nothing draws a progress bar yet
 * (see the note on them below).
 *
 * This file's test (restCountdown.test.ts) is the executable specification for
 * both sides. Kotlin cannot be compiled or run in this repo's CI, so it is the
 * only place these rules are actually checked, and this comment is the only
 * thing tying the two languages together — if you move or rename either Kotlin
 * site, fix it here.
 *
 * Two rules carry the defect this file fixes, and both are asserted:
 * - rest is over at its end instant, not after it: `endsAt <= now` ends it;
 * - a remaining duration is never negative. Past the end there is no
 *   remaining duration at all, because there is no countdown to render.
 */

/** The rest fields a state carries, on either platform. */
export type RestCountdownInput = {
  /** Epoch ms when the rest ends, or null/absent when there is no rest. */
  restEndsAt?: number | null;
  /** Full rest length in seconds, as the app set it. */
  restSeconds?: number | null;
  /** A finished workout never rests. */
  finished?: boolean;
};

/**
 * What the surface draws now. `ended` covers every reason there is no
 * countdown — no rest was set, it was skipped, the workout finished, or the
 * end instant has arrived — because all of them draw the same thing: the next
 * set, with no timer.
 */
export type RestCountdownRender =
  | {
      kind: "resting";
      /** Time left, always greater than zero. */
      remainingMs: number;
      /** Time already rested, never negative. */
      elapsedMs: number;
      /** The window the bar and the countdown are read against. */
      totalMs: number;
    }
  | { kind: "ended" };

/**
 * What a surface that has to be woken up should schedule. `cancelExisting` is
 * always true: every state the module is given replaces the one before it, so
 * a rest that was skipped, shortened, logged past or ended can never leave a
 * stale repaint behind to fire later.
 */
export type RestAlarmPlan = {
  cancelExisting: boolean;
  /** Epoch ms to redraw at, or null when nothing has to be scheduled. */
  fireAtMs: number | null;
};

function endsAtOf(input: RestCountdownInput): number | null {
  if (input.finished === true) return null;
  const endsAt = input.restEndsAt;
  if (endsAt == null || !Number.isFinite(endsAt)) return null;
  return endsAt;
}

/** What the rest countdown shows at `now` (epoch ms). */
export function restCountdownRender(
  input: RestCountdownInput,
  now: number,
): RestCountdownRender {
  const endsAt = endsAtOf(input);
  // At the end instant the rest is over: `<=`, not `<`. One tick later the
  // Chronometer would be the first thing to say so, and it says it with a
  // minus sign.
  if (endsAt == null || endsAt <= now) return { kind: "ended" };
  const remainingMs = endsAt - now;
  const seconds = input.restSeconds;
  const plannedMs =
    seconds != null && Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds * 1000)
      : 0;
  // A rest the trainer extended, or one restored after the clock moved, can
  // have more left than it was ever planned to run. The window grows to what
  // is actually left rather than letting elapsed time go negative.
  const totalMs = Math.max(plannedMs, remainingMs);
  return { kind: "resting", remainingMs, elapsedMs: totalMs - remainingMs, totalMs };
}

/**
 * The repaint to schedule for `input`, replacing whatever was scheduled for
 * the state before it.
 */
export function restAlarmPlan(input: RestCountdownInput, now: number): RestAlarmPlan {
  const render = restCountdownRender(input, now);
  return {
    cancelExisting: true,
    fireAtMs: render.kind === "resting" ? (input.restEndsAt as number) : null,
  };
}
