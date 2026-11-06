---
id: X4i
title: Push delivery is at-most-once on queue retries
batch: W3
depends_on: [X4c]
lane: reminders
files_owned:
  - apps/api/src/domain/reminders.ts
  - apps/api/src/jobs/reminders.ts
  - apps/api/drizzle/0033_reminder_attempt_marker.sql
  - apps/api/drizzle/meta/**
  - apps/api/src/db/schema.ts  # reminder delivery attempt column only
  - apps/api/src/domain/reminders.at-most-once.test.ts
frames: []
model: opus
size: M
---

## Outcome
A queue retry never sends the same reminder push twice: an attempt marker is written before the provider call, and a retry that finds a marker without a recorded outcome records the delivery as uncertain instead of resending.

## Context
- D-W3-8 (decided by Firoz, 31 Oct 2026; task shape decided by Firoz, 1 Nov 2026): at-most-once over at-least-once; a reminder can rarely be lost, never doubled.
- Matches "dedupe before delivery" and "record provider acceptance separately from completion" in `AGENTS.md`.
- Migration task: opus, M. Additive column only (nullable attempt timestamp or an `uncertain` provider status); no backfill.

## Gap list
- `apps/api/src/domain/reminders.ts:1837`: `deliverReminderMessage` (`:1814`) skips a redelivery only when `providerStatus === "accepted"`, the very write that can fail after the provider accepted.
- `apps/api/src/domain/reminders.ts:1974`: `sendPushToDevice` is called with no marker written first.
- `apps/api/src/jobs/reminders.ts:73`: `message.retry()` re-runs delivery, so the push goes out again.

## Acceptance criteria
- [ ] The attempt marker is committed before `sendPushToDevice`; if writing it fails, nothing is sent and the message retries.
- [ ] Provider accepted but the acceptance write fails → the retry sends nothing and records `uncertain`.
- [ ] A retry after a provider error recorded as an error (not accepted) follows the existing retry rule; no double send.
- [ ] Migration applies on a copy of staging data; `pnpm db:check` (or the repo's drizzle check) clean.

## Out of scope
- Trainer inbox pushes (X4f, X4h). Receipt polling (`apps/api/src/jobs/push-receipts.ts`, unchanged).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/domain/reminders.at-most-once.test.ts` (new): mocked provider accepts, acceptance write throws, queue retries → one provider call total, delivery `uncertain`; marker write throws → zero calls; normal path → one call, `accepted`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
