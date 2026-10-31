---
id: X4d
title: Notification tap opens the right screen and refetches
batch: W3
depends_on: [X4e]
lane: push-mobile
files_owned:
  - apps/mobile/src/notifications/openListener.ts
  - apps/mobile/src/notifications/openListener.test.ts
  - apps/mobile/App.tsx
frames: []
model: sonnet
size: S
---

## Outcome
Tapping a push (app in background or killed) opens the screen the payload routes to, after sign-in if needed, and the screen refetches its data.

## Context
- v14 X4d: use `deepLinkFromNotificationPayload` (`apps/mobile/src/notifications/routing.ts:83`). `AuthProvider.handleNotificationOpen` already stores a pending link (`apps/mobile/src/auth/AuthProvider.tsx:341-345`) and `TraineeShell` consumes it (`apps/mobile/src/trainee/TraineeShell.tsx:651-657`).
- Payloads carry routing only (X4a); screens refetch, the payload is not authoritative.

## Gap list
- The only response listener is the meal-action one (`apps/mobile/src/notifications/nativeActions.ts:44`, registered from `App.tsx:11`), which handles meal Open/Snooze only; no `getLastNotificationResponseAsync` (cold start), and nothing calls `handleNotificationOpen`. The new listener must not double-handle a meal tap the meal listener already routes.
- `apps/mobile/App.tsx:23-30`: no listener mounted inside `AuthProvider`.

## Acceptance criteria
- [ ] `openListener.ts` exports a component/hook mounted once inside `AuthProvider` in `App.tsx`; it handles the cold-start response once and each later response.
- [ ] Each response calls `handleNotificationOpen(payload.data)`; unknown payloads do nothing.
- [ ] Signed out: the link waits and opens after sign-in (existing pending-link behaviour).
- [ ] Trainer-type payloads in a trainee session are ignored.

## Out of scope
- Trainer shell routing beyond the existing pending link. Action buttons on notifications (existing `nativeActions.ts`).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/openListener.test.ts` (new): cold start handled once; background tap → handler called with `data`; malformed payload → no call.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI. Firoz on the dev build: tap a staging reminder for each type (meal, workout, check-in) and confirm the screen; result in the PR.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
