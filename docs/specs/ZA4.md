---
id: ZA4
title: Refresh AC1a (PR #50): remove the configured status, migration renumbered to the next free number
batch: W5
depends_on: []
lane: activate
files_owned:
  - apps/api/drizzle/0034_remove_configured_status.sql
  - apps/api/drizzle/meta/0034_snapshot.json
  - apps/api/drizzle/meta/_journal.json
  - apps/api/src/auth/auth.test.ts
  - apps/api/src/db/migration-chain.test.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/domain/mappers.ts
  - apps/api/src/routes/configuration.test.ts
  - apps/trainer-web/src/pages/ConfigureCoachingPage.tsx
  - apps/trainer-web/src/styles.css
  - packages/contracts/src/configuration.ts
  - packages/core/src/configuration.ts
  - packages/core/src/labels.ts
frames: []
model: opus
size: S
---

## Outcome
The coaching configuration lifecycle is draft → active → superseded on `main`, with a migration that applies cleanly after every migration already on `main`.

## Context
- Covers master-list (v13) items AC1a (#50). Everything the implementer needs from those rows is pasted here.
- D12 (locked): no `configured` status; edits open vN+1. PR #50 (branch `cursor/ac1a-remove-configured-status-8389`, last updated 31 Oct) implements it with `0033_remove_configured_status.sql`.
- Main has since merged `apps/api/drizzle/0033_reminder_attempt_marker.sql`, so #50's number collides. D-W5-4: renumber to the next free number (0034 today), regenerate the snapshot and journal, and keep every other change.
- D-W5-11: refresh #50 by merging `main` into the PR branch (no rebase); this spec describes that.

## Gap list
- `apps/api/src/db/schema.ts:303`: the status enum still includes `"configured"`.
- `apps/api/src/db/schema.ts:327`: the partial unique index covers `('draft', 'configured')`.
- `apps/api/drizzle/0033_reminder_attempt_marker.sql` exists on `main`; PR #50's `0033_remove_configured_status.sql` would make two 0033 files.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The migration file is `0034_remove_configured_status.sql` (or the next free number at merge time), with matching `meta/<n>_snapshot.json` and a `_journal.json` entry after 0033.
- [ ] Existing `configured` rows become `draft` (or `active` exactly as #50 decided); `migration-chain.test.ts` applies 0000→latest on an empty DB and on a DB seeded at 0033.
- [ ] `labelFor('coaching_configuration_status', …)` has no `configured` entry; the Configure page never shows it.
- [ ] The PR is #50 updated by merging `main` (no rebase, no force-push).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Activate from draft (ZA5, PR #57).
- Configure page redesign (W8).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/db/migration-chain.test.ts`: new number in order; up from 0033 with a `configured` row.
- `apps/api/src/routes/configuration.test.ts`: no endpoint accepts or returns `configured`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @fitbud/trainer-web e2e` (local) and the banned-strings check.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- Another migration lands on `main` first; take the next number and say so in the PR.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
