---
id: X4g
title: Trainer app opens the right screen from a push
batch: W3
depends_on: [X4d]
lane: push-mobile
files_owned:
  - apps/mobile/src/notifications/routing.ts
  - apps/mobile/src/notifications/routing.test.ts
  - apps/mobile/src/trainer/TrainerShell.tsx  # pending-link handling only
frames: []
model: sonnet
size: S
---

## Outcome
Tapping a trainer push (ask, check-in submitted, intake submitted, meal times changed) opens the matching trainer screen in the mobile app and refetches it.

## Context
- D-W3-1 (decided by Firoz, 1 Nov 2026). X4d delivers the tap to `handleNotificationOpen`; the trainee shell consumes the pending link (`apps/mobile/src/trainee/TraineeShell.tsx:651-657`), the trainer shell doesn't.
- Trainer screens exist: `apps/mobile/src/trainer/CheckinReviewScreen.tsx`, `ClientStatusScreen.tsx`, `AttentionTab.tsx`.

## Gap list
- `apps/mobile/src/notifications/routing.ts:49-56`: every trainer type maps to the trainee `today` tab.
- `apps/mobile/src/trainer/TrainerShell.tsx:49`: reads `useAuth()` but never `pendingNotificationLink`.

## Acceptance criteria
- [ ] Trainer types map to trainer routes: check-in submitted → check-in review; intake submitted and meal times changed → client status; ask → client status (asks section).
- [ ] TrainerShell navigates once per pending link, then clears it; screens refetch.
- [ ] Trainee mapping is unchanged (existing tests stay green).

## Out of scope
- Open listener (X4d). Web.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Extend `apps/mobile/src/notifications/routing.test.ts`: each trainer type → its route. Add a TrainerShell pending-link test if the shell has a test harness; otherwise test the mapping only.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI navigation. Firoz on the dev build: submit a check-in as trainee, tap the push on the trainer phone, the review opens.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
