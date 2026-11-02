---
id: ZB3
title: Migration: payment records and subscription tracking fields (tracking only)
batch: W6
depends_on: [ZB2]
lane: migrations
files_owned:
  - apps/api/drizzle/*.sql
  - apps/api/drizzle/meta/*.json
  - apps/api/src/db/schema.ts
  - apps/api/src/db/migration-chain.test.ts
frames: []
model: opus
size: M
---

## Outcome
Each client's subscription records amount, type, coaching mode, start and due dates, and a list of payments marked paid or unpaid with a method, so the trainer can track money without FitBud collecting any.

## Context
- Covers master-list (v13) items B3a. Everything the implementer needs from those rows is pasted here.
- Resolved 30 Oct (B3a): tracking only. Fields: amount (₹, integer paise), subscription type, coaching mode (`online`, `in_person`, `hybrid`), start and due dates, Paid/Unpaid, method `cash`/`upi`/`bank`. No collection, gateway, invoices or session counting (no sessions included/used/remaining).
- Frames it feeds: 209, 211, 211b, 212, IP-08.
- Design: add to `subscription_versions` (`apps/api/src/db/schema.ts:333-358`) the nullable columns `amount_paise`, `subscription_type` (CHECK in the four `payment_frequency` values plus `custom`), `coaching_mode`; new table `payment_records` (id, coaching_relationship_id, subscription_version_id, amount_paise, due_on, paid_on NULL, status `paid`/`unpaid`, method NULL, note, created_by, created_at, updated_at) with an index on (relationship, due_on).
- Migration number: the next free number when the task starts from `main` (expected order after ZA4's 0034: ZB1 0035, ZB2 0036, ZB3 0037, ZB4 0038). Remote application is Firoz's step at deploy time (manual list); the agent runs migrations locally only.

## Gap list
- `apps/api/src/db/schema.ts:333-358`: subscription_versions has plan name, frequency, start and renew dates only.
- No payment table exists.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The migration adds the columns and table with CHECK constraints; existing rows get NULLs (no invented amounts).
- [ ] Nothing in the schema can represent a session count or a gateway reference.
- [ ] `labelFor` namespaces needed for the new enums are listed in the PR for ZB8 (no UI change here).
- [ ] Migration chain test passes on empty and seeded DBs.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Endpoints (ZB8).
- Settings UI (W8 ZD1–ZD4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/db/migration-chain.test.ts`: columns, table, CHECKs reject bad values.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W6.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
