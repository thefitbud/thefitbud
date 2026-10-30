---
id: LA1b
title: Workout screen starts, updates and ends the Live Activity
batch: W2
depends_on: [LA1]
lane: mobile-native
files_owned:
  - apps/mobile/src/trainee/ActiveWorkoutScreen.tsx
  - apps/mobile/src/notifications/liveActivitySession.ts
  - apps/mobile/src/notifications/liveActivitySession.test.ts
frames:
  - { frame: "27-trainee-lock-live-activity-ios.png", viewport: "393x852" }
  - { frame: "27b-trainee-live-activity-expanded-ios.png", viewport: "393x852" }
model: opus
size: S
---

## Outcome
Starting a workout in the app starts the Live Activity, each set logged in the app updates it, and finishing, skipping or leaving the workout ends it.

## Context
- Split from v14 LA1 in W2.md. Uses LA1's `liveActivityNative.ts`; no native code here.
- `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx` (1,428 lines): `completeSet` at `:376`, `pauseSession` `:438`, `resumeSession` `:458`, `finishWorkout` `:478`; skipped status handled at `:264`. Put the logic in a small `liveActivitySession.ts` helper and keep screen edits to a few calls.
- Map the current exercise and set to `LiveActivityState` (`apps/mobile/src/notifications/liveActivity.ts:11`) with `reduceLiveActivity` where it fits; `openUrl` deep-links back to the active workout.
- The screen has an in-app rest timer (`startRestForSet` at `:351`), but v14 says the Live Activity has no rest timer and frame `27c-trainee-lock-live-rest-ios.png` shows one. That is **D-W2-12, Open**; do not show rest in the activity.
- Local updates only (D-B7). Live Activity in the beta is **D-W2-6, Open**.

## Gap list
- `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx:376` (`completeSet`) and `:478` (`finishWorkout`): no Live Activity calls; nothing starts one when the screen opens an in-progress workout.
- No helper that turns workout execution state into `LiveActivityState`.

## Acceptance criteria
- [ ] Opening an in-progress workout starts one activity (or reuses the running one); only one exists at a time.
- [ ] Each completed set updates exercise, set x of y, kg, reps, plan and last values, and the logged line.
- [ ] Finish, skip and leaving the workout end the activity with `finished: true`; pause/resume change nothing.
- [ ] All calls go through `liveActivitySession.ts`; on Android and web nothing happens and the screen behaves as today.
- [ ] PR has the device checklist for Firoz: start a workout, log two sets, check the lock screen and Dynamic Island against frames 27 and 27b, finish and see it end.

## Out of scope
- Widget button taps (LA2). Android (LA3). Rest countdown in the activity (D-W2-12). Any change to workout logic or sync.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/liveActivitySession.test.ts` (new): start once, update per set with exact fields, end on finish/skip/unmount, no calls on Android.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Frames: `27-trainee-lock-live-activity-ios.png` and `27b-trainee-live-activity-expanded-ios.png` (393x852). Firoz checks on device and attaches photos to the PR; the app screen itself must look unchanged.

## Stop conditions
- D-W2-6 (Live Activity in the beta) is still **Open** in W2.md, or the cut-line (Thu 12 Nov) has passed without LA1 working on Firoz's iPhone.
- The work needs a Mac, Xcode or an `eas build`; write the code, list the device checklist for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
