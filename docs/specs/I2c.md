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
- **Source artifacts: D-W1-7 (Open in W1.md).** The locked release files (foods 2026.10.9 and the 2026.10.21-v3 exercise base) are produced by a pipeline outside this repo and are **not on `main`** (checked 31 Oct 2026: `apps/api/seed/library/` holds release 2026.10.2 only). Until Firoz commits them to the path named in D-W1-7, stop.

## Gap list
- No `emit-exercise-base.ts` and no `03b_exercise_base.sql` on `main`.
- `apps/api/seed/library/manifest.json`: 353 exercises in release 2026.10.2.

## Acceptance criteria
- [ ] `tsx scripts/emit-exercise-base.ts` writes `03b_exercise_base.sql` deterministically (two runs give identical bytes).
- [ ] Loading 01–06, 02b, 03b and 08 into a test D1 gives 1,362 exercise rows.
- [ ] Every exercise media key matches `^exercises/[a-z0-9-]+/[0-9]+\.(jpg|jpeg|png|webp|gif|mp4)$`.
- [ ] `PRAGMA foreign_key_check` returns no rows after library + current demo seed.
- [ ] Existing demo-seed tests pass without I2e.

## Out of scope
- I2d (load order, remote, chunking), I2e (post-beta). No R2 uploads of exercise media; no UI.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/scripts/emit-exercise-base.test.ts`: deterministic output; key format; slug escaping.
- `apps/api/src/seed/exercise-base.test.ts`: 1,362 rows; `foreign_key_check` empty with the current demo seed.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
