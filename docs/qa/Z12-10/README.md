# QA · Z12-10 · Plan empty, assign, diet scope, partial failure, plan-filtered

Spec: `docs/specs/Z12-10.md`. Batch: W12b (D-W12b-4 moves frame 200 here).

Captures at 1440×900, demo seed, `rahul.coach@demo.fitbud.test`. Script: `capture.mjs` (API :8788, web :5174).

Design-review tool: not run here (optional; reviewer compares captures to frames side by side).

## Grades

| Frame | Grade | Notes |
|---|---|---|
| 151 empty | **CLOSE** | Empty card + CTAs match. Header still shows "Set up coaching" / "Not available" / missing goal·joined — those live in `WorkspaceHeader` (out of `files_owned`). |
| 155 assign | **CLOSE** | Start Mon / today / pick + civil date + Ends + Publish match the frame. Publish-issues notes and replace banner still appear when the draft has consistency notes (frame is quieter). |
| 156 diet scope | **CLOSE** | Modal chrome matches ("Apply this change to…", Cancel / Apply). Two API scopes only (`today_onward` / `today_only`); frame's third option "Only Thursdays" is not in `DietAdjustmentScope` — follow-up. |
| 157 partial failure | **MATCH** | Title, warning banner, Later / Retry reminders match. Capture uses `?assignPartial=1` (no live reminder fault on seed). |
| 200 plan-filtered | **CLOSE** | All / Workout / Nutrition segment, Status: Superseded, Part column, N of M present. Seed shows "1 of 2/3" not frame's "1 of 5"; combined plans read as Workout under the Workout filter. |

## Tap-through

- Part segment All → Workout → Nutrition: `aria-pressed` updates; table filters.
- Status combobox → Superseded: API called with `versionStatus=superseded`; count updates.
- Assign dialog: Pick a date radio focuses; Publish focusable; Escape closes.
- Coral never used as a button.

## Capture paths

Demo query params for unaudited states (no seed fault):

- `?assign=1` — assign modal when a draft exists
- `?dietScope=1` — diet-scope modal (frame 156)
- `?assignPartial=1` — partial-failure modal (frame 157)
