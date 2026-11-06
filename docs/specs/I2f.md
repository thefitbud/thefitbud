---
id: I2f
title: Post-seed correction: dal-lentil-curry-generic is not Jain
batch: W1
depends_on: [I2b]
lane: library
files_owned:
  - apps/api/seed/library/sql/08_post_seed.sql
  - apps/api/src/seed/library-post-seed.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
The food `dal-lentil-curry-generic` no longer carries the Jain tag, so Jain clients are not offered it as Jain-compatible.

## Context
- Decision D18 (from task list v13, carried by v14 I2f): the correction is applied as a **post-seed** statement in `08_post_seed.sql`. The locked files 01–06 and their sha256 in `manifest.json` stay unchanged.
- The statement must be idempotent (safe to run twice) and target the food by slug `dal-lentil-curry-generic` only.
- `08_post_seed.sql` is created by I2b and loaded by `library-seed.ts` after `07_post_wipe_dev.sql`; FTS is rebuilt after it.
- If the tag is stored in a JSON column or a join table, read the 2026.10.9 seed to find which, and remove only the Jain entry.

## Gap list
- On `main`, `dal-lentil-curry-generic` is not in the loaded 2026.10.2 seed; it is in `apps/api/seed/library/incoming/2026.10.9/` (PR #74) and loads once I2b copies that release in. After I2b, its Jain tag is present (v14 I2f).

## Acceptance criteria
- [ ] After `pnpm db:reset`, `dal-lentil-curry-generic` has no Jain tag and keeps all its other tags.
- [ ] Files 01–06 and `manifest.json` are byte-identical to I2b's versions.
- [ ] Running `08_post_seed.sql` twice gives the same result.
- [ ] No other food row changes (row count and a checksum of all other foods' tag data are equal before and after).

## Out of scope
- I2b, I2c, I2d, I2e. No change to any other food or tag.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/seed/library-post-seed.test.ts`: tag removed, other tags kept, idempotent, other foods unchanged.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
