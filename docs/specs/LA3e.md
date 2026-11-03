---
id: LA3e
title: Android rest notification is a countdown only, no progress bar
batch: W3
depends_on: [LA3c]
lane: mobile-native
files_owned:
  - apps/mobile/targets/android/WorkoutSetNotification.kt  # header and buildResting() comments only
frames:
  - { frame: "27-android-rest.png", viewport: "412x915" }
model: opus
size: S
---

## Outcome
While resting, the Android ongoing workout notification shows a live countdown from the system Chronometer and no progress bar, which matches the updated frame `27-android-rest.png`.

## Context
- **D-W3-13** (decided by Firoz, 3 Nov 2026): the rest notification uses only the system chronometer countdown (`setUsesChronometer` + `setChronometerCountDown`, API 24+). There is no progress bar, no stepped bar and no foreground service for rest.
- Why: a notification progress bar moves only when the app reposts the notification. Reposting reliably needs alarms, which are throttled while the phone is idle, or a foreground service, which costs battery and needs a declared service type for Play. The chronometer is kept exact by the system with one post per rest.
- `27-android-rest.png` and its HTML were updated on 3 Nov 2026 to remove the bar. The frame is otherwise unchanged.

## Gap list
- On `main` at 8a37dd0, `buildResting()` already draws no bar. Its comment (`WorkoutSetNotification.kt:259-262`) calls this a "Deviation reported in the PR". It is no longer a deviation: it is D-W3-13.
- No other behaviour gap. The implementer re-checks against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The `buildResting()` comment cites D-W3-13 and the updated frame, and no longer says "deviation".
- [ ] No `ProgressBar`/`setProgress` in the rest layout or builder, and no foreground service or extra alarm is added for rest.
- [ ] The resting notification still matches `27-android-rest.png` (countdown in the header and the body, Next row, Skip rest, Open). Device screenshot in the PR.

## Out of scope
- Any behaviour change to rest, Skip or the set notification. iOS Live Activity (27c).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- None (comment-only change). Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- `27-android-rest.png` at 412x915 on an Android device or emulator. Capture to `docs/qa/LA3e/` and attach to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
