# W12-cursor · Cursor run for remaining W12 tasks

**Status:** Running. Launched 18 Nov 2026 (IST) by FitBud UI, from `main` at `58ac1b11` (or later). **Claude lane handed to Cursor 19 Nov 2026 (D-W12C-22).**
**Authority:** this file for Cursor-owned work. Claude’s open W12 PRs and Z12-57/Z12-60 are now Cursor’s (D-W12C-22). W12b is finished ([`W12b.md`](W12b.md)); leave it alone.
**Repo rules:** `CLAUDE.md`, `AGENTS.md`. Design: `docs/design/v3/` (mocks win over older frames; record departures).
**Branch prefix:** new Cursor tasks use `cursor/<task>-<slug>-db78`. Handed Claude PRs keep their `claude/...` branch names and existing PRs (no new PRs for those). Z12-57 / Z12-60: `cursor/z12-57-native-db78`, `cursor/z12-60-report-db78`.
**Concurrency:** at most **2** Cursor tasks at once. Never cancel or force-cancel any Actions run.
**Claude fence (narrowed, D-W12C-22):** may push, review, rebase and merge `claude/Z12-45-active-workout` (#484), `claude/Z12-46-today-progress` (#483), `claude/Z12-51-review-sheet` (#486), `claude/Z12-44-flows-weekday` (#485). Still never touch other `claude/` work (#177, #307, Z10-7, Z14-*).
**W12.md edits (D-W12C-1 narrowed):** only the status of handed tasks and Z12-60’s Report section.
**JS only:** native / Swift / Expo-SDK changes go under **Native items for Z12-57** below, except Z12-57 itself. No deploy. No repo-settings changes.
**Models:** D-W12C-17 (subscription-included / Auto only; supersedes D-W12C-3).
**Device runs:** Cursor cannot dispatch `device.yml` (403). At “ready for device run”, record the exact `gh workflow run …` in this ledger and the PR, then continue; FitBud UI / Firoz starts the run.

## Task list and status

Order (D-W12C-22): **#486 → #483 → #485 → #484** (+ **Z12-46fu** in parallel with #484) → Z12-48 + Z12-49fu → Z12-52 → Z12-53 → Z12-57 → Z12-58 → Z12-59 prep → Z12-60.

| Task | Wait | Status | PR | Merge SHA | Grades / notes | Model |
|---|---|---|---|---|---|---|
| Z12-W12C-0 Ledger | — | merged | #488 | `893691c3` | this file | Cursor Auto |
| Z12-43 Manual food logging | #460 (Z12-42) merged `4982d567` | **merged** | #490 | `4aa28299` | Expo web CLOSE; device gate [44336404989](https://github.com/thefitbud/thefitbud/actions/runs/44336404989) PASS (F08 soft-skips when seed already logged); harness Screen/Results + iOS center tap fixes | Cursor Auto |
| Z12-30 Delete account (web) | #487 (Z12-29) merged `450874d7` | **merged** | [#492](https://github.com/thefitbud/thefitbud/pull/492) | `21792a2e` | fresh proof = password re-login bearer + `credentials:omit`; review fix D-W12C-21; cookie Firebase `auth_time` remains W6 API follow-up | Cursor Auto |
| Z12-51 Exception review sheet | — | **merged** | [#486](https://github.com/thefitbud/thefitbud/pull/486) | `1272b972` | CI race fix `f1b10f36`; review PASS; auto launch iOS-light flake ignored (scoped [44403709387](https://github.com/thefitbud/thefitbud/actions/runs/44403709387) PASS) | Cursor Auto |
| Z12-46 Today / Progress | after #486 ✅ | **merging** | [#483](https://github.com/thefitbud/thefitbud/pull/483) | — | device [44478196249](https://github.com/thefitbud/thefitbud/actions/runs/44478196249) PASS on `fcbdcd52` (FitBud UI reviewed 71 shots); tip docs-only merges OK | Cursor Auto |
| Z12-46fu Today/Progress pixel fixes | after #483 | blocked on #483 | — (branch `cursor/z12-46fu-pixel-db78`) | — | JS-only; parallel with #484. (a) iOS note time via shared formatter + assert "7:00 pm"; (b) remove leading note divider; (c) Steps chip fits 360 dp; (d) Progress chart x-label inset; (e) Z12-58 evidence: wait for form before TR-14a shot; dark TR-14a/c/d. Each code item needs a render test. Device when ready: `launch,z12-46` | Cursor Auto (planned) |
| Z12-44 follow-up weekday flows | after #483 | **device running** | [#485](https://github.com/thefitbud/thefitbud/pull/485) `claude/Z12-44-flows-weekday` | — | scoped [44484383185](https://github.com/thefitbud/thefitbud/actions/runs/44484383185) on `f3fedc2f`; merge main OK if no PR-file changes; merge before #484 | Cursor Auto |
| Z12-45 Active workout | after #485+#483 | blocked | [#484](https://github.com/thefitbud/thefitbud/pull/484) `claude/Z12-45-active-workout` | — | must-fix list (handover §4); one device run after all fixes; draft | Cursor Auto (planned) |
| Z12-48 Live Activity (JS) | #484 | blocked | — | — | rest to the second; finding 1 JS side | Cursor Auto (planned) |
| Z12-49 follow-up Ended-coaching tab bar | #484 | blocked | — | — | small; tab bar must show on ended screen | Cursor Auto (planned) |
| Z12-52 Coach logs a meal | Z12-43 ✅ + #486 ✅ | ready after #483/#485/#484 lane or when a slot frees | — | — | each What-changed option = own screen; sheet theme partly fixed in Z12-43 (D-W12C-15) | Cursor Auto (planned) |
| Z12-53 Trainer mobile v3 | Z12-52 + #486; Z12-56/38/47 already on main | blocked | — | — | TM-01a–TM-10b; WorkspaceHeader (D-W12-26); F22–F28; expo-push title/body (D-W12-38); grade TM-13a/b | Cursor Auto (planned); review Auto |
| Z12-57 Native | every other mobile JS task | blocked | — (branch `cursor/z12-57-native-db78` when started) | — | expo-haptics / keep-awake / rest-end sound; EAS builds = Firoz manual | Cursor Auto (planned) |
| Z12-58 Full device pass | Z12-57 | blocked | — | — | F01–F29 + parity matrix + device checklist | Cursor Auto (planned) |
| Z12-59 prep | after Z12-58 | blocked | — | — | SHA, migrations, commands, smoke in `docs/tasks/manual-steps.md`; then mark ready for Z12-60 and stop | Cursor Auto (planned) |
| Z12-60 Report | after Z12-59 | blocked | — (branch `cursor/z12-60-report-db78` when started) | — | fresh whole-batch review + Report in `W12.md` | Cursor Auto (planned) |

## Merged-SHA ledger

| When (IST) | SHA | Via | Notes |
|---|---|---|---|
| 18 Nov 2026 (launch ~16:07 IST; #470 merge was earlier that day) | `58ac1b11` | #470 (already on main at launch) | Cursor run base |
| 18 Nov 2026 | `4982d567` | #460 (Z12-42, Claude) | unblocks Z12-43; its branch starts here |
| 18 Nov 2026 | `893691c3` | #488 (Z12-W12C-0) | Cursor ledger on main |
| 18 Nov 2026 | `9e8c5ef9` | #489 (Claude W12-d36) | main moved while Z12-43 built; merged into #490 |
| 18 Nov 2026 ~21:30 IST | `4aa28299` | #490 (Z12-43) | unblocks Z12-52 (still waits #486); device [44336404989](https://github.com/thefitbud/thefitbud/actions/runs/44336404989) |
| 19 Nov 2026 ~00:00 IST | `21792a2e` | #492 (Z12-30) | delete/reactivate web; CI green; fresh review PASS after D-W12C-21 |
| 19 Nov 2026 ~00:00 IST | `e679b85d` | #493 (ledger) | mark Z12-30 merged |
| 19 Nov 2026 ~12:40 IST | `df709196` | #494 (ledger) | D-W12C-22 Claude lane → Cursor |
| 19 Nov 2026 ~13:15 IST | `1272b972` | #486 (Z12-51) | unblocks Z12-52 / Z12-53; review PASS |

*(Append each Cursor merge and each Claude merge that unblocks a Cursor task.)*

## Decisions (this run)

| ID | Decision | Reason | When |
|---|---|---|---|
| D-W12C-1 | Cursor edits `W12-cursor.md` as its batch file. **Narrowed 19 Nov (D-W12C-22):** may also edit `W12.md` only for status of handed Claude tasks and Z12-60’s Report section. | Handover from FitBud UI, 18 Nov 2026; narrowed 19 Nov | launch; narrowed |
| D-W12C-2 | At most 2 Cursor implementers at once | Same runners as Claude (up to 3); handover rule | launch |
| D-W12C-3 | ~~Strongest available model for Z12-43, Z12-48, Z12-58 and every fresh review~~ | Superseded by D-W12C-17 (Firoz, 18 Nov 2026) | launch; superseded |
| D-W12C-4 | Z12-43: `saveToMyFoods` is `z.boolean().optional()`; the server reads "not false" as true (D-W12-24's default) | A Zod `.default(true)` makes the field required in the inferred `LoggedFoodItem` type and breaks every client literal; behaviour is the same. *(Firoz’s 18 Nov addendum also wanted ID D-W12C-4 for the Z12-53 handoff; that handoff is D-W12C-16 below.)* | Z12-43 |
| D-W12C-5 | Z12-43: a custom food's kcal and macros are stored and totalled at the nutrient scale (×1,000,000); before, protein, carbs and fat went through `scaleMacro` (×100) and read back near zero | Bug found while testing D-W12-24. New rows only; older `trainee_custom_foods` rows keep the old macro scale (no migration, no rewrite of history). *(Firoz’s addendum also wanted ID D-W12C-5 for the model rule; that rule is D-W12C-17 below.)* | Z12-43 |
| D-W12C-6 | Z12-43: a changed portion (TR-08b) and an ate-out kcal (TR-08c) now carry their lines into the logged totals, so the ring counts them; only `logged_foods` ever saves a food to "my foods" | TR-08c "exact kcal" and TR-07e's "Ate out · 1,120 kcal" need a backend total; no schema change | Z12-43 |
| D-W12C-7 | Z12-43: library lines in `itemsJson` now also store name, serving label, kcal and macros, so Recent and the coach view read the food without a library lookup | Recent needs the serving and kcal (TR-26a); additive JSON fields, old rows still parse | Z12-43 |
| D-W12C-8 | Z12-43: TR-26e "Add" logs the meal at once with the created food (tap map: TR-26e Add → TR-26f), not back to the tray | Tap map | Z12-43 |
| D-W12C-9 | Z12-43: the TR-26f toast travels through a small module store (`trainee/food/mealSavedNotice.ts`) that Diet takes on its next render; no change to `TraineeOverlay.tsx` or `TraineeShell.tsx` (Claude PRs #487, #483 hold them) | The food search is a fullscreen overlay, so Diet remounts after it; the notice expires after 15 s so it never pops up out of context | Z12-43 |
| D-W12C-10 | Z12-43: the toast's View opens a read-only logged-meal sheet (`trainee/food/LoggedMealSheet.tsx`); TR-07g's Edit foods and Delete stay out | TR-07g edit/delete has no task in this run (F09 notes delete-log as not built) | Z12-43 |
| D-W12C-11 | Z12-43: TR-26c's Meal row is shown but static | Tap map marks it `LATER: meal picker` | Z12-43 |
| D-W12C-12 | Z12-43: offline, the food search filters the plan and recent foods already loaded on the phone ("Offline. Showing foods saved on your phone.") | There is no full offline food index on mobile; TR-26d's copy is true for these foods | Z12-43 |
| D-W12C-13 | Z12-43: "Changed the portion" loses its old note field and uses ½ steps; the unit under each stepper is the serving label without its leading "1 " | TR-08b mock has no note and says "Steps are ½"; the plan carries serving labels, not unit nouns | Z12-43 |
| D-W12C-14 | Z12-43: `custom: true` on loggedItems only for `logged_foods` (`allowSaveToMyFoods`); ate-out / portion lines keep kcal totals without the coach "Add to my food library" cue | Fresh review #490 FAIL: TM-12b / MealPanel treated ate-out as a custom food | Z12-43 review fix |
| D-W12C-15 | Z12-43: Something different sheet wraps itself in `ThemeScope scheme="system"` and uses `flexGrow/flexShrink: 0` (not `flex: 0`) for sheet sub-screens | Expo-web capture: dark sheet stayed light; `flex: 0` collapsed TR-08b/c on web | Z12-43 capture follow-up |
| D-W12C-16 | **Z12-53 handed to Cursor** (Firoz, D-W12-39). Start only after Cursor’s Z12-52 and Claude’s #486 (Z12-51) are on `main`. JS + server only; native → Z12-57 list. WorkspaceHeader D-W12-26; expo-push title/body for D-W12-38; F22–F28 self-setup state (D-W12-37). Post merge SHA promptly (Claude’s Z12-57 waits). Addendum labelled this **D-W12C-4**; that ID was already used by Z12-43, so recorded here. | Firoz addendum, 18 Nov 2026 (IST) | 18 Nov 2026 |
| D-W12C-17 | **Model rule (replaces D-W12C-3):** only subscription-included models; default Cursor Auto for implement and review; cheapest included for docs/ledger/small follow-ups/Z12-59 prep; switch included model only after the default fails the same task twice; Model column = model actually used. Never Max / usage-billed / pay-per-request. Keep lean (no re-run without a code change; no one-commit CI churn; reviews scoped to the diff). Addendum labelled this **D-W12C-5**; that ID was already used by Z12-43, so recorded here. | Cursor usage high; Firoz, 18 Nov 2026 (IST) | 18 Nov 2026 |
| D-W12C-18 | Z12-30: `auth-flow.ts` + `archivedAccount.ts` outside `files_owned` — keep the web session on `ACCOUNT_ARCHIVED` and throw `ArchivedAccountError` so Reactivate can call the API (clearing the session broke the AC). | Decide-and-note | Z12-30 |
| D-W12C-19 | Z12-30: delete fresh proof uses a one-off `FitBudApiClient` with the password-login bearer and `credentials: "omit"` so the cookie cannot override `auth_time` (middleware prefers cookie `created_at`). Cookie-session Firebase `auth_time` on `createWebSession` stays a W6 API follow-up. | Spec gap + D-W6-31 | Z12-30 |
| D-W12C-20 | Z12-30: reactivate footer shows "Signed in as {email}" from the frame; omit "archived Tue 3 Nov" (not in `accountReactivationCopy`). Colocated CSS files for the modal and reactivate shell. | Frame vs D-W12-6 copy | Z12-30 |
| D-W12C-21 | Z12-30 review fix: `SignInPage` shows `sessionError`; `RequireAuth` sends token-less session errors to `/sign-in` (not the "Can't reach FitBud" retry panel) so `RECENT_SIGN_IN_REQUIRED` after reactivate matches mobile. | Fresh review #492 | Z12-30 |
| D-W12C-22 | **Claude’s W12 lane handed to Cursor** (Firoz via FitBud UI, 19 Nov 2026 IST). Covers Z12-45 #484, Z12-46 #483, Z12-51 #486, Z12-44 follow-up #485, Z12-57 and Z12-60. Keep existing `claude/…` branches and PRs for those four; create `cursor/z12-57-native-db78` and `cursor/z12-60-report-db78` when those start. Poll timer `w12-cursor-poll-blockers` stopped. Device runs: record exact `gh workflow run device.yml …` at ready-for-device and continue; FitBud UI / Firoz dispatches. Order: #486 → #483 → #485 → #484 → own Z12-48/49fu/52/53 → Z12-57 → Z12-58 → Z12-59 prep → Z12-60. | Claude out of usage; Firoz approved | 19 Nov 2026 |

*(Add implementer decide-and-note choices here as they arise.)*

## Native items for Z12-57

*(JS-only tasks that discover a native need: exact file, behaviour, and why the JS fallback is insufficient. Z12-57 consumes this list.)*

| Source task | Item | Detail | JS fallback until then |
|---|---|---|---|
| #484 Z12-45 | Rest-end haptic + sound | `haptics.ts` `restEndHaptic` → `expo-haptics`; rest-end sound; Android `VIBRATE` | no-op / silent JS |
| #484 Z12-45 | Keep-awake in active workout | `activateWorkoutKeepAwake` → `expo-keep-awake` | no-op |

## Follow-ups

| Source | Finding | Owner | Notes |
|---|---|---|---|
| Z12-43 | Device [44336404989](https://github.com/thefitbud/thefitbud/actions/runs/44336404989) PASS after soft-skip+center F08; prior fails were Progress mis-tap / `4 of 4 logged` | done | merged `4aa28299` |
| Z12-43 | A meal logged from Today (Something different → Log it myself) returns to Today, which shows no TR-26f toast | Cursor (Today owner) | `TodayTab.tsx` is outside Z12-43's files; it can read `useMealSavedNotice` the way Diet does |
| Z12-43 | The coach edit path (`PUT` compliance) still keeps items only for `logged_foods`, so a coach edit of an ate-out entry drops its kcal | Z12-52 | `apps/api/src/routes/meals.ts` coach branch; D-W6-40 |
| Z12-43 | Something different dark was GAP on Expo web (sheet outside Diet ThemeScope); fixed in-sheet with ThemeScope (D-W12C-15) — re-capture dark TR-08a–c to confirm CLOSE | this PR / device | was listed for Z12-52; product fix is in SomethingDifferentSheet |
| Z12-30 | Cookie session still uses `web_sessions.created_at` as authTime (API); UI avoids it for delete by bearer+omit. True Firebase `auth_time` on cookie sessions needs an API change outside `files_owned`. | W6 / API | do not weaken UI proof |

*(Z12-58: Claude-owned-area findings go here with clear repro; Cursor-owned-area findings are fixed in this run.)*

## Usage wrap-up

- **Wrap at ~92%:** record what merged, what remains, models used.
- **Usage at last update:** not recorded yet (launch).

## Device-run queue (FitBud UI / Firoz)

*(When a task is ready for device, append the exact command here and in the PR. Do not dispatch from this agent.)*

| Task | Command | Recorded |
|---|---|---|
| Z12-46 #483 | `gh workflow run device.yml -R thefitbud/thefitbud --ref main -f ref=claude/Z12-46-today-progress -f flows=launch,z12-46,z12-38` | **PASS** [44478196249](https://github.com/thefitbud/thefitbud/actions/runs/44478196249) on `fcbdcd52` (FitBud UI, 71 shots) |
| Z12-44fu #485 | `gh workflow run device.yml -R thefitbud/thefitbud --ref main -f ref=claude/Z12-44-flows-weekday -f flows=launch,z12-44,device/z12-36/3-trainee-workout.yaml` | running [44484383185](https://github.com/thefitbud/thefitbud/actions/runs/44484383185) on `f3fedc2f` (FitBud UI started) |
| Z12-46fu | `gh workflow run device.yml -R thefitbud/thefitbud --ref main -f ref=cursor/z12-46fu-pixel-db78 -f flows=launch,z12-46` | (record when ready) |

## Done when (Cursor side)

1. Every row in the task table is merged, with PR + merge SHA filled (including handed Claude PRs and Z12-57 / Z12-60).
2. Z12-59 prep is in `docs/tasks/manual-steps.md` and this ledger is marked **ready for Z12-60**.
3. Z12-60 writes the W12 report in `W12.md` and merges.

