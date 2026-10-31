---
id: X4f
title: Push trainer inbox events through the Expo sender
batch: W3
depends_on: [X4i]
lane: reminders
files_owned:
  - apps/api/src/domain/inbox-notify.ts
  - apps/api/src/domain/inbox-notify.push.test.ts
  - apps/api/src/domain/reminders.ts  # export the existing per-user send helper only
frames: []
model: sonnet
size: S
---

## Outcome
When a trainer inbox event is stored (`trainer_ask_coach`, `trainer_meal_times_changed`, and the two events X4h adds), the trainer's registered devices get one push, respecting the trainer's push toggle, category toggles and quiet hours.

## Context
- D-W3-1 (decided by Firoz, 1 Nov 2026): trainer inbox events are pushed in the beta.
- Inbox events are written by `storeInboxNotification` (`apps/api/src/domain/inbox-notify.ts:17`) with `state: "delivered"` (`:41`) and no push. Callers: `apps/api/src/routes/coach-asks.ts:198` (`trainer_ask_coach`), `apps/api/src/domain/meal-times-update.ts:25` (`trainer_meal_times_changed`), plus trainee-facing callers that stay in-app only.
- Trainer categories exist in the contract (`packages/contracts/src/notification.ts:95-103`: `askCoach`, `checkinSubmitted`, `intakeSubmitted`, `mealTimesChanged`, ...), set on web and mobile settings (TW-29).
- Reuse the delivery path X4a/X4c use (`apps/api/src/domain/reminders.ts:1974`), with the routing-only payload; no new provider code. Push failure never fails the request that stored the event.

## Gap list
- `apps/api/src/domain/inbox-notify.ts:17-60`: stores only; no push, no category or quiet-hours check.
- `apps/api/src/domain/reminders.ts:1974`: the send is internal to reminder delivery; no helper other modules can call.

## Acceptance criteria
- [ ] For trainer types, after the row is stored, one push per active device of the recipient; a deduped (already stored) event sends nothing.
- [ ] Skipped when the trainer's push is off, the matching category is off, or inside quiet hours (stored only; no deferral in the beta).
- [ ] Trainee-facing inbox types are unchanged (no push).
- [ ] The send runs after the insert and is awaited with errors caught and logged by name only; the caller's response doesn't change.
- [ ] No migration.

## Out of scope
- Emitting check-in and intake events (X4h). Trainer tap routing (X4g). Trainer critical digest and renewal pushes (no producer exists; post-beta).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/domain/inbox-notify.push.test.ts` (new): ask-coach → one mocked Expo call; category off → none; quiet hours → none; duplicate dedupe key → none; trainee type → none; provider error → store still succeeds.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
