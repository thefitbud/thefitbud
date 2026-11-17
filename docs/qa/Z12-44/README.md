# Z12-44 · Workout tab and summary v3 (QA)

Spec: `docs/specs/Z12-44.md`. Frames: `docs/design/v3/png/trainee/` (light) and `png-dark/trainee/` (dark): W-01a–e, W-17a/b, TR-10a–c.

## 1. Expo-web check (D-W12-34 (2))

Method: local API on port 8795 against this worktree's own D1 (`pnpm db:reset`, then `pnpm --filter @fitbud/api db:reseed` for a clean state), `expo start --web` with `EXPO_PUBLIC_API_BASE_URL` pointing at it and `EXPO_PUBLIC_SCREEN_CAPTURE=1`, Playwright Chromium at 393×852 @2x, `colorScheme` light and dark, both behind `/tmp/fitbud-capture-2.lock`. Every state comes from the real API on the demo seed (Tue 17 Nov 2026):

| Screen | Persona and state | Light | Dark | Grade |
|---|---|---|---|---|
| W-01a | Rohan, today "Lower body A" not started | `web/W-01a-…-light-web.png` | `web/W-01a-…-dark-web.png` | CLOSE |
| W-01b | Rohan, started and one set logged in the UI, page reloaded | `web/W-01b-…-light-web.png` | `web/W-01b-…-dark-web.png` | CLOSE |
| W-01c | Aarav, today done (seeded) | `web/W-01c-…-light-web.png` | `web/W-01c-…-dark-web.png` | CLOSE |
| W-01d | not built here (see §3) | — | — | not graded |
| W-01e | Aarav, Thu 19 Nov planned | `web/W-01e-…-light-web.png` | `web/W-01e-…-dark-web.png` | CLOSE |
| W-17a | Aarav, View summary on today | `web/W-17a-summary-light-web.png` | `web/W-17a-summary-dark-web.png` | CLOSE |
| W-17b | Aarav, Save and share | `web/W-17b-…-light-web.png` | `web/W-17b-…-dark-web.png` | CLOSE |
| TR-10a | Aarav, Wed 18 Nov (no workout) | `web/TR-10a-…-light-web.png` | `web/TR-10a-…-dark-web.png` | CLOSE |
| TR-10b | Harpreet (no plan) | `web/TR-10b-…-light-web.png` | `web/TR-10b-…-dark-web.png` | CLOSE |
| TR-10c | Rohan, Monday's "Upper body A" missed | `web/TR-10c-…-light-web.png` | `web/TR-10c-…-dark-web.png` | CLOSE |
| Today done card | Aarav, Today after the summary | `web/z12-44-today-done-card-light-web.png` | `…-dark-web.png` | View summary only (ISSUE-MAP #4) |

Expo web proves copy, structure and values, not native layout; no screen is claimed as a pixel match. Web console errors seen, all present before this change: `accessibilityElementsHidden` / `importantForAccessibility` on the shell's tab bar, `findDOMNode` from react-native-gesture-handler's `GestureDetector` (Z12-40), the realtime WebSocket through the Metro proxy, and a 422 for the no-plan trainee's plan read. None comes from the new code.

## 2. Device run

Scoped run (D-W12-34) **44144088662**, flows `launch,z12-44,device/z12-36/3-trainee-workout.yaml,device/z12-40/*.yaml`, app `7d8ababa` (confirmed in both job logs), harness `cc29fc3d`:

| Platform | Light | Dark | Log scan |
|---|---|---|---|
| iOS simulator | 7/7 | 7/7 | pass, 0 findings, 0 allowed |
| Android emulator | 7/7 | 7/7 | pass, 0 findings, 0 allowed |

Shots: `docs/qa/Z12-44/<screen ID>-<theme>-<platform>.png` (copied with `copy-shots.sh` from `refs/device-gate/44144088662`). Every screen of this task in both themes on both platforms, except TR-10c dark: in the dark pass the light run had already opened Monday's missed workout, so no banner was left (Expo web shows it in dark).

The first run (44131228416, app `5d40b638`) failed on flow problems, not app defects: the no-plan flow used the shared sign-in, which waits for "Today's workout" (a trainee with no plan never gets it), and dark iOS stalled on the startup spinner after a cold relaunch. Both flows were fixed (sign-in inline for the no-plan flow; wait for the tab bar after a relaunch) and the run above is the one allowed re-run. It also covers Z12-47, merged into the branch in between.

## 3. Departures from the mocks, with reasons

1. **Week strip starts on Monday**, with chevrons, as Z12-40's shared v3 strip does on Today and Diet (the mocks draw Sunday first). Its dots are the workouts' own (done green, missed red, planned grey, rest none), so Workout's strip shows the workout days, as in W-01a/e.
2. **"Week 3", not "Week 3 of 12"**, when the plan version has no end date (the seed's has none). "of N" appears only when `effectiveTo` is set.
3. **No bell on the Workout header** (the mocks have none); a ⋯ "Workout options" button holds "Not today" (old frame 99, no v3 mock: current behaviour kept, Z12-23) and "Ask coach". It sits in the header, outside the card, which also removes the nested-button problem.
4. **No "1 PR" badge (W-01c) and no record card (W-17a)**: nothing in the API computes records yet.
5. **W-17a has no RPE picker and no note field.** The workout is complete and shared when the summary opens; no trainee endpoint takes an RPE or a note on a finished execution (`POST /executions/:id/complete` needs an open one; there is no trainee note field). The old note field was silently discarded, so it is removed. The RPE recorded at the finish shows as "How hard it felt · N of 10". "Save and share with Rahul" moves to W-17b; it sends nothing new.
6. **W-17b copy**: "Saved at 7:24 pm. Rahul will see your sets." (the mock adds "the record and your note", which do not exist here, and "He'll", a gender the app does not know). Offline it says "Saved on your phone · It goes to Rahul when you're back online."
7. **TR-10b copy**: "…You'll get a notification when they're added." instead of "when he does" (no gender in the data). The WhatsApp button (a wa.me prefill the trainee sends) shows only when the coach's number is on the relationship.
8. **TR-10a body on a day other than today**: "No workout planned for this day." (the mock's "planned recovery today" is today's copy).
9. **TR-10c with several misses** says "You missed 2 workouts this week. Did them anyway?"; "Log it" opens the newest.
10. **W-01b has no "Finish now"**: finishing early (W-16) is Z12-45's; "Continue workout" opens the session, where Finish lives.
11. **W-01d** ("Rahul updated your plan") is the in-app notice banner (Z12-38's host, Z12-47's copy); the tab under it is W-01a. Not built or graded here.
12. **The tab bar stays light in dark** on every trainee tab: it is the shell's (`TraineeShell`/`TabBar`), not this task's screens.

## 4. Duration across pause, resume and relaunch

The server keeps `startedAt`, the current `pausedAt` and `completedAt`, and no running total of paused time. Every clock now reads those (`elapsedSeconds` in `workoutDuration.ts`): the Workout tab's "In progress · 23:14", the active workout's header and the summary's Duration. The clock stands still while paused and, after a resume, counts wall-clock time from the start, the same rule as the finished duration, so they never disagree and nothing is lost on a kill and relaunch. The active workout used to keep paused time in memory, so its clock jumped after a relaunch. Excluding paused time needs a stored total on the server (a migration): listed as a follow-up.
