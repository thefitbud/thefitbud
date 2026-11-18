# Z12-45 · Active workout v3 (QA)

Spec: `docs/specs/Z12-45.md`. Frames: `docs/design/v3/png/trainee/` (light) and `png-dark/trainee/` (dark), W-02 to W-27.

## 1. What the server can store decided the scope

The W- mocks draw controls the data model has nothing to store. `packages/contracts`, `packages/api-client`, the schema and `routes/sync.ts` are outside this task's `files_owned`, and a model change needs a migration (a backend PR of its own, AGENTS.md). So this task builds every control that has a backend source, and leaves the rest out instead of drawing controls that do nothing or that the coach never sees.

| Built | Backend source |
|---|---|
| Log any set in any order; edit a logged set; log a skipped set | `POST …/sets/:id/complete` (`workout.complete_set` in the outbox). Server change in this PR: while the workout is open the latest log stands (it was 409 `SET_ALREADY_RECORDED`) |
| Skip a set (swipe, or the set number), Skip exercise, Undo, Mark not done | `POST …/sets/:id/skip`. Server change in this PR: a logged set can be skipped while the workout is open. Undo never needs the server: a skip is sent only once its Undo has gone |
| Finish early, Finish now (Workout tab), Finish and save (resume dialog) | `workout.complete` |
| Discard | `workout.skip`: the coach sees the workout as skipped, and the dialog says so |
| Pause, Resume | `workout.pause`, `workout.resume` |
| Record banner and PR mark | Strength read model (`GET /strength/…?range=all`): heavier than every load before the session's day |
| How to, History | The plan's exercise (muscles, equipment, coach note); this session and the last three finished sessions of the same workout day |
| Offline header | Z12-41's API reachability |

| Not built | What it needs |
|---|---|
| Add set, Add exercise (W-21a, W-21b), "Added by you" | Set and exercise rows that are not in the plan (schema, contracts, coach surfaces) |
| Replace exercise (W-22), coach alternatives | Alternatives on the plan and a replaced-by link on the execution |
| Remove from today, Delete set | A removed state distinct from skipped |
| Exercise note (W-10), the Note chip | A trainee note per exercise execution |
| "edited" mark for the coach, "finished early" label | A stored edited flag and finish reason |
| Coach video and numbered steps (W-27) | Media and steps on the plan exercise |
| Rest-end sound | A native audio module (Z12-57) |

These are one backend task (schema, contracts, api-client, sync operations, trainer surfaces) plus a small mobile follow-up on top of this log.

## 2. Per-screen gaps found on `main` before building (re-traced against `ActiveWorkoutScreen.tsx` at 275b4ea9)

| Screen | On `main` | Now |
|---|---|---|
| W-02, W-03 | v2 cards and indigo log bar; only the first pending exercise open; sets logged strictly in order; no stats strip | v3 nav, stats strip, every exercise open, any set loggable, done exercises fold |
| W-03b | No end of list | Discard workout at the end (Add exercise not built) |
| W-04 | Old keypad, v2 colours | v3 keypad: ±2.5 / ±1, Next, Log, kg or Bodyweight |
| W-05a, W-05b | Light card counting its own seconds; no end state; no haptic | Slim bar read from the rest's end instant; "Rest done" bar; two buzzes at the end |
| W-08 | None | Swipe to Skip (Delete not built); the set number opens the same action |
| W-09, W-09b | None; the ▶ button opened Ask coach | ⋯ menu: How to, History, Ask coach, Skip exercise; Undo toast |
| W-12 | None | Banner and PR mark |
| W-13 | None | Set sheet: Save changes, Mark not done (Delete set not built) |
| W-14 | None | Minimised bar (Workout tab now; other tabs wait for `TraineeShell.tsx`) |
| W-15 | None | Confirm dialog |
| W-16 | A two-button sheet with a count | The list of what is not logged, with Go to |
| W-18 | None | Dialog on the Workout tab after a relaunch |
| W-19 | Pause was the header's left button, where Back belongs; unlabelled icon | "Pause" text pill on the right; banner with the stopped time |
| W-20 | "Saved on phone" error banner after a failed send | Header line "Offline · sets save on your phone" |
| W-26, W-27 | None | Exercise detail |
| W-10, W-21a/b, W-22 | None | Not built (§1) |
| W-17a, W-17b | Z12-44 | Unchanged |

## 3. Expo-web check (D-W12-34 (2))

Method: local API on port 8796 against this worktree's own D1 (`pnpm db:reset`), `expo start --web` on 8096 with `EXPO_PUBLIC_API_BASE_URL` pointing at it, Playwright Chromium at 393×852 @2x, `colorScheme` light and dark, behind `/tmp/fitbud-capture-1.lock`. Every state comes from the real API on the demo seed (Wed 18 Nov 2026, a rest day): Rohan Mehta's last Saturday (Lower body B, light) and Tuesday (Lower body A, dark), both late logs. Shots: `web/<ID>-<theme>-web.png`. Expo web proves copy, structure and values, not native layout.

| Screen | Light | Dark | Grade | What remains |
|---|---|---|---|---|
| W-02 | yes | yes | CLOSE | Subtitle is "From Rahul’s plan" (no week or day number has a source here); Pause pill beside Finish (W-19); no Note chip, no Add set |
| W-03 | yes | yes | CLOSE | As W-02; "Previous" is a dash on the seed (seeded sessions carry no set rows) |
| W-03b | yes | yes | CLOSE | Discard only; Add exercise not built |
| W-04 | yes | yes | CLOSE | A kg / Bodyweight link sits in the keypad head |
| W-05a | yes | yes | CLOSE | Docked above the list's bottom edge instead of floating over it |
| W-05b | yes | yes | CLOSE | Same |
| W-08 | stand-in | stand-in | GAP on web | react-native-web has no swipe: `W-08-set-options-*` shows the set sheet that offers the same Skip. The swipe is on the device |
| W-09 | yes | yes | CLOSE | Four rows: no Replace, no Remove from today |
| W-09b | yes | yes | CLOSE | — |
| W-12 | — | yes | CLOSE | Light's Saturday starts with a lift that has no earlier kg on the seed, so nothing is a record there |
| W-13 | yes | yes | CLOSE | No Delete set; the caption says the coach sees the set as last saved (no "edited" mark exists) |
| W-14 | yes | yes | CLOSE | On the Workout tab (the mock shows Diet) |
| W-15 | yes | yes | CLOSE | Copy says the workout is recorded as skipped (the mock says the coach won't see it) |
| W-16 | yes | yes | CLOSE | Copy: "Rahul will see which sets you did" (no "finished early" label exists) |
| W-18 | — | yes | CLOSE | Light's session was opened in the same page load |
| W-19 | yes | yes | CLOSE | — |
| W-20 | yes | yes | CLOSE | — |
| W-26 | yes | yes | CLOSE | Earlier sessions are empty on the seed; today's sets show |
| W-27 | yes | yes | GAP | Coach note and tags only: no video, no steps (§1) |
| W-10, W-21a, W-21b, W-22 | — | — | GAP | Not built (§1) |

## 4. Deliberate departures from the mocks

1. **Pause** has no place in the mocks' header. It is a text pill ("Pause" / "Resume") on the right, beside Finish, away from the minimise chevron on the left (spec: "labelled and placed away from Back").
2. **The log lays itself out** (pinned header, scrolling list, a dock for the Undo toast, the rest bar and the keypad) and opts in to the system theme with `ThemeScope`, the mechanism behind `<Screen v3>`. `Screen` scrolls its whole body, which would scroll Finish and the timer away. The exercise detail and the "already done" guard use `<Screen v3>`.
3. **Skip is the only swipe action**, and it is also behind the set number, for anyone who cannot swipe and for the web build.
4. **Undo applies to skips** (the toast). A logged set is undone from its sheet ("Mark not done"), which needs the network: the server already has the log, so queued logs are sent first and, if the change does not land, the set stays logged and the screen says so (code `WO-UNLOG`).
5. **−15 with under 15 s left ends the rest** like Skip, with no "Rest done" and no buzz: both belong to a rest that ran out.
6. **A record** is the heaviest set of a lift in the session when it beats every load logged before the session's day. A lift with no earlier kg load marks none.
7. **Discard copy** and **Finish early copy** say what the server does (§3).
8. **"Previous"** shows the same set from the last finished session of this workout day, else a dash. It no longer falls back to the set above it in the current session, which is not "previous".

## 5. Hand-overs

**Z12-57 (native), to switch:**
- `apps/mobile/src/trainee/workout/haptics.ts` `restEndHaptic()`: `Vibration` → `expo-haptics`, and add the rest-end sound. Declare `android.permission.VIBRATE` (the call is skipped without it).
- `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx` `activateWorkoutKeepAwake()`: `requireOptionalNativeModule("ExpoKeepAwake")` → `expo-keep-awake` (unchanged from Z11b-3).
- No other native need came up.

**Z12-48 (Live Activity JS):**
- The rest is one end instant, `RestWindow { endsAt, seconds }`, held in `trainee/workout/activeSession.ts` (`session.rest`) and passed to `useWorkoutLiveActivity` as before. The in-app text is `formatRestClock(restSecondsShown(restCountdownRender(…)))` in `notifications/restCountdown.ts`: whole seconds, rounded up, never 0:00 while resting. Build the lock-screen lines on the same functions.
- `−15`/`+15` go through `adjustRest`, which moves `endsAt` and `seconds` together; a rest moved to or past its end becomes `null`.
- The Live Activity hook still lives in `ActiveWorkoutScreen`, so the activity ends when the log is minimised (W-14) and starts again when it comes back. Keeping it alive while minimised means moving the hook to wherever the session store is read for the whole shell.
- Sets can now be logged in any order, corrected and skipped: `execution` is the source, as before.

**Z12-46 / orchestrator:** the minimised bar on the other tabs is one mount in `TraineeShell.tsx` (`<MinimisedWorkoutBar relationshipId onResume>` above the tab bar, hidden on the Workout tab, which shows its own). `TraineeShell.tsx` is held by #483.

## 6. Device gate

See the PR body for the run, the per-platform results and the control list. Shots: `docs/qa/Z12-45/<ID>-<theme>-<platform>.png`.
