---
id: X4e
title: Mobile registers a real Expo push token for both roles and unregisters on sign-out
batch: W3
depends_on: [X4b]
lane: push-mobile
files_owned:
  - apps/mobile/src/notifications/register.ts
  - apps/mobile/src/notifications/register.test.ts
  - apps/mobile/src/auth/AuthProvider.tsx  # push registration and sign-out only
frames: []
model: opus
size: S
---

## Outcome
After sign-in as trainer or trainee on a dev build, the app asks for notification permission, gets an Expo push token and registers it; it re-registers when the token changes and unregisters on sign-out.

## Context
- v14 X4b (mobile half, split, new ID X4e). Runs after X4b (backend accepts `provider: "expo"`, D-W3-2).
- `Notifications.getExpoPushTokenAsync({ projectId })` with `projectId` from `Constants.expoConfig.extra.eas.projectId` (set by `eas init`, X6/X3). Local `AUTH_MODE=test` keeps the synthetic token path.
- Permission prompt copy and settings screens already exist (frames 76, 77, 52); this task adds no UI.

## Gap list
- `apps/mobile/src/notifications/register.ts:13-15`: always `provider: "fcm"`, token `local-test-fcm-…`.
- `apps/mobile/src/auth/AuthProvider.tsx:149-153`: trainees are skipped; only trainers register.
- `apps/mobile/src/auth/AuthProvider.tsx:271-285`: `signOut` doesn't unregister the device token.
- No `addPushTokenListener` for token changes.

## Acceptance criteria
- [ ] Both roles register after `/me` succeeds; permission denied → no call, no error shown.
- [ ] Non-test builds send `provider: "expo"` with the Expo token and a stable installation id; test mode keeps the synthetic token.
- [ ] A token change re-registers once; sign-out calls `DELETE /notifications/device-tokens` with the installation id before clearing the session (best-effort, never blocks sign-out).
- [ ] The token is never logged.

## Out of scope
- Backend (X4b). Notification tap handling (X4d). Live Activity push (post-beta).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/register.test.ts` (new): mocked `expo-notifications`: granted → register expo token; denied → nothing; token change → one re-register; sign-out → unregister; test mode → synthetic token.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI. Firoz's device check on the X3 dev build: sign in as trainee, the device row appears with `provider = expo` (shown by a test push from X4c on staging). Result in the PR.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
