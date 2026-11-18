# W12-cursor · Cursor run for remaining W12 tasks

**Status:** Running. Launched 18 Nov 2026 (IST) by FitBud UI, from `main` at `58ac1b11` (or later).
**Authority:** this file for Cursor-owned work only. Claude owns [`W12.md`](W12.md) — never edit it from this run. W12b is finished ([`W12b.md`](W12b.md)); leave it alone.
**Repo rules:** `CLAUDE.md`, `AGENTS.md`. Design: `docs/design/v3/` (mocks win over older frames; record departures).
**Branch prefix:** `cursor/<task>-<slug>-db78`. One task, one PR, merge commits only.
**Concurrency:** at most **2** Cursor tasks at once (Claude uses up to 3 on the same runners). Never cancel or force-cancel any Actions run.
**Claude fence:** never push to, review, comment on, rebase or merge a `claude/` branch or PR. Open Claude PRs at launch: #460 (Z12-42), #483 (Z12-46), #484 (Z12-45), #485 (Z12-44 follow-up), #486 (Z12-51), #487 (Z12-29). Claude also keeps Z12-53, Z12-57, Z12-60.
**JS only:** native / Swift / Expo-SDK changes go under **Native items for Z12-57** below. No deploy. No repo-settings changes.

## Task list and status

| Task | Wait | Status | PR | Merge SHA | Grades / notes | Model |
|---|---|---|---|---|---|---|
| Z12-W12C-0 Ledger | — | merged | #488 | `893691c3` | this file | lighter (docs) |
| Z12-43 Manual food logging | #460 (Z12-42) merged `4982d567` | CI green; review PASS; waiting device | #490 | — | Expo web CLOSE for TR-26a–f (both themes) and TR-08a–c light; TR-08a–c dark GAP (sheet renders light, no ThemeScope in the overlay host) and TR-08b/c need a web-only `flex: 0` CSS harness (`docs/qa/Z12-43/web/README.md`); iOS/Android pending device dispatch (Cursor token 403) | strongest (opus) + opus review |
| Z12-30 Delete account (web) | #487 (Z12-29) | blocked | — | — | fresh proof = Firebase `auth_time` (W6 follow-up) | lighter / sonnet |
| Z12-48 Live Activity (JS) | #484 (Z12-45) | blocked | — | — | rest to the second; finding 1 JS side | strongest |
| Z12-49 follow-up Ended-coaching tab bar | #484 (Z12-45) | blocked | — | — | small; tab bar must show on ended screen | lighter |
| Z12-52 Coach logs a meal | Z12-43 + #486 (Z12-51) | blocked | — | — | each What-changed option = own screen; Z12-42 sheet theme fix | sonnet / opus |
| Z12-58 Full device pass | Z12-57 (Claude) | blocked | — | — | F01–F29 + parity matrix + device checklist | strongest |
| Z12-59 prep | after Z12-58 | blocked | — | — | SHA, migrations, commands, smoke in `docs/tasks/manual-steps.md`; then mark ready for Z12-60 and stop | lighter |

## Merged-SHA ledger

| When (IST) | SHA | Via | Notes |
|---|---|---|---|
| 18 Nov 2026 (launch ~16:07 IST; #470 merge was earlier that day) | `58ac1b11` | #470 (already on main at launch) | Cursor run base |
| 18 Nov 2026 | `4982d567` | #460 (Z12-42, Claude) | unblocks Z12-43; its branch starts here |
| 18 Nov 2026 | `893691c3` | #488 (Z12-W12C-0) | Cursor ledger on main |
| 18 Nov 2026 | `9e8c5ef9` | #489 (Claude W12-d36) | main moved while Z12-43 built; merged into #490 |

*(Append each Cursor merge and each Claude merge that unblocks a Cursor task.)*

## Decisions (this run)

| ID | Decision | Reason | When |
|---|---|---|---|
| D-W12C-1 | Cursor edits only `W12-cursor.md` as its batch file; never `W12.md` | Handover from FitBud UI, 18 Nov 2026 | launch |
| D-W12C-2 | At most 2 Cursor implementers at once | Same runners as Claude (up to 3); handover rule | launch |
| D-W12C-3 | Strongest available model for Z12-43, Z12-48, Z12-58 and every fresh review; lighter for ledger and small follow-ups | Handover model rule | launch |

| D-W12C-4 | Z12-43: `saveToMyFoods` is `z.boolean().optional()`; the server reads "not false" as true (D-W12-24's default) | A Zod `.default(true)` makes the field required in the inferred `LoggedFoodItem` type and breaks every client literal; behaviour is the same | Z12-43 |
| D-W12C-5 | Z12-43: a custom food's kcal and macros are stored and totalled at the nutrient scale (×1,000,000); before, protein, carbs and fat went through `scaleMacro` (×100) and read back near zero | Bug found while testing D-W12-24. New rows only; older `trainee_custom_foods` rows keep the old macro scale (no migration, no rewrite of history) | Z12-43 |
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

*(Add implementer decide-and-note choices here as they arise.)*

## Native items for Z12-57

*(JS-only tasks that discover a native need: exact file, behaviour, and why the JS fallback is insufficient. Claude’s Z12-57 consumes this list.)*

| Source task | Item | Detail | JS fallback until then |
|---|---|---|---|
| — | — | — | — |

## Follow-ups

| Source | Finding | Owner | Notes |
|---|---|---|---|
| Z12-43 | Cursor cloud `ghs_` token cannot `workflow_dispatch` device.yml (HTTP 403) | Firoz / Actions write | #490: `gh workflow run "Device gate" --ref cursor/z12-43-manual-food-db78 -f flows='launch,z12-43' -f platforms=both -f themes=both -f extras=none` |
| Z12-43 | A meal logged from Today (Something different → Log it myself) returns to Today, which shows no TR-26f toast | Cursor (Today owner) | `TodayTab.tsx` is outside Z12-43's files; it can read `useMealSavedNotice` the way Diet does |
| Z12-43 | The coach edit path (`PUT` compliance) still keeps items only for `logged_foods`, so a coach edit of an ate-out entry drops its kcal | Z12-52 | `apps/api/src/routes/meals.ts` coach branch; D-W6-40 |
| Z12-43 | Something different dark was GAP on Expo web (sheet outside Diet ThemeScope); fixed in-sheet with ThemeScope (D-W12C-15) — re-capture dark TR-08a–c to confirm CLOSE | this PR / device | was listed for Z12-52; product fix is in SomethingDifferentSheet |

*(Z12-58: Claude-owned-area findings go here with clear repro; Cursor-owned-area findings are fixed in this run.)*

## Usage wrap-up

- **Wrap at ~92%:** record what merged, what remains, models used.
- **Usage at last update:** not recorded yet (launch).

## Done when (Cursor side)

1. Every row in the task table is merged (or blocked only on Claude work still open), with PR + merge SHA filled.
2. Z12-59 prep is in `docs/tasks/manual-steps.md` and this ledger is marked **ready for Z12-60**.
3. Claude’s Z12-60 writes the W12 report; Cursor stops after the ready mark.

