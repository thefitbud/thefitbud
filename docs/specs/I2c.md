---
id: I2c
title: Exercise base emitter: 03b_exercise_base.sql with storage keys
batch: W1
depends_on: [I2f]
lane: library
files_owned:
  - apps/api/scripts/emit-exercise-base.ts
  - apps/api/scripts/emit-exercise-base.test.ts
  - apps/api/seed/library/sql/03b_exercise_base.sql
  - apps/api/src/seed/exercise-base.test.ts
frames: []
model: opusplan
size: M
---

## Outcome
A script turns the locked exercise base (release 2026.10.21-v3) into `03b_exercise_base.sql`, giving 1,362 exercises with media storage keys that the library loads locally.

## Context
- Facts (v14 I2c): `apps/api/scripts/emit-exercise-base.ts` emits `apps/api/seed/library/sql/03b_exercise_base.sql`; media keys are `exercises/<slug>/<n>.<ext>`; 1,362 exercises; `PRAGMA foreign_key_check` is empty after load.
- Decision D-B5 / D-W1-1 (Firoz, 30 Oct 2026): I2c does **not** depend on I2e (demo-seed food remap, post-beta). **Its tests must pass on the current demo seed without I2e.**
- Media keys are stored env-agnostic (I4b applies any `MEDIA_PREFIX` at R2 call time).
- Wiring 03b into `library-seed.ts` is I2d (same lane, next). This task's tests load 03b directly into a test D1.
- **Source: D-W1-7 (decided by Firoz, 31 Oct 2026; on `main` via PR #74).** The locked exercise base is **2026.10.21-v3** (locked by Firoz on 22 Oct 2026), not 2026.10.20-v2. Input: `apps/api/seed/library/incoming/exercise-base-2026.10.21-v3/exercises.json` (`version` "2026.10.21-v3", `count` 1362, `exercises[]`: each has `id`, `slug`, `name`, `steps`, `youtube_search_url`, `media[]`, licence fields) and `apps/api/seed/library/incoming/exercise-base-2026.10.21-v3/exercise_library_instructions.sql` (steps, 14,037 rows). It also contains `media/<slug>/everkinetic-NNNN-start.png` / `-end.png`: 919 drawings for 460 exercises, CC BY-SA 4.0, credited in `apps/api/seed/library/incoming/exercise-base-2026.10.21-v3/MEDIA_ATTRIBUTION.md`. Read only; do not edit anything under `incoming/`.
- Key mapping: the n-th entry (1-based) of an exercise's `media[]` gets storage key `exercises/<slug>/<n>.png`. The emitter writes each media row's `attribution`, `licence` and `licence_url` from the source entry (columns added in `apps/api/drizzle/0031_library_schema.sql:80-84`), and `youtube_search_url` from the source (`0031:61`).
- The 353 exercises in the foods release's `03_exercises.sql` keep their ids; the base reuses them (stable ids and slugs, per the base README), so 03b uses `INSERT OR REPLACE` on the same ids.

## Gap list
- No `emit-exercise-base.ts` and no `03b_exercise_base.sql` on `main`.
- `apps/api/seed/library/manifest.json:2-6`: release 2026.10.2 with 353 exercises (I2b moves it to 2026.10.9, still 353). Nothing loads the 1,362-exercise base yet.

## Acceptance criteria
- [ ] `tsx scripts/emit-exercise-base.ts` writes `03b_exercise_base.sql` deterministically (two runs give identical bytes).
- [ ] Loading 01–06, 02b, 03b and 08 into a test D1 gives 1,362 exercise rows.
- [ ] 919 exercise media rows reference 460 distinct exercises, each with non-empty `attribution` and `licence`.
- [ ] All 1,362 exercises have a non-empty `youtube_search_url` and at least one step.
- [ ] Every exercise media key matches `^exercises/[a-z0-9-]+/[0-9]+\.(jpg|jpeg|png|webp|gif|mp4)$`.
- [ ] `PRAGMA foreign_key_check` returns no rows after library + current demo seed.
- [ ] Existing demo-seed tests pass without I2e.

## Out of scope
- I2d (load order, remote, chunking), I2e (post-beta). No R2 uploads of exercise media; no UI.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/scripts/emit-exercise-base.test.ts`: deterministic output; key format; slug escaping.
- `apps/api/src/seed/exercise-base.test.ts`: 1,362 rows; 919 media rows; `foreign_key_check` empty with the current demo seed.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
