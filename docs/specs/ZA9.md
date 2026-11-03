---
id: ZA9
title: Library: cup and glass servings for the 15 drinks capped at 100 ml, and black tea's label
batch: W5
depends_on: []
lane: library
files_owned:
  - apps/api/seed/library/sql/08_post_seed.sql
  - apps/api/src/seed/library-post-seed.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
A trainee can log a 150 ml cup or a 250 ml glass of tea, coffee or another drink instead of being capped at 100 ml.

## Context
- Covers master-list (v13) items DK1. Everything the implementer needs from those rows is pasted here.
- Decided 23 Oct (DK1): add cup (150 ml) and glass (250 ml) servings to the 15 capped drinks through post-seed extras; locked release files and their sha256 stay unchanged; fix black tea's label in the same file. D18 set the pattern: corrections live in `08_post_seed.sql` (`apps/api/seed/library/sql/08_post_seed.sql`, 17 lines today, applied last by `scripts/library-seed.ts`).
- Production and staging already hold the library (I6, I6b). Applying this on remote databases is done after merge by FitBud UI (manual list P2); the agent only changes the file and tests.

## Gap list
- `apps/api/seed/library/sql/08_post_seed.sql` holds only the I2f Jain-tag fix.
- `apps/api/src/seed/library-post-seed.test.ts:65-120` tests only the I2f correction.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] After the full library seed, each of the 15 drinks (listed by slug in the SQL comment, e.g. `tea-black-brewed`, `coffee-brewed`) has servings `cup` 150 ml and `glass` 250 ml, with grams equal to ml for drinks with density 1.
- [ ] Re-running `08_post_seed.sql` is idempotent (`INSERT OR IGNORE` keyed on food id + serving name).
- [ ] Black tea's display label is corrected; no other column of any food changes except `updated_at`.
- [ ] The locked files' sha256 in `manifest.json` are unchanged.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- New drinks or nutrient changes.
- Remote application.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/seed/library-post-seed.test.ts`: new `describe('drink servings (DK1)')` — before/after counts, idempotent second run, label fix, other rows unchanged.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
