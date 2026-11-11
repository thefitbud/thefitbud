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
1. Confirm main is green; re-run banned-strings and e2e. **Done 11 Nov 2026:** the re-run failed the same way (apt DNS on the 26.04 runner), so Z9b-0 runs first and merges as the fix for red main (the only merge allowed while main is red).
2. Z9b-1 and Z9b-2 in parallel (no shared files).
3. Write the report, then stop. Do not start W10.

## Specs
- [Z9b-0](../Z9b-0.md) Pin the e2e and banned-strings runners to ubuntu-24.04 (apt DNS failures on 26.04 keep main red).
- [Z9b-1](../Z9b-1.md) Workout tab opens on today; no duplicate "Workout" title.
- [Z9b-2](../Z9b-2.md) Remove the false steps privacy line from StepsSettingsScreen, only if the screen is reachable.

## Done when
- [ ] Main is green on a SHA that includes Z9b-1, and the report names that SHA for Firoz's iOS and Android builds.
- [ ] Z9b-1 merged with iOS 393x852 and Android 412x915 captures under `docs/qa/Z9b-1/`.
- [ ] Z9b-2 merged, or recorded as unreachable.

## What Firoz does
- Runs the iOS and Android builds from the main SHA in the Report.

## Report (filled in by the orchestrator at the end)
