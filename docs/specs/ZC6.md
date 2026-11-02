---
id: ZC6
title: Side panel: resolve form with outcome chips, nudge limited, quiet-hours wait
batch: W7
depends_on: [ZC5]
lane: panel
files_owned:
  - apps/trainer-web/src/components/ExceptionDrawer.tsx
  - apps/trainer-web/src/components/side-panel/**
  - apps/trainer-web/src/components/ExceptionDrawer.test.tsx
frames:
  - { frame: "02-trainer-web-home-panel-v3-resolve-web.png", viewport: "1440x900" }
  - { frame: "131-trainer-web-home-panel-v3-nudge-limited-web.png", viewport: "1440x900" }
  - { frame: "199-trainer-web-exception-quiet-hours-web.png", viewport: "1440x900" }
model: sonnet
size: S
---

## Outcome
Inside the panel the trainer resolves with an outcome chip and a private note, sees when a nudge is limited, and sees a nudge wait for the client's quiet hours.

## Context
- Covers master-list (v13) items SP2, SP2b. Everything the implementer needs from those rows is pasted here.
- Nudge is a wa.me prefill only (no auto-send). Limited = the daily nudge cap reached; quiet hours = the client's notification quiet window; the panel shows when the nudge becomes available, in the client's local time with a zone label.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- `apps/trainer-web/src/components/ExceptionDrawer.tsx:252-264` and `:407-416`: nudge and quiet-hours logic render in the old drawer layout.
- `apps/trainer-web/src/components/ExceptionDrawer.tsx:522`: the ⋯ menu is not in the panel footer.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Outcome chips use `labelFor`; note is private and optional; Save resolves via the existing endpoint.
- [ ] Limited state matches 131; quiet-hours state matches 199 with a local time like "7:00 am (client's time, IST)".
- [ ] ⋯ menu holds the secondary actions; keyboard reachable.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Read-only and ended (ZC7).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `ExceptionDrawer.test.tsx`: chips, note, limited, quiet hours.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- The frames and viewports above. Capture each state to `docs/qa/ZC6/` (file name = frame name with the viewport), run the design-review step, and attach both to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W7.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
