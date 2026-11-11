# W9b · Fix-up after W9: Workout tab opens on today

**Status:** Ready to run (Firoz, 11 Nov 2026, launched in the W9 orchestrator session). Same rules as W9 (AGENTS.md, CLAUDE.md, [W9.md](W9.md)). Runs before W10.
**Source:** Firoz's W9b brief (11 Nov 2026), from the W9 report follow-ups.
**Goal:** the trainee Workout tab opens on today, without a duplicate "Workout" title. Two superseded-frame notes record what W9 decided about frames 93/95 and 208.
**Launch rule:** `main` green (ci, e2e, banned-strings) on 8b2bd537 or later before any code merge. #365 merged after a red main e2e, so no merges while main is red. If a real failure shows up, fix it first as **Z9b-0**.
**IDs:** `Z9b-<n>`.

## Decisions
- **D-W9b-1 Steps privacy copy (frames 93, 95):** steps **are** shared with the coach (the trainer sees daily steps). The frames' line "Steps stay on your phone and aren't shared with your coach" is false. The copy Z9-10 shipped is correct: "FitBud reads your daily step count from {Apple Health | Health Connect} and shares the daily total with {coach}." Decided by Firoz, 11 Nov 2026. The PNGs are not repainted; see the notes in `docs/design/README.md` and `DESIGN-NOTES.md` › "Superseded by (W9b, 11 Nov 2026)".
- **D-W9b-2 Client ⋯ menu (frame 208):** "Add note" is deliberately left out of the client header overflow menu. Notes are added from Overview. This confirms what Z9-13 shipped. Decided by Firoz, 11 Nov 2026.
- **D-W9b-3 Lanes (planner):** workout (`WorkoutTab.tsx`, `WorkoutTab.week.test.tsx`, `TraineeShell.tsx`, plus the `FOCUS_DATE` fixture lines in `WorkoutTab.render.test.tsx` and `workout/coach-logged/WorkoutTab.gating.test.tsx`), steps-copy (`trainee/settings/StepsSettingsScreen.tsx`, only if reachable), ci (`.github/workflows/ci.yml`, Z9b-0). Z10-15 and Z14-20 are not touched.

## Questions for Firoz
- None.

## Lanes
| Lane | Tasks |
|---|---|
| ci | Z9b-0 |
| workout | Z9b-1 |
| steps-copy | Z9b-2 (conditional) |

## Order
1. Confirm main is green; re-run banned-strings and e2e. **Done 11 Nov 2026:** the re-run failed the same way (apt DNS from the runners), so Z9b-0 runs first and merges as the fix for red main (the only merge allowed while main is red).
2. Z9b-1 and Z9b-2 in parallel (no shared files).
3. Write the report, then stop. Do not start W10.

## Specs
- [Z9b-0](../Z9b-0.md) Run the e2e and banned-strings jobs in the Playwright image (apt mirrors unreachable from the runners keep main red).
- [Z9b-1](../Z9b-1.md) Workout tab opens on today; no duplicate "Workout" title.
- [Z9b-2](../Z9b-2.md) Remove the false steps privacy line from StepsSettingsScreen, only if the screen is reachable.

## Done when
- [x] The report names the SHA that includes Z9b-1 (8f816c80) for Firoz's iOS and Android builds. Main CI is green on 8f816c80 (run 43068577638).
- [x] Z9b-1 merged with iOS 393x852 and Android 412x915 captures under `docs/qa/Z9b-1/`.
- [x] Z9b-2 recorded as unreachable.

## What Firoz does
- Runs the iOS and Android builds from the main SHA in the Report.

## Report (filled in by the orchestrator at the end)

Run by the W9 Claude Code orchestrator session, 11 Nov 2026. Nothing was deployed and no remote commands were run. Z10-15, Z14-20 and #307 were not touched. W10 was not started.

**Main SHA for Firoz's iOS and Android builds: `8f816c80335f01f6e823cd7f6706e45fc96b0ba2`** (the Z9b-1 merge). Main CI is green on it (run 43068577638: ci, e2e and banned-strings).

### Merged

| Task | PR | Merge SHA | Review |
|---|---|---|---|
| Z9b-0 Run CI e2e and banned-strings in the Playwright image | #379 | 3965d8118a8564846622ecd24a22544e0e45a946 | PASS (fresh Opus reviewer) |
| W9b planning (W9b.md, Z9b-0/1/2, D-W9b-1/2) | #377 | aca8db521a3a7c0dd551f7e1a881fbfe9e5ee7fb | FAIL (Z9b-1 would drop the bell; Z9b-2 `model: haiku` invalid) → fixed → merged |
| Z9b-1 Workout tab opens on today; one Workout title | #378 | 8f816c80335f01f6e823cd7f6706e45fc96b0ba2 | PASS first round (3 mutation checks) |

### Main CI
- At 8b2bd537, main was red: `ci` passed, `banned-strings` failed and `e2e` was cancelled at 45 min, both in `playwright install --with-deps`. apt on the GitHub runners got "Temporary failure resolving" for azure.archive.ubuntu.com, archive.ubuntu.com and security.ubuntu.com (exit code 100). It had been red since #373, and every W9 merge after that was made with `e2e` and `banned-strings` skipped on mobile-only PRs.
- A re-run of the failed jobs about 1.5 h later failed the same way, so this was treated as a real failure: **Z9b-0**.
- **Z9b-0 decision:** pinning `ubuntu-24.04` failed the same way ("noble"), so the problem is the runners' DNS, not the image. The `e2e` and `banned-strings` jobs now run in `mcr.microsoft.com/playwright:v1.64.1-noble` (the tag matches the locked `playwright@1.64.1`), and `--with-deps` is gone.
- On the PR, e2e ran 80 of 80 (the same count as main before) and banned-strings matched main (1 passed, 1 pre-existing skip). Main went green on 3965d811 (run 43065796375).
- Z9b-0 merged while main was red, because it was the fix for red main (the only exception). The plan and Z9b-1 merged only after main was green.
- To clear the queue, the orchestrator cancelled stale optional QA runs for already-merged W9 PRs, plus the superseded Z9b-0 run.

### Not done
- **Z9b-2: no change.** `StepsSettingsScreen.tsx` is unreachable: on 8f816c80 nothing in `apps/` or `packages/` imports it. The false line "Steps stay on your phone and aren't shared with your coach" remains in that dead file only. The live steps setup (`trainee/steps/StepsSetupView.tsx`, Z9-10) carries the correct copy (D-W9b-1). Deleting the dead file is a follow-up.

### Decisions (decide-and-note)
- **Z9b-1 bell.** Dropping the shell's `AppTopBar` on the Workout tab would have lost the notifications bell. As Diet does, WorkoutTab now draws its own 44 pt bell (unread dot, label "Notifications") in its title row, matching frame 10. The sync entry is no longer on the Workout tab; More still has it, as for Diet.
- **Z9b-1 test fixtures.** `WorkoutTab.render.test.tsx` and `workout/coach-logged/WorkoutTab.gating.test.tsx` pinned `FOCUS_DATE` to the Saturday, so they broke once the tab opened on today. Their fixture lines were added to Z9b-1's `files_owned` in the plan, and only `FOCUS_DATE` changed (to today), with no assertion touched. The reviewer confirmed this.
- **Z9b-1 default focus** is `pickedDate ?? selectedDate ?? today`. The shell passes `selectedDate` (today by default), so a day chosen on Today, or set by the shell's open-workout paths, carries into Workout. This also fixes a latent bug: those paths used to show Saturday when they picked today.
- **Planning review.** The plan's later commits (adding Z9b-0, the container approach, the extra `files_owned`) were made by the orchestrator after the review and were not re-reviewed separately. Each was a direct consequence of a reviewed decision or of CI evidence.
- **Models.** Implementer on Sonnet; reviewers on Opus; Z9b-0 written by the orchestrator (a two-line CI change).

### Follow-ups
- **Z9b-0 / CI:**
  - `qa.yml` (optional) still uses `--with-deps` and fails the same way while the mirrors are unreachable.
  - Keep the Playwright image tag in step with the locked `playwright` version (a small check or a Renovate group).
  - Optionally pin the image by digest, and add a container marker to the two jobs' cache key.
  - Revisit the container once the runners' apt DNS recovers.
- **Z9b-1:**
  - The bell sits level with the eyebrow line; the frame centres it on the large title.
  - The "Workout" title is smaller and lighter than the frame's (pre-existing).
  - Tab bar icons: Progress shows a calendar and More a person, where the frame has a line chart and "⋯" (shell, pre-existing).
  - The unread dot isn't asserted in tests.
  - The shell's timezone fallback is "UTC" while the tab's is "Asia/Kolkata", which matters only before `me` loads.
  - Captures show the seed's Wednesday rest day, so frame 10's hero and missed cards weren't compared.
- **Z9b-2:** delete the unreachable `StepsSettingsScreen.tsx` (needs an owner).

### Visual check

| Task | Captures | Frames to compare |
|---|---|---|
| Z9b-1 | `docs/qa/Z9b-1/` (iOS 393x852, Android 412x915; demo seed, not stubbed) | 10-trainee-workout-overview-ios |

Z11-1 is not on `main`. The reviewer compared the captures with the frame side by side; this is not a pixel-match claim.
