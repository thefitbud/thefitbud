---
id: I2b
title: Load the locked foods library 2026.10.9 seed
batch: W1
depends_on: []
lane: library
files_owned:
  - apps/api/seed/library/sql/01_lookups.sql
  - apps/api/seed/library/sql/02_foods.sql
  - apps/api/seed/library/sql/02b_food_extras.sql
  - apps/api/seed/library/sql/03_exercises.sql
  - apps/api/seed/library/sql/04_templates.sql
  - apps/api/seed/library/sql/05_search.sql
  - apps/api/seed/library/sql/06_seed_version.sql
  - apps/api/seed/library/sql/08_post_seed.sql
  - apps/api/seed/library/manifest.json
  - apps/api/seed/library/library-2026.10.*.json
  - apps/api/seed/library/README.md
  - apps/api/seed/library/ATTRIBUTION.md
  - apps/api/scripts/library-seed.ts
  - apps/api/src/seed/library-2026-10-9.test.ts
frames: []
model: opusplan
size: M
---

## Outcome
`pnpm db:reset` loads the locked foods library release 2026.10.9 (1,243 foods, one default serving each), checked against its manifest, so trainers and trainees search and log against the beta food list.

## Context
- Facts for this release (beta task list v14, I2b):
  - 1,243 foods; exactly one default serving per food (`food_library_servings.is_default = 1` once per food).
  - D6 value sets: `food_type` ∈ {`ingredient`, `dish`, `beverage`, `packaged_or_prepared`} (4 types including beverage); `cooking_state` ∈ {`raw`, `cooked`, `ready_to_eat`, `as_purchased`}. The same sets are documented in `apps/api/drizzle/0031_library_schema.sql:9-10`; that migration already locks the schema for "the 2026.10.9 food seed + 2026.10.20-v2 exercise base".
  - Replace files 01–06 and `manifest.json`; every file's sha256 must match the manifest.
  - Add `08_post_seed.sql` (post-seed corrections; I2f adds to it) and `02b_food_extras.sql` (extras that load after 02).
- Load order after this task (local): `00_wipe_legacy_dev.sql`, `01`, `02`, `02b`, `03`, `04`, `05`, `06`, `07_post_wipe_dev.sql`, `08_post_seed.sql`, `05_search.sql` again (FTS rebuild). I2d later adds `03b` and the remote mode.
- **Source artifacts: D-W1-7 (decided by Firoz, 31 Oct 2026; on `main` via PR #74).** Copy, byte for byte, from `apps/api/seed/library/incoming/2026.10.9/`: `manifest.json`, `library-2026.10.9.json`, `ATTRIBUTION.md` and `sql/01_lookups.sql` to `sql/06_seed_version.sql` (6 files) into `apps/api/seed/library/` and `apps/api/seed/library/sql/`, then remove `apps/api/seed/library/library-2026.10.2.json`. Do not edit anything under `incoming/` (read-only input, not owned).
- The release has **no** `02b_food_extras.sql` or `08_post_seed.sql`. I2b creates both with a header comment and no statements (they are not in the manifest, so the sha256 check does not cover them). I2f adds the first correction to `08`.
- The source manifest also lists 353 exercises (the old base inside `03_exercises.sql`). The 1,362-exercise base is I2c's `03b`, not this task.
- The current demo seed (`apps/api/scripts/seed-demo.ts`) must still load on top; Agents.md requires realistic persisted data in tests.

## Gap list
- `apps/api/seed/library/manifest.json:2-6`: release `2026.10.2`, 693 foods, 353 exercises. Target: identical to `apps/api/seed/library/incoming/2026.10.9/manifest.json` (`seed_version` 2026.10.9, `counts.foods` 1243).
- `apps/api/seed/library/library-2026.10.2.json`: old export. Target: `library-2026.10.9.json` copied from `incoming/`.
- `apps/api/seed/library/sql/`: no `02b_food_extras.sql`, no `08_post_seed.sql`.
- `apps/api/scripts/library-seed.ts:14-24`: file list has no `02b` or `08`.
- No test asserts the food count, default-serving rule, value sets or sha256.

## Acceptance criteria
- [ ] `manifest.json` `seed_version` is `2026.10.9` and `counts.foods` is 1243.
- [ ] A test recomputes the sha256 of every file listed in the manifest and matches it.
- [ ] After loading into a test D1, `SELECT count(*) FROM food_library_items` = 1243 and every food has exactly one default serving.
- [ ] Every `food_type` and `cooking_state` value is in the D6 sets above.
- [ ] `PRAGMA foreign_key_check` returns no rows after the library and demo seed load.
- [ ] `pnpm db:reset` completes locally; the existing `apps/api/src/routes/libraries.test.ts` passes.

## Out of scope
- I2f (Jain tag correction), I2c (exercise base emitter), I2d (remote mode, chunking), I2e (demo-seed food remap, post-beta). No schema migration; no UI.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/seed/library-2026-10-9.test.ts`: sha256 per manifest file; food count 1243; one default serving per food; D6 value sets; `foreign_key_check` empty (use `apps/api/src/test-support/foreign-key-check.ts`).
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
