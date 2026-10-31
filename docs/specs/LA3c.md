---
id: LA3c
title: Android rest timer in the ongoing workout notification
batch: W3
depends_on: [LA3b]
lane: mobile-native
files_owned:
  - apps/mobile/targets/android/WorkoutSetNotification.kt
  - apps/mobile/modules/live-activity/android/**
  - apps/mobile/src/notifications/liveActivityNative.ts
  - apps/mobile/src/notifications/liveActivityNative.test.ts
frames:
  - { frame: "27-android-trainee-workout-notif.png", viewport: "412x915" }
model: opus
size: S
---

## Outcome
After a set is logged with rest on, the Android ongoing notification shows a rest countdown with Skip, matching the planned frame `27-android-rest.png`, then returns to the next set.

## Context
- D-W3-3 (decided by Firoz, 1 Nov 2026): Android gets a rest timer like iOS frame 27c (LA1c).
- **Planned frame (not yet in the repo):** `docs/design/mockups/png/27-android-rest.png` at 412x915. Firoz adds it to `main` before W3 runs (manual-steps P0). Until then the base layout is `27-android-trainee-workout-notif.png`.
- Use the same rest fields as LA1c (`restEndsAt`, `restSeconds`); a Chronometer counting down (`setUsesChronometer` + `setChronometerCountDown`, API 24+) so no per-second updates; Skip clears rest. Notifications-off respected.

## Gap list
- `apps/mobile/targets/android/WorkoutSetNotification.kt:15`: "There is no rest timer".
- LA3's module and LA3b's wrapper carry no rest fields on Android.

## Acceptance criteria
- [ ] With rest on, the notification shows the countdown and a Skip action; at zero or on Skip it shows the next set.
- [ ] Rest state comes from the same JS state as iOS; no extra wake-ups or timers in JS.
- [ ] The scaffold comment is updated; device checklist in the PR.

## Out of scope
- iOS rest (LA1c, W2). Sounds or vibration at rest end.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Extend `liveActivityNative.test.ts`: rest fields passed on Android; Skip clears them.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Firoz compares the notification on his Android dev build with `27-android-rest.png`; photo in the PR.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- `docs/design/mockups/png/27-android-rest.png` is not on `main`.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
