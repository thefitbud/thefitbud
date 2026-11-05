---
id: LA2
title: Live Activity buttons drain into the sync outbox
batch: W3
depends_on: [LA1c]
lane: mobile-native
files_owned:
  - apps/mobile/modules/live-activity/ios/LiveActivityModule.swift  # read/clear outbox functions
  - apps/mobile/modules/live-activity/index.ts
  - apps/mobile/src/notifications/liveActivityOutbox.ts
  - apps/mobile/src/notifications/liveActivityOutbox.test.ts
  - apps/mobile/src/trainee/TraineeShell.tsx  # app-active hook only
frames: []
model: opus
size: S
---

## Outcome
Sets logged from the lock-screen Live Activity are saved: when the app becomes active it drains the App Group rows into the sync outbox once each, and a duplicate tap never logs twice.

## Context
- v14 LA2. The widget intent appends rows to the App Group (`apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift:8-24`) with `exerciseName`, `setIndex`, `kilograms`, `reps` only.
- Conflict listed in W3.md: the row says `workout.log_set` (`FitBudLiveActivity.swift:16`, `apps/mobile/src/notifications/liveActivity.ts:169`) but the sync contract has `workout.complete_set` (`packages/contracts/src/sync.ts:41`). Mapping: D-W3-5 (decided by Firoz, 1 Nov 2026): map to `workout.complete_set` using the assignment and exercise ids of the running session kept by LA1b.
- Offline rules: one stable mutation UUID and idempotency key per row (`enqueueAndPush`, `apps/mobile/src/sync/actions.ts:14`).

## Gap list
- Nothing reads `liveActivityOutbox` from the App Group; the native module (LA1) has no read/clear.
- W2 report follow-up: `@bacons/apple-targets` 0.2.1 ignores `infoPlist`, so the widget never gets its `FitBudAppGroup` key (`FitBudLiveActivity.swift:10` reads it) and its outbox writes land where the app can't read them. LA2's device check fails until the widget gets the App Group; if that needs a change outside `files_owned` (for example the target config or `plugins/withLiveActivity.js`, owned by LA3), stop and report.
- No app-active hook in `apps/mobile/src/trainee/TraineeShell.tsx`.

## Acceptance criteria
- [ ] Module adds `readOutbox()` and `removeOutbox(count)`; JS drains on app active and on workout screen focus.
- [ ] Each row gets a key from (session id, set index, kg, reps, row position) so a re-drain or double tap of the same set doesn't enqueue twice; clear only rows drained.
- [ ] Rows with no running session are kept and reported once in the sync status screen copy, not dropped.
- [ ] No-op on Android and web.

## Out of scope
- Android (LA3, LA3b). Push updates (post-beta).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/liveActivityOutbox.test.ts` (new): drain maps and enqueues; duplicate row → one mutation; partial failure keeps the rest; no session → kept.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI. Firoz's device checklist: lock phone mid-workout, tap Log set twice, open app → one set logged in the app and on trainer web.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
