---
id: OB2
title: Structured logs for errors, cron and queue runs
batch: W2
depends_on: [OB1, I8]
lane: api-ops
files_owned:
  - apps/api/src/index.ts
  - apps/api/src/index.logging.test.ts
  - apps/api/src/domain/reminders.ts
  - apps/api/src/jobs/reminders.ts
  - apps/api/src/jobs/reminders.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Every unhandled error, cron run and queue batch writes one structured log line with safe fields, and the reminder code no longer swallows errors silently.

## Context
- v14 OB2. Use `writeStructuredLog` and `SafeLogFields` in `apps/api/src/lib/log.ts` (fields: requestId, operation, method, path, status, latencyMs, actorType, actorUserId, errorCode, errorName). Never log `err.message`, stacks, request bodies, emails, phone numbers or tokens.
- I8 (W1) edits `apps/api/src/domain/reminders.ts` first; re-check the line numbers below after I8 merges.
- `jobs/reminders.ts:54` retries the message on error; keep that behavior.

## Gap list
- `apps/api/src/index.ts:168-198`: `onError` logs only `requestId` and `errorName`; no method, path (route pattern), status or actor.
- `apps/api/src/index.ts:203-210`: `scheduled()` runs three jobs with no log of start, duration or failure; one failure skips the rest.
- `apps/api/src/index.ts:211-213`: `queue()` has no log of batch size or outcome.
- `apps/api/src/domain/reminders.ts:231`, `:243`, `:795`, `:816`, `:844`, `:860`, `:880`; `apps/api/src/jobs/reminders.ts:54`: bare `catch {` with no log.

## Acceptance criteria
- [ ] `onError` adds `method`, `path` (route pattern, not the raw URL with ids or tokens), `status: 500` and `actorUserId` when known.
- [ ] `scheduled()` logs `operation` (`cron.reminders`, `cron.replenishment`, `cron.coach_ask`), `latencyMs` and `errorName` on failure, and runs each job even if an earlier one throws; it rethrows at the end if any failed.
- [ ] `queue()` logs batch size, retried count and `latencyMs`.
- [ ] Each listed `catch` logs `operation` and `errorName` (and `errorCode` when present) and keeps its current control flow.
- [ ] A test asserts that no log line contains an email address, a bearer token or `err.message`.

## Out of scope
- Wrangler observability settings (OB1). Alerting and Logpush (post-beta). Sentry (W3).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/index.logging.test.ts` (new): a thrown route error logs the safe fields and returns the same 500 body as today; a failing cron job doesn't stop the next one.
- `apps/api/src/jobs/reminders.test.ts` (new): a failing message is logged and retried.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
