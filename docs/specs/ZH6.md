---
id: ZH6
title: Trainee suggest-a-change API for coach-logged sets
batch: W12
depends_on: [ZH5]
lane: api
files_owned:
  - apps/api/src/routes/set-suggestions.ts
  - apps/api/src/routes/set-suggestions.test.ts
  - apps/api/src/routes/set-suggestions.authz.test.ts
  - apps/api/src/domain/set-suggestions.ts
  - packages/contracts/src/set-suggestions.ts
  - packages/api-client/src/set-suggestions-augment.ts
  - apps/api/src/index.ts
  - packages/contracts/src/index.ts
  - packages/api-client/src/index.ts
  - apps/api/drizzle/*.sql
  - apps/api/drizzle/meta/*.json
  - apps/api/src/db/schema.ts
  - apps/api/src/db/migration-chain.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
A trainee cannot edit a set their coach logged, but can suggest a change, which stays pending until the coach accepts or declines it (frame IP-16).

## Context
- Covers master-list (v13) items S2b. Everything the implementer needs from those rows is pasted here.
- D-W12-7 in `docs/specs/batches/W12.md`.
- Table `set_change_suggestions` (set id, relationship, proposed reps and load, note, `status` pending/accepted/declined, timestamps), added in this task's migration (same lane as ZH1 and ZH5, so numbers never clash). Migration number: the next free number when the task starts from `main` (after W6's ZB16). Remote application to staging and production is done after merge by the batch's coding agent or FitBud UI (manual list P2); the implementer runs migrations locally only.
- `POST /me/sets/:setId/suggestions` (trainee, coach-logged sets only), `GET /sessions/suggestions?status=pending` (trainer), `POST /sessions/suggestions/:id/accept` (applies the change to the set) and `/decline`.
- The trainer sees a pending suggestion as an activity line, not an exception (no auto-resolve rules touched).

## Gap list
- No suggestion table or routes; trainee set edits are not blocked for coach-logged sets.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Trainee edit of a coach-logged set returns `403 coach_logged`; a suggestion can be made instead.
- [ ] Accept applies the change once; decline leaves the set; both are audited.
- [ ] Contract, client method, route and authz tests.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Trainee screen (ZH20).
- Trainer review UI beyond the activity line (later).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `set-suggestions.test.ts`, `set-suggestions.authz.test.ts`, migration chain.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
