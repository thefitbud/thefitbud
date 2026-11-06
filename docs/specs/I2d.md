---
id: I2d
title: library-seed: full file list, --remote guarded by --yes, chunk files over 5 MB
batch: W1
depends_on: [I2c]
lane: library
files_owned:
  - apps/api/scripts/library-seed.ts
  - apps/api/scripts/library-seed.test.ts
  - apps/api/scripts/lib/sql-chunk.ts
  - apps/api/scripts/lib/sql-chunk.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Firoz can load the library into staging or production with one guarded command, and local `db:reset` loads every library file in the right order.

## Context
- Facts (v14 I2d): file list `01, 02, 02b, 03, 03b, 04, 05, 06, 08`; a remote run **skips** `00_wipe_legacy_dev.sql` and `07_post_wipe_dev.sql` (dev-only); files over 5 MB are split into chunks before `wrangler d1 execute`; `--remote` requires `--yes`. **The agent never runs remote.**
- Local order stays: `00`, `01`, `02`, `02b`, `03`, `03b`, `04`, `05`, `06`, `07`, `08`, `05` again (FTS rebuild).
- Remote invocation (built by this script, run only by Firoz): `wrangler d1 execute <db> --env <staging|production> --remote --file <chunk>`. D1 names: staging `fitbud-staging`, production `fitbud-prod`. `--env` is required with `--remote`.
- I4c adds the `package.json` entries that call this script; do not edit `apps/api/package.json` here (W1.md: only the infra lane edits it).
- Chunking must split only between SQL statements (reuse the statement splitting in `apps/api/src/test-support/sql-split.ts` by importing it, or copy its rules into `scripts/lib/sql-chunk.ts`).

## Gap list
- `apps/api/scripts/library-seed.ts:14-24`: list lacks `02b`, `03b`, `08` (after I2b it has `02b` and `08`).
- `apps/api/scripts/library-seed.ts:51-55`: refuses `--remote` outright.
- No chunking; `02_foods.sql` is about 15 MB (`apps/api/seed/library/README.md`).

## Acceptance criteria
- [ ] Local run executes the local order above.
- [ ] `--remote` without `--yes` or without `--env staging|production` exits 1 before any Wrangler call.
- [ ] With `--remote --yes --env staging --print` the script prints the planned commands: no `00` or `07`, files in list order, every chunk ≤ 5 MB, and runs nothing.
- [ ] Concatenating a file's chunks reproduces its statements in order.
- [ ] The agent ran no remote command (state it in the PR).

## Out of scope
- I2b, I2f, I2c (content), I4c (package.json scripts), I6 / I6b (Firoz's remote runs).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/scripts/library-seed.test.ts`: flag guards; local vs remote file lists; `--print` dry plan with `runCommandSync` mocked.
- `apps/api/scripts/lib/sql-chunk.test.ts`: splits at statement boundaries, respects 5 MB, round-trips.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
