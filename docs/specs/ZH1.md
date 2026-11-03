---
id: ZH1
title: Migration: sessions, attendance and check-in calls tables
batch: W12
depends_on: [ZB16]
lane: api
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
Sessions, attendance and check-in calls have a home in the database, so the Phase 10 APIs and screens can be built.

## Context
- Covers master-list (v13) items S1a. Everything the implementer needs from those rows is pasted here.
- D-W12-2, D-W12-3, D-W12-4 in `docs/specs/batches/W12.md`.
- `calendar_entries`: id, workspace/trainer, `kind` (`session` in person, `call` check-in call), `starts_at`, `ends_at` (UTC ISO), `local_date` (trainer-local), title, location (sessions), `meeting_url` (calls only, external link, nullable), note, `status` (`scheduled`, `cancelled`), `cancelled_at`, created/updated.
- `calendar_entry_clients`: entry id + coaching relationship id (one or many clients per session; exactly one per call), unique pair.
- `session_attendance`: entry id + relationship id, `status` (`expected`, `present`, `late`, `absent`, `cancelled`, `late_cancel`), `marked_at`, `marked_by`. No package, credit or session-count column (D-W12-2, D-W6-5).
- Migration number: the next free number when the task starts from `main` (after W6's ZB16). Remote application to staging and production is done after merge by the batch's coding agent or FitBud UI (manual list P2); the implementer runs migrations locally only.

## Gap list
- No sessions, calls or attendance tables in `apps/api/src/db/schema.ts`.
- `apps/api/drizzle/` ends at the W6 migrations (ZB16).
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Tables, foreign keys, unique (entry, relationship) and indexes on (trainer, `starts_at`) and (relationship, `starts_at`) exist.
- [ ] CHECKs: `ends_at > starts_at`; `meeting_url` only on calls; a call has exactly one client (enforced in the API, ZH2, and tested there).
- [ ] Migration chain test passes from empty and from the W6 seeded database.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- APIs (ZH2–ZH4).
- Coach-logged sets (ZH5).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/db/migration-chain.test.ts`: tables, uniques, CHECKs.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W12.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
