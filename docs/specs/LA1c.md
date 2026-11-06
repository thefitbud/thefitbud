---
id: LA1c
title: Lock-screen rest timer in the Live Activity
batch: W2
depends_on: [LA1b]
lane: mobile-native
files_owned:
  - apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift
  - apps/mobile/modules/live-activity/ios/LiveActivityModule.swift
  - apps/mobile/src/notifications/liveActivity.ts
  - apps/mobile/src/notifications/liveActivity.test.ts
  - apps/mobile/src/notifications/liveActivityNative.ts
  - apps/mobile/src/notifications/liveActivitySession.ts
  - apps/mobile/src/notifications/liveActivitySession.test.ts
  - apps/mobile/src/trainee/ActiveWorkoutScreen.tsx
  - apps/mobile/plugins/withLiveActivity.js  # header comment only
frames:
  - { frame: "27c-trainee-lock-live-rest-ios.png", viewport: "393x852" }
model: opus
size: M
---

## Outcome
After a set is logged in the app, the Live Activity shows the rest countdown from frame 27c (rest time left, progress bar, "Set n logged" line, the next set's kg × reps, and a Skip button) and returns to the set view when rest ends or is skipped.

## Context
- D-W2-12 (decided by Firoz, 31 Oct 2026, changed from the earlier recommendation): the lock-screen rest timer is in the beta, matching `27c-trainee-lock-live-rest-ios.png`. Kept as its own task so LA1 stays M and LA1b stays S.
- Local updates only (D-B7, D-W2-5): the countdown runs on the device with SwiftUI's `Text(timerInterval:countsDown:)` and `ProgressView(timerInterval:)`; the app sends one update when rest starts and one when it ends. No push.
- The in-app rest timer already exists: `startRestForSet` at `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx:351`, with an in-app Skip at `:704-708`. Use the same rest length the app uses; don't change it.
- `ContentState` (`apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift:35-46`) gains optional `restEndsAt: Date?` and `restSeconds: Int?`. The copy in LA1's module Swift must match field for field.
- The widget's Skip button is a new `LiveActivityIntent` that clears `restEndsAt` on the activity only. It logs nothing and does not write to the App Group outbox (LA2 owns outbox rows). When the app is next active, it ends its own rest if the activity has no rest.
- `apps/mobile/plugins/withLiveActivity.js:10` says "There is no rest timer"; update that comment.

## Gap list
- `apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift:35-46`: no rest fields; lock view (`:178-195`) and Dynamic Island have no rest state; no skip-rest intent.
- `apps/mobile/src/notifications/liveActivity.ts:11`: `LiveActivityState` has no rest fields.
- `apps/mobile/src/trainee/ActiveWorkoutScreen.tsx:351`: starting rest doesn't touch the activity (after LA1b).

## Acceptance criteria
- [ ] Logging a set in the app with rest configured updates the activity with `restEndsAt` and `restSeconds`; the lock screen shows "Rest · m:ss" counting down, a progress bar, "Set n logged · kg × reps · Next: set n+1 of m", "Next kg × reps" and Skip, as in 27c.
- [ ] When the countdown reaches zero, the view shows the next set without the app running (the view checks `restEndsAt` against the current date); the app clears the rest fields on its next update.
- [ ] Skip on the activity clears rest on the activity; skip in the app clears it on the activity too.
- [ ] The last set of a workout has no rest state; finishing ends the activity as in LA1b.
- [ ] JS: `LiveActivityState` and the mapping in `liveActivityNative.ts` carry the two rest fields; Android and web do nothing.
- [ ] PR has the device checklist for Firoz: log a set, lock the phone, watch the countdown against 27c, tap Skip, let a second rest run out.

## Out of scope
- Widget buttons → sync outbox (LA2, W3). Android (LA3, W3). Changing the rest length or the in-app timer. Push updates (post-beta).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/liveActivity.test.ts`: rest fields set on set logged, cleared on skip and on expiry, absent on the last set.
- `apps/mobile/src/notifications/liveActivitySession.test.ts`: one update at rest start and one at rest end or skip.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Frame `27c-trainee-lock-live-rest-ios.png` (393x852). Firoz checks on device (X3 dev build) and attaches a photo to the PR.

## Stop conditions
- The cut-line (Thu 12 Nov) has passed without LA1 working on Firoz's iPhone.
- The work needs a Mac, Xcode or an `eas build`; write the code, list the device checklist for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
