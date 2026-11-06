---
id: X4h
title: Store trainer inbox events for check-in and intake submissions
batch: W3
depends_on: [X4f]
lane: reminders
files_owned:
  - apps/api/src/routes/checkins.ts  # submit handler only
  - apps/api/src/routes/onboarding.ts  # submit handler only
  - apps/api/src/domain/inbox-notify.ts  # type union only
  - apps/api/src/routes/trainer-submission-events.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
When a trainee submits a check-in or an intake, the trainer gets a `trainer_checkin_submitted` or `trainer_intake_submitted` inbox event (and, through X4f, a push).

## Context
- D-W3-1 (decided by Firoz, 1 Nov 2026). Both types exist in the contract and schema (`apps/api/src/db/schema.ts:1366-1367`) and in mobile routing (`apps/mobile/src/notifications/routing.ts:50-51`), but nothing creates them.
- Dedupe keys: `checkin-submitted:<checkinId>` and `intake-submitted:<relationshipId>:<submissionId or date>`.

## Gap list
- `apps/api/src/routes/checkins.ts:1862`: `POST /:checkinId/submit` stores no trainer event.
- `apps/api/src/routes/onboarding.ts:365`: `POST /relationships/:relationshipId/submit` stores no trainer event.
- `apps/api/src/domain/inbox-notify.ts:6-15`: `InboxNotificationType` lacks both types.

## Acceptance criteria
- [ ] A successful submit stores exactly one event for the relationship's trainer; a retried submit (idempotent replay) stores none.
- [ ] A failed or rejected submit stores none; ended relationships store none (read-only rule).
- [ ] Event `domainEntityType`/`domainEntityId` route to the check-in review or the intake review.

## Out of scope
- Push sending (X4f). Trainer mobile routing (X4g). Web inbox UI (already lists stored events).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/routes/trainer-submission-events.test.ts` (new): check-in submit → one event; replay → still one; intake submit → one event; ended relationship → none.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
