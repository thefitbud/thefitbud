# Design review runbook

How the design-review step compares screenshots with the locked frames in `docs/design/mockups/png/`. Decisions: D-W11-2 (ImageMagick, no npm dependency, advisory), D-W11-3 (separate workflow plus a local command), D-W11-F6 (every UI PR attaches the report). Task: Z11-1.

The report is advisory. It is not a required check and never fails a PR. The scores are a review aid and never appear in the product (no percentages in the UI).

## Run it locally (UI tasks)

1. Capture the screens at the frame's viewport into `docs/qa/<ID>/` (AGENTS.md, "Visual check"). Name each capture after its frame plus the viewport, for example `35-trainer-mobile-exception-more-sheet-ios-393x852.png` or `179-client-ended-1440x900.png`. The leading number is what pairs it with its frame.
2. Run, from the repo root:

   ```bash
   node scripts/qa/visual/diff.mjs --task <ID>
   ```

3. It reads the `frames:` list in `docs/specs/<ID>.md`, pairs each capture with a frame (exact name first, then the same number prefix, preferring the same platform and viewport), fits the capture to the frame's pixel size and writes:
   - `docs/qa/<ID>/design-review.md`: one row per screen, worst first, with the frame, the diff score, the side-by-side image and the design-guide findings.
   - `docs/qa/<ID>/design-review/*.png`: each image is frame, capture and difference side by side (small, 8-bit).
4. Commit `design-review.md` and attach it to the PR next to the captures. The side-by-side images are small enough to commit with them.

A capture with no frame by name or number is listed under "Unmapped screenshots". It is not an error. A spec frame with no capture is listed under "Warnings": capture it or say in the PR why it is not built.

Optional text checks: put a `.txt` (the visible text) or a `.json` (an accessibility tree or DOM dump with `text`, `label`, `bounds` and `clickable` fields) next to a capture, same base name. The report then flags ISO dates, raw enum values that appear in `packages/core/src/labels.ts`, `%` next to a number, the patterns in `docs/spec/banned-strings.json` and tap targets under 44 px. Without a text file the findings column says "no text captured".

Needs ImageMagick (`compare`, `montage`, `convert`, `identify`; IM 6 or 7). Without it the script still pairs and checks text, says "ImageMagick not available" in the report and exits 0. Exit 1 means a script error (bad arguments, missing captures folder).

## The nightly report

`.github/workflows/design-review.yml` runs after the `QA` workflow (`qa.yml`) completes on `main`, and by hand (Actions, Design review, Run workflow, with the QA run id). It downloads that run's `qa-report` artifact (it holds `screenshots/mobile/` for Android, `screenshots/ios/` and `screenshots/web/`), runs `node scripts/qa/visual/diff.mjs --artifact qa-report --out design-review` and uploads the `design-review` artifact for 14 days: `summary.md` (worst first, also in the run's job summary) and `side-by-side/`. It uses no secret and only reads.

Screenshot names come from the QA suites (`trainee-today__loaded`, `web-clients__list`). `scripts/qa/visual/frame-map.json` maps each name to one or more frames; where an Android and an iOS frame both exist the one for the suite's platform is used. It mirrors the tables in `apps/mobile/.maestro/README.md` and `apps/trainer-web/playwright.staging.config.ts`. When a flow or a mapping there changes, change the JSON too. A screenshot with no entry falls back to the frame recorded in the report's `summary.json`, and is otherwise listed as unmapped. The nightly artifact has no text files, so only the pixel score applies there.

## Reading the scores

The score is the share of pixels that differ from the frame after the capture is fitted to the frame (`compare -metric AE -fuzz 8%`). Frames are 2x or 3x and use demo data, so text and photos never match exactly.

| Score | Read it as |
|---|---|
| under 3% | normally matches |
| 3% to 12% | check by eye in the side-by-side image |
| over 12% | likely a gap: layout, copy or a state differs |

Remember what moves the number without being a defect: demo names and dates, scroll position, a taller capture (only the top part is compared; the note says so), platform chrome on a capture paired by number prefix, the QA accounts' generated data. Compare layout, hierarchy, copy and states, not names or dates.

## From a finding to a task

- A difference the spec explains (a state the frame does not show, data that differs) is noted in the PR and nothing else.
- A difference the spec does not explain is fixed in the same PR, or listed in the PR as a follow-up. It is never silently left.
- A pattern that repeats in the nightly report (the same screen over 12% on two nights, or any design-guide finding) becomes a task row in `docs/tasks/` with the screen, the frame, the score and the side-by-side image. A raw enum, ISO date, percentage or banned string is a bug against `docs/spec/01-product-rules.md`.
- A mapping that is wrong (the frame is for a different state) is a fix to `frame-map.json`, not a finding against the app.
