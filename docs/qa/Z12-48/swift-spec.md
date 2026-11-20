# Z12-48 → Z12-57 · Live Activity Swift (and Android) change list

JS owns the lines and the workout advance from this task (`liveActivity.ts`,
`liveActivitySession.ts`, `liveActivityNative.ts`). Native layout and
`LogSetIntent` land in **Z12-57** (D-W12-13). Frame: **TR-15d**
(`docs/design/v3/png/trainee/TR-15d-lockscreen-live-activity.png` and
`png-dark/`).

## ContentState (keep app + widget Codable shapes identical)

Files (must stay in sync):

- `apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift` — `FitBudWorkoutAttributes.ContentState`
- `apps/mobile/modules/live-activity/ios/LiveActivityModule.swift` — same struct + `WorkoutStateRecord`
- Android mirror: `modules/live-activity/android/.../LiveActivityModule.kt` `WorkoutStateRecord` and `WorkoutSetNotification.SetState`

Add:

| Field | Type | Meaning |
|---|---|---|
| `moreExercisesRemain` | `Bool` (default `false`) | From JS (`lastExercise === false`). While `true`, `LogSetIntent` / Android `logSet` must **not** set `finished`. |

JS already sends `moreExercisesRemain` on every update (`toNativeContentState`). Expo drops it until the Record/`ContentState` field exists.

## LogSetIntent (ISSUE-MAP #1 / #11)

`FitBudLiveActivity.swift` ~L69–118 today:

1. Writes the outbox row (keep).
2. Builds `loggedLine` with `"\(kg) kg × \(reps)"` — **stop**. Prefer the JS line rules (below), or leave `loggedLine` for the next JS update.
3. Advances `setIndex` within the current exercise (optimistic OK).
4. **Bug:** `if next > state.setCount { state.finished = true }` — this ends the workout on the last set of exercise 1 while more exercises remain.

Required:

- If `moreExercisesRemain == true`, never set `finished = true` (only write outbox + optimistic logged/last fields; leave `finished` false).
- If `moreExercisesRemain == false` and `next > setCount`, then `finished = true` (last exercise’s last set).
- JS remains the source of truth: the next `update` from `liveActivitySession` replaces exercise name, set counts, crossing line, and `finished`.

Same rule for Android `WorkoutSetNotification.logSet` and `WorkoutSetActionReceiver`.

## Lines (JS already correct; native must not re-break them)

| Case | Line |
|---|---|
| Weighted logged | `Set 3 logged · 22.5 kg × 10` |
| Bodyweight logged | `Set 3 logged · 12 reps` (never `0 kg`) |
| Zero reps | use plan reps, or omit the logged line |
| Crossing exercises | `{Exercise} done · Next: {Next}, set 1 of {n}` |

JS puts the full string in `loggedLine` (including the crossing form). Native must:

- **Show `loggedLine` as sent** on the lock tile, rest view, and Android notification.
- **Stop** composing `"Next: set \(setIndex) of \(setCount)"` in `restLoggedLine` when that would drop the exercise name — use JS’s `loggedLine` (and, after advance, the next content update).
- Format kg/reps only when building an optimistic line before JS answers: bodyweight when kg ≤ 0 → `"\(reps) reps"`; never print `0` reps (use `planReps` or omit).

Android `titleLine` / `valuesLine` / `lastLine` / `logSet`’s local logged string: same bodyweight and zero-reps rules.

## TR-15d layout (Swift only)

- Fixed **160 pt** height; every text `lineLimit(2)` (no cut-off).
- Title row: `FitBud · {workoutName}` + elapsed/timer.
- Exercise + set position (`Romanian deadlift · Set 3 of 3` or separate lines matching the mock).
- **Last** and **Target** in coach colour.
- Buttons: `Log {target}` (e.g. `Log 40 kg × 10`) and **Open**.
- Coral progress line.
- Dynamic Island compact + expanded from the same `ContentState`.

## Deep link → W-03

- `widgetURL` on the ActivityConfiguration (tile tap) and Open `Link` → the activity’s `openUrl`.
- Intended URL: `fitbud://workout/{assignmentId}?active=1` → `workout_active` in `linking.ts` (already parsed).
- **JS fallback today:** `workoutOpenUrl` still emits `fitbud://?workout={id}` so a backgrounded active log is not replaced by the overview (TraineeShell still treats `workout_active` like overview). Z12-57 (or the shell owner) must: (1) switch `workoutOpenUrl` to `workoutActiveOpenUrl`, (2) make TraineeShell resume the running execution on `workout_active` (W-03), not open the overview overlay.

## Android ongoing notification (no layout mock)

Standard ongoing notification with:

- The same lines as above (including crossing and bodyweight).
- Rest countdown (already LA3c) + Skip rest.
- Tap / Open → W-03 via the same `openUrl` once the shell routes `workout_active`.

## Out of scope for Z12-57 from this list

- Changing published-plan immutability or rewriting history.
- Expo SDK upgrade (separate after Firoz’s W12 device pass).

## Proof on the Z12-57 build

- iOS: start workout → lock → TR-15d light/dark complete (not cut off); Log last set of exercise 1 → workout continues; Open + tile → W-03.
- Android: ongoing notification lines + rest timer; tap → W-03.
