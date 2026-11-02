---
id: ZB4
title: Migration: daily_steps and a per-client steps target (default 8,000)
batch: W6
depends_on: [ZB3]
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
Steps have a home in the database: one row per trainee-local day, and a target per client that defaults to 8,000.

## Context
- Covers master-list (v13) items B4a. Everything the implementer needs from those rows is pasted here.
- v13 B4a: `daily_steps` (relationship, trainee-local date, steps, source, synced_at), one row per day; steps target on the coaching configuration, default 8,000, editable per client.
- Source values: `apple_health`, `health_connect`, `manual`. Unique (coaching_relationship_id, local_date). `steps_target INTEGER NOT NULL DEFAULT 8000` on `coaching_configurations` (`apps/api/src/db/schema.ts:295`).
- Migration number: the next free number when the task starts from `main` (expected order after ZA4's 0034: ZB1 0035, ZB2 0036, ZB3 0037, ZB4 0038). Remote application is Firoz's step at deploy time (manual list); the agent runs migrations locally only.

## Gap list
- No `daily_steps` table; `apps/api/src/routes/me-steps.ts:19-28` returns a disabled response.
- `apps/api/src/db/schema.ts:295-331`: coaching_configurations has no steps target.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Table, unique index and the target column exist; existing configurations read 8000.
- [ ] CHECK steps between 0 and 200000.
- [ ] Migration chain test passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Sync and read API (ZB9).
- Native health access (W9 ZE13).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/db/migration-chain.test.ts`: unique day, default target, CHECK bounds.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W6.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
