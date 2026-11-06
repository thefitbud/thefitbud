---
id: I4b
title: MEDIA_PREFIX and mediaKey() helper for every R2 call
batch: W1
depends_on: [I4a]
lane: infra
files_owned:
  - apps/api/src/lib/media-key.ts
  - apps/api/src/lib/media-key.test.ts
  - apps/api/src/routes/files.ts
  - apps/api/wrangler.toml  # MEDIA_PREFIX vars only
frames: []
model: sonnet
size: S
---

## Outcome
Staging and production can share R2 conventions safely: staging objects live under `staging/` in the non-prod bucket, and object keys stored in D1 do not depend on the environment.

## Context
- v14 I4b: every MEDIA `put` / `get` / `head` / `delete` goes through `mediaKey()`. Staging uses prefix `staging/` inside `fitbud-media-nonprod`; production uses no prefix; keys stored in D1 are env-agnostic (the prefix is applied only at the R2 call).
- `MEDIA_PREFIX` is a var: `[env.staging.vars] MEDIA_PREFIX = "staging/"`; production and local omit it (empty).
- `apps/api/src/types.ts` belongs to the auth lane in W1. Do **not** edit it. Declare the input type in `media-key.ts` as `type MediaEnv = { MEDIA_PREFIX?: string }` and accept `c.env` structurally; adding `MEDIA_PREFIX` to `Env` is a follow-up after W1.
- `mediaKey(env, storedKey)` returns `(env.MEDIA_PREFIX ?? "") + storedKey`, rejects a stored key that already starts with the prefix or contains `..`, and never changes the D1 value.

## Gap list
- `apps/api/src/routes/files.ts:374` `bucket.put(asset.objectKey, …)`, `:502` `bucket.head(…)`, `:670` `bucket.get(…)`: raw stored key passed to R2.
- `apps/api/src/routes/files.ts:210`: `buildObjectKey` creates the stored key (stays env-agnostic; no change to it).
- No `media-key.ts` exists.

## Acceptance criteria
- [ ] Every `MEDIA` call in `apps/api/src` (`git grep -nE "bucket\.(put|get|head|delete)|MEDIA\.(put|get|head|delete)" apps/api/src -- ':!*.test.ts'`) passes its key through `mediaKey()`.
- [ ] With `MEDIA_PREFIX="staging/"`, an upload stores `object_key` in D1 without the prefix and writes R2 key `staging/<object_key>`; download and head read the same R2 key.
- [ ] With no prefix, behaviour is identical to today (existing files tests pass unchanged).
- [ ] `[env.staging.vars]` has `MEDIA_PREFIX = "staging/"`; no other env gets a prefix.

## Out of scope
- I4a (env blocks), I4c (scripts). No change to signed-URL logic, file ownership or D1 schema; no migration.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/lib/media-key.test.ts`: prefix applied, empty prefix, rejects `..` and double prefix.
- Extend an existing files test (or add one in `media-key.test.ts` using `apps/api/src/lib/memory-r2.ts`) asserting the D1 key has no prefix while the R2 key does.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
