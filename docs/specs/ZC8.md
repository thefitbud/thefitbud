---
id: ZC8
title: Side panel: multi-select with bulk Reviewed / Resolve and Undo
batch: W7
depends_on: [ZC7, ZB10]
lane: panel
files_owned:
  - apps/trainer-web/src/components/ExceptionDrawer.tsx
  - apps/trainer-web/src/components/side-panel/**
  - apps/trainer-web/src/components/ExceptionDrawer.test.tsx
frames:
  - { frame: "02-trainer-web-home-panel-v3-web.png", viewport: "1440x900" }
model: opus
size: M
---

## Outcome
The trainer selects several compatible items for one client and resolves them together with one outcome and note, sees per-item results, and can undo within 5 seconds.

## Context
- Covers master-list (v13) items SP4, D11. Everything the implementer needs from those rows is pasted here.
- D11: checkboxes only on missed workout / meal / log; pain/safety individual only. Confirm when more than 3 are selected. Per-item failure copy, e.g. "2 resolved, 1 already resolved elsewhere". Ended client: read-only, no bulk. Mark reviewed stays client-level.
- API: `POST /exceptions/bulk/resolve` and `/undo` from ZB10 via the api-client `exception-bulk` augment.
- Planned frame (not in the repo yet, Firoz designs it): DS2 bulk side panel (selection, confirm over 3, partial failure, Undo; web 1440x900, 4 frames). Until the PNG is in `docs/design/mockups/png/`, the parts that need it stop and report; the rest runs.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/trainer-web/src/components/ExceptionDrawer.tsx`: no selection state; resolve is single-item only.
- No client for the bulk endpoints in the UI yet (ZB10 adds them).
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Checkboxes appear only on compatible items; select-all selects compatible only.
- [ ] Confirm dialog above 3; one outcome + note sent once; per-item result line.
- [ ] Undo within 5 s restores all; after 5 s the button is gone.
- [ ] Ended clients show no checkboxes.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Bulk from Home rows.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `ExceptionDrawer.test.tsx`: selection rules, confirm, partial failure, Undo timing.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZC8/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- DS2 frames are not in the repo.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W7.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
