---
id: ZH5
title: Migration and API: coach-logged sets for one or many present clients, with Undo
batch: W12
depends_on: [ZH4, ZB1]
lane: api
files_owned:
  - apps/api/drizzle/*.sql
  - apps/api/drizzle/meta/*.json
  - apps/api/src/db/schema.ts
  - apps/api/src/db/migration-chain.test.ts
  - apps/api/src/routes/coach-logged-sets.ts
  - apps/api/src/routes/coach-logged-sets.test.ts
  - apps/api/src/routes/coach-logged-sets.authz.test.ts
  - apps/api/src/domain/coach-logged-sets.ts
  - apps/api/src/domain/coach-logged-sets.test.ts
  - packages/contracts/src/coach-logged-sets.ts
  - packages/api-client/src/coach-logged-sets-augment.ts
  - apps/api/src/index.ts
  - packages/contracts/src/index.ts
  - packages/api-client/src/index.ts
frames: []
model: opus
size: M
---

## Outcome
During or after a session, the trainer can log the same exercise's sets for one or many present clients in one action and undo it, feeding frames IP-12 to IP-14.

## Context
- Covers master-list (v13) items S2a. Everything the implementer needs from those rows is pasted here.
- D-W12-7 in `docs/specs/batches/W12.md`.
- Migration: a `logged_by` (`trainee` default, `coach`) and `session_entry_id` (nullable) on the existing set-log rows, using the load fields from W6 ZB1 (`load_kg`, `load_kind`); no new set table. Migration number: the next free number when the task starts from `main` (after W6's ZB16). Remote application to staging and production is done after merge by the batch's coding agent or FitBud UI (manual list P2); the implementer runs migrations locally only.
- `POST /sessions/:id/sets` with exercise id, set rows (reps, `load_kg` or Bodyweight) and a list of relationship ids; only clients marked `present` or `late` (ZH3) are accepted. Returns an `undoToken`; `POST /sessions/:id/sets/undo` within 10 minutes removes exactly that batch.
- Coach-logged sets count in the trainee's workout history and strength read model (ZB5) like their own sets.

## Gap list
- Set rows have no `logged_by` or session link.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] One call logs the same sets for several present clients; absent clients are rejected per row with a reason.
- [ ] Undo removes exactly that batch within 10 minutes, then returns `410 undo_expired`.
- [ ] Migration chain test passes; contract, client method, route and authz tests.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Trainee suggestions (ZH6).
- Logging screens (ZH10, ZH11, ZH14, ZH15).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `migration-chain.test.ts`, `coach-logged-sets.test.ts`, `coach-logged-sets.authz.test.ts`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
