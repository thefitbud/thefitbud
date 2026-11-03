---
id: ZB2
title: Migration: global check-in form v2 (insert-only), new assignments use v2
batch: W6
depends_on: [ZB1]
lane: migrations
files_owned:
  - apps/api/drizzle/*.sql
  - apps/api/drizzle/meta/*.json
  - apps/api/src/db/schema.ts
  - apps/api/src/db/migration-chain.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
A v2 of the global check-in form exists with standard question keys, past check-ins stay on v1, and every new check-in assignment uses v2.

## Context
- Covers master-list (v13) items B2a, D2 (locked, option A). Everything the implementer needs from those rows is pasted here.
- D2 (locked 23 Oct, option A): v2 by a new migration; the insert-only trigger on form versions is kept; past check-ins stay on v1.
- The global form fields were added in `apps/api/drizzle/0029_checkin_form_global_fields.sql`; the insert-only trigger was created in `apps/api/drizzle/0019_checkin_form_templates.sql`.
- v2 content: weight (kg, key `weight`), measurements (keys `waist`, `hips`, `chest`, `arm`, `thigh`; the trainer picks a subset in W8), photos (`photo_front`, `photo_side`, `photo_back`), ratings 1–5 `energy`, `sleep_quality`, `stress`, `hunger`, and free text `notes`. ZB6 adds the validation.
- Migration number: the next free number when the task starts from `main` (expected order after ZA4's 0034: ZB1 0035, ZB2 0036, ZB3 0037, ZB4 0038). Remote application is done after merge by the batch's coding agent or FitBud UI (manual list P2); the agent runs migrations locally only.

## Gap list
- `apps/api/src/db/schema.ts:801`: `checkin_form_versions` has no standard key per question.
- `apps/api/drizzle/0029_checkin_form_global_fields.sql` defines v1 only.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The migration inserts v2 of the global form (no UPDATE of v1; the trigger still rejects updates — test it).
- [ ] Question JSON in v2 carries `key` for every standard question.
- [ ] Assignments created after the migration reference v2; existing check-ins still reference v1 (test both).
- [ ] Migration chain test passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Validation and progress series (ZB6, ZB7).
- Form builder UI (W8).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/db/migration-chain.test.ts`: v2 present, v1 untouched, trigger still blocks UPDATE.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W6.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
