# Z14-41: held rating and note sent at launch and on foreground

No UI changed, so there are no screenshots. Automated cover:
`apps/mobile/src/trainee/TraineeShell.heldFeedbackResume.render.test.tsx` (real sync engine, outbox and held-feedback store; only the network is faked). It checks: sent on shell mount with Workout never opened (mutation id and idempotency key are the saved token); sent when AppState goes to `active` (not on `background`); shell plus a Workout-tab resume send once; a hold past the 48 h window is dropped unsent; another owner's hold is untouched; a failing resume does not stop the first screen. Removing the shell call fails three of these.

## Device steps (FitBud UI; builds on `docs/qa/Z14-37/README.md`)

1. As a trainee, finish a workout while offline (airplane mode).
2. Rate it and add a note, then Save. The sheet says it is held.
3. Force-quit the app, turn the network back on.
4. Reopen the app. Do **not** open the Workout tab.
5. Within a few seconds the trainer's view of that workout shows the rating and note.
6. Now open Workout and confirm the rating and note show once (not sent twice).
7. Edge: repeat 1 to 3, wait over 48 h after the finish, reopen: nothing is sent and no error shows.
