---
id: LA3
title: Android ongoing workout notification: native module and config
batch: W3
depends_on: [LA2]
lane: mobile-native
files_owned:
  - apps/mobile/modules/live-activity/android/**
  - apps/mobile/modules/live-activity/expo-module.config.json
  - apps/mobile/targets/android/WorkoutSetNotification.kt
  - apps/mobile/plugins/withLiveActivity.js  # Android part only
frames:
  - { frame: "27-android-trainee-workout-notif.png", viewport: "412x915" }
model: opus
size: M
---

## Outcome
On Android dev builds the module shows, updates and removes an ongoing workout notification matching frame 27-android, and its buttons write rows to an Android outbox the app can read.

## Context
- v14 LA3 was one S task with native and JS work; it is split (LA3 native, LA3b JS wiring). The Kotlin scaffold exists (`apps/mobile/targets/android/WorkoutSetNotification.kt`, 75 lines) and is not compiled into the build.
- Uses the `workout` channel (`apps/mobile/src/notifications/androidChannels.ts`), respects notifications-off. Android rest timer: D-W3-3 (decided by Firoz, 1 Nov 2026): it is added, in LA3c (new frame); this task builds the notification without it (the scaffold comment at `WorkoutSetNotification.kt:15` is updated by LA3c).

## Gap list
- `apps/mobile/targets/android/WorkoutSetNotification.kt:3-4`: not compiled; no receiver for the PendingIntents.
- `apps/mobile/modules/live-activity/`: iOS only (LA1).

## Acceptance criteria
- [ ] Android module exposes the same `start/update/end/isSupported` plus `readOutbox/removeOutbox`, backed by SharedPreferences.
- [ ] A BroadcastReceiver handles −/+ weight (2.5 kg), −/+ reps (1) and Log set; Log set appends one row like iOS.
- [ ] The config plugin registers the receiver; `npx expo config --type prebuild` succeeds on Linux.
- [ ] Device checklist for Firoz in the PR.

## Out of scope
- Workout-screen wiring (LA3b). Rest timer (LA3c). iOS.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Kotlin can't run in CI here; add a JS-side contract test for the module interface in LA3b. PR lists the manual checks.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Firoz compares the notification on his Android dev build with `27-android-trainee-workout-notif.png`; photo in the PR.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
