---
id: ZA1
title: Visual-diff and design-review step on the QA1 nightly screenshots
batch: W5
depends_on: []
lane: qa-tools
files_owned:
  - scripts/qa/visual/**
  - .github/workflows/design-review.yml
  - docs/runbooks/design-review.md
frames: []
model: sonnet
size: M
---

## Outcome
Every nightly QA1 run, and any task that asks for it, produces a per-screen report that sets each screenshot beside its design frame, scores the pixel difference and runs the design-guide checks, so Firoz and the agents see which screens drift from the frames without opening them one by one.

## Context
- Covers master-list (v13) items P6 (per-batch gap-list QA gate, now automated). Everything the implementer needs from those rows is pasted here.
- QA1 (open PR #147, specs QT1–QT9) adds `.github/workflows/qa.yml`, the Maestro and staging Playwright suites, and `scripts/qa/summarize*.mjs` (QT8), which uploads the screenshots as a workflow artifact. ZA1 builds on that output and never edits a QA1-owned file (`qa.yml`, `scripts/qa/summarize*.mjs`, `scripts/qa/fixtures/**`).
- D-W5-2: the diff uses ImageMagick `compare -metric AE -fuzz 8%` and `montage`, which are preinstalled on `ubuntu-latest`; no npm dependency, `pnpm-lock.yaml` does not change. D-W5-3: a separate workflow `design-review.yml` runs on `workflow_run` of `qa.yml` (completed, branch `main`) and on `workflow_dispatch`, downloads the screenshots artifact, and uploads `design-review` as its own artifact. It is advisory: it never fails a PR.
- Frame mapping: `scripts/qa/visual/frame-map.json` maps each screenshot name (QA1's Maestro/Playwright naming, e.g. `trainee-today-partial-android`) to one or more frame files in `docs/design/mockups/png/` and a viewport. Unmapped screenshots are listed, not failed.
- Design-guide checks (text, from the captured DOM or the accessibility tree that QA1 saves next to each screenshot when present): ISO dates (`\b20\d\d-\d\d-\d\d\b`), snake_case tokens that match a value in `packages/core/src/labels.ts`, `%` next to a number, the words in `docs/spec/banned-strings.json`, and tap targets under 44 px when bounds are available.
- Local use by implementers (D-W5-3): `node scripts/qa/visual/diff.mjs --task <ID>` compares `docs/qa/<ID>/*.png` against the frames named in that task's spec front matter and writes `docs/qa/<ID>/design-review.md`. That is the design-review step every W7–W11 UI spec cites.

## Gap list
- No visual comparison exists: `.github/workflows/ci.yml:135-184` runs the local Playwright e2e only, with no screenshot step.
- `docs/qa/README.md` index has no design-review report type; screenshots in `docs/qa/<ID>/` (e.g. `docs/qa/BT3/`) are checked by eye only.
- QA1 (not yet merged) produces screenshots but compares nothing against `docs/design/mockups/png/` (267 frames).
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `node scripts/qa/visual/diff.mjs --task <ID>` reads the spec's `frames:` list, pairs each capture by frame name, resizes the capture to the frame's pixel size, and writes a Markdown table: screen, frame, diff score (changed pixels %, shown only in the report, never in the product), side-by-side PNG path, and design-guide findings.
- [ ] `node scripts/qa/visual/diff.mjs --artifact <dir>` does the same for a QA1 screenshots folder using `frame-map.json`, and writes `summary.md` sorted worst first.
- [ ] Missing ImageMagick, a missing frame or an unmapped screenshot is reported in the summary and exits 0; a script error exits 1.
- [ ] `design-review.yml` triggers on `workflow_run` of `qa.yml` (completed) and `workflow_dispatch`, has `permissions: contents: read, actions: read`, uses no secret, and uploads the `design-review` artifact with 14-day retention.
- [ ] `docs/runbooks/design-review.md` says how to run it locally, how to read the scores (under 3% normally matches; 3–12% check by eye; over 12% likely a gap), and how a finding becomes a task.
- [ ] `actionlint` passes on the new workflow.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Editing QA1-owned files or making the design review a required check.
- Any change to app code or frames.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `scripts/qa/visual/diff.test.mjs` (node:test): pairs captures to frames from a fixture spec; flags an ISO date, a raw enum (`body_weight_kg`), a `%` and a banned string from fixture text; reports unmapped files without failing.
- `scripts/qa/visual/fixtures/**`: two tiny PNGs (identical and different) to assert the score is 0 and above 0.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- QA1 (PR #147) is not merged, or its screenshot artifact name or file naming differs from QT8's spec so the map cannot be written; report the actual names.
- ImageMagick is not on `ubuntu-latest`, and a dependency would be needed.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
