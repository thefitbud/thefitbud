---
id: LA3b
title: Workout screen drives the Android notification and drains its outbox
batch: W3
depends_on: [LA3]
lane: mobile-native
files_owned:
  - apps/mobile/src/notifications/liveActivityNative.ts
  - apps/mobile/src/notifications/liveActivityNative.test.ts
  - apps/mobile/src/notifications/liveActivityOutbox.ts
  - apps/mobile/src/notifications/liveActivityOutbox.test.ts
frames: []
model: opus
size: S
---

## Outcome
On Android, starting a workout shows the ongoing notification, logging a set updates it, finishing removes it, and Log set taps are drained into the sync outbox like iOS.

## Context
- Split from v14 LA3. LA1's wrapper is a no-op on Android today; LA2's drain is iOS only.

## Gap list
- `liveActivityNative.ts` (LA1) returns early on Android.
- `liveActivityOutbox.ts` (LA2) reads only the iOS module.

## Acceptance criteria
- [ ] Android path calls the LA3 module; unsupported or notifications off → no-op.
- [ ] Drain reads both platforms through one function with the same dedupe keys.

## Out of scope
- Native code (LA3).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Extend both test files: Android start/update/end calls; Android drain dedupe.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI. Firoz's Android checklist: start workout → notification; Log set twice from the shade → one set logged.

## Stop conditions
- The work needs a Mac, Xcode, Android Studio or an `eas build`; write the code, put the device checklist in the PR for Firoz, and stop there.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
