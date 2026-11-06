---
id: I1b
title: Query fixes: attention feed batching, no whole-table reads, user_roles memo
batch: W1
depends_on: []
lane: api-perf
files_owned:
  - apps/api/src/auth/identity.ts
  - apps/api/src/auth/identity.test.ts
  - apps/api/src/routes/exceptions.ts
  - apps/api/src/domain/exceptions.ts
  - apps/api/src/lib/in-array-chunks.ts
  - apps/api/src/lib/in-array-chunks.test.ts
  - apps/api/src/routes/exceptions.query-count.test.ts
frames: []
model: opusplan
size: M
---

## Outcome
The trainer's attention feed and every authenticated request issue a bounded number of D1 queries that does not grow with the total number of users in the database.

## Context
- v14 I1b: `inArray` batches of at most **90** parameters (D1 bound-parameter limit is 100); filter by the trainer's own clients instead of reading whole tables; a per-request `user_roles` memo in `apps/api/src/auth/identity.ts`; add query-count tests.
- Workers Paid (1,000 D1 queries per invocation, 30 s CPU) removed the immediate blocker, so I1b may slip to just after the beta without blocking it (v14). It is lowest priority in W1.
- Authorization must not change: a trainer still sees only relationships they own (`canAccessRelationship`).

## Gap list
- `apps/api/src/routes/exceptions.ts:225`: `db.select().from(traineeProfiles)` reads every trainee profile to build `nameByUserId`.
- `apps/api/src/routes/exceptions.ts:229-234`: `db.select({ userId, mobileE164 }).from(userIdentities)` reads every identity to build `phoneByUserId`.
- `apps/api/src/auth/identity.ts:56-58` and `:154-156`: `user_roles` loaded per call; several lookups in one request repeat it.
- No helper chunks `inArray` lists; `inArray` appears in about 70 non-test call sites. This task covers those reached by `GET /exceptions/attention` and `apps/api/src/domain/exceptions.ts`.

## Acceptance criteria
- [ ] `GET /exceptions/attention` reads trainee profiles and identities only for user ids in the returned groups, in `inArray` chunks of ≤ 90.
- [ ] `apps/api/src/lib/in-array-chunks.ts` exports a helper that splits ids into chunks of ≤ 90 and merges results.
- [ ] Within one request, `user_roles` for a given user id is queried at most once.
- [ ] A query-count test on the demo seed shows `GET /exceptions/attention?groupBy=relationship` issues the same number of queries for a trainer whether the database has the demo users only or 200 extra unrelated trainees.
- [ ] Response bodies of `/exceptions/attention` are identical before and after for the demo trainer (snapshot).
- [ ] `apps/api/src/routes/authorization-matrix.test.ts` passes unchanged.

## Out of scope
- I8 (cron query budget), OB2 (logging, W2). No schema change, no migration, no new indexes.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/lib/in-array-chunks.test.ts`: 0, 1, 90, 91, 250 ids.
- `apps/api/src/auth/identity.test.ts`: memo hits once per request, not across requests.
- `apps/api/src/routes/exceptions.query-count.test.ts`: query count independent of unrelated users; response snapshot unchanged.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
