---
id: X4c
title: Reminder pushes end to end through the Expo sender
batch: W3
depends_on: [X4a]
lane: reminders
files_owned:
  - apps/api/src/domain/reminders.ts
  - apps/api/src/domain/reminders.push-e2e.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Meal, workout and check-in reminders go from the cron schedule through the queue to one mocked Expo send each, respecting quiet hours, dedupe and notifications-off.

## Context
- v14 X4c. Quiet hours, dedupe and notifications-off already exist (`apps/api/src/domain/reminders.ts:753-756` dedupe, `:772` push enabled, `:781-782` quiet hours); X4a (W2) added the Expo path at the send (`:1653`).
- Trainer notification types: **D-W3-1 (Open)**. Recommendation: reminders only for the beta; trainer inbox events stay in-app (they are stored as delivered without a push, `apps/api/src/domain/inbox-notify.ts:41`). If Firoz picks the other option, that becomes a new task, not this one.
- Model: v14 says plan; the batch rule (S, not auth/migration/concurrency) gives sonnet. Listed as a conflict in W3.md.

## Gap list
- No test covers schedule → queue → provider call in `expo` mode for each reminder type.
- `apps/api/src/domain/reminders.ts:1653`: sends per token; check that a revoked token (X4a) is skipped and a provider failure doesn't block the other tokens.

## Acceptance criteria
- [ ] One test per type (`meal_reminder`, `workout_reminder`, `checkin_reminder`) runs the cron candidate, the queue batch and the delivery with a mocked `fetch` to `exp.host`, and asserts one send with a routing-only payload.
- [ ] Inside quiet hours → deferred, no send; push off or category off → no send; same dedupe key twice → one send.
- [ ] Revoked tokens are skipped; one failing token doesn't stop the others.
- [ ] Any code change stays inside `domain/reminders.ts`; no migration.

## Out of scope
- Trainer push types (D-W3-1). Receipts (X4a). Copy changes.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/domain/reminders.push-e2e.test.ts` (new) as above.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
