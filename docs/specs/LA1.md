---
id: LA1
title: iOS Live Activity: widget target and native start/update/end bridge
batch: W2
depends_on: [X6]
lane: mobile-native
files_owned:
  - apps/mobile/package.json
  - apps/mobile/app.config.js  # plugins list only
  - apps/mobile/modules/live-activity/expo-module.config.json
  - apps/mobile/modules/live-activity/ios/LiveActivityModule.swift
  - apps/mobile/modules/live-activity/ios/LiveActivity.podspec
  - apps/mobile/modules/live-activity/index.ts
  - apps/mobile/src/notifications/liveActivityNative.ts
  - apps/mobile/src/notifications/liveActivityNative.test.ts
  - pnpm-lock.yaml  # shared with WD1 under the W2.md lockfile rule
frames: []
model: opus
size: M
---

## Outcome
An EAS dev build includes the `FitBudLiveActivity` widget target, and the app can start, update and end a `FitBudWorkoutAttributes` Live Activity from JS through a small local Expo module; on Android, web and iOS below 16.2 the calls do nothing.

## Context
- v14 LA1, split in W2.md: this task is the build target and bridge; LA1b wires the bridge into the workout screen. v14 C13 and D-B7: local updates only, no APNs push; cut-line Thu 12 Nov. Whether Live Activity is in the beta at all is **D-W2-6, Open** (v14 line 108 still lists it as post-beta).
- Already written: widget UI and `LiveActivityIntent`s in `apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift` (`FitBudWorkoutAttributes` at `:34-52`, `ContentState` fields `exerciseName, setIndex, setCount, kilograms, reps, planKilograms, planReps, lastKilograms, lastReps, loggedLine, finished`; attributes `workoutName`, `openUrl`), target config `apps/mobile/targets/FitBudLiveActivity/expo-target.config.js` (widget, iOS 17.0, App Group), plugin `apps/mobile/plugins/withLiveActivity.js` (`NSSupportsLiveActivities`, App Group), JS state in `apps/mobile/src/notifications/liveActivity.ts` (`LiveActivityState`, `reduceLiveActivity`).
- X6 (W1) owns `app.json`, `app.config.js`, `withLiveActivity.js`, `expo-target.config.js` and the Swift App Group constant, and makes the App Group per variant. Merge after X6; edit only the plugins list in `app.config.js` and do not touch X6's files otherwise.
- The native module must declare its own copy of `FitBudWorkoutAttributes` with identical field names and types (ActivityKit matches by type name and Codable shape); a comment in both places says they must stay in sync. Do not edit the widget Swift file.
- Pick an `@bacons/apple-targets` version whose README states support for Expo SDK 52 (`expo ~52.0.46`, `apps/mobile/package.json:26`) and say which in the PR.
- Agents can't compile Swift on Linux. The PR must include the device checklist below for Firoz on his X3 dev build.

## Gap list
- `apps/mobile/package.json`: no `@bacons/apple-targets`.
- `apps/mobile/app.json:28` plugins are `["./plugins/withLiveActivity", "expo-dev-client"]`; the target is never added to the build (`expo-target.config.js` header says so).
- `apps/mobile/modules/`: does not exist; no native start/update/end.
- `apps/mobile/src/notifications/liveActivity.ts`: pure state helpers only; nothing calls ActivityKit.

## Acceptance criteria
- [ ] `@bacons/apple-targets` is in `apps/mobile/package.json` and in the plugins list after `./plugins/withLiveActivity`; `npx expo config --type prebuild` shows the target without errors on Linux.
- [ ] Local Expo module `live-activity` (Swift, Expo Modules API) exposes `start(attributes, state) → id`, `update(state)`, `end(finalState?)` and `isSupported()`; it no-ops and returns false when `ActivityAuthorizationInfo().areActivitiesEnabled` is false or iOS < 16.2.
- [ ] `src/notifications/liveActivityNative.ts` wraps the module, maps `LiveActivityState` to `ContentState`, never throws (errors become a logged no-op with the error name only), and is a no-op on Android and web (the module is not required there).
- [ ] No push token, APNs or network code.
- [ ] PR has the device checklist: install dev build; a debug-only call starts an activity on the lock screen; update changes kg/reps; end removes it; Dynamic Island shows on a supported phone.

## Out of scope
- Calling it from the workout screen (LA1b). Widget buttons → sync outbox (LA2, W3). Android notification (LA3, W3). Push updates (post-beta). Rest timer (D-W2-12).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/notifications/liveActivityNative.test.ts` (new): with a mocked module, state mapping is exact; unsupported → no calls; module throws → no throw; Android/web → no calls.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Firoz on device (X3 dev build) compares the activity with `27-trainee-lock-live-activity-ios.png` and `27b-trainee-live-activity-expanded-ios.png`; result goes in the PR. No agent screenshot is possible.

## Stop conditions
- D-W2-6 (Live Activity in the beta) is still **Open** in W2.md, or the cut-line (Thu 12 Nov) has passed without LA1 working on Firoz's iPhone.
- The work needs a Mac, Xcode or an `eas build`; write the code, list the device checklist for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
