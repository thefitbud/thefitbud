# W12 Maestro map: v3 flow → Maestro file

Created by Z12-32 (planning, 14 Nov 2026). Source of the flows: `docs/design/v3/flows/flows.md` (28 flows); tap list per screen: `docs/design/v3/flows/index.md`. Z12-58 writes the files and moves each row from `planned` to `written`, then `passing (iOS, Android)`. Mobile tasks that add a flow for their device gate (W12-PROMPT §3, step 2) write it at the path below and update the row.

## Rules

- Path: `apps/mobile/.maestro/flows/v3/<flow ID>-<slug>.yaml`, tag `device` (plus `trainee`, `trainer` or `dual`). They run in the Z12-35 device workflow on the iOS simulator and the Android emulator against the **local demo seed** (D-W12-16), as the demo personas in `flows.md` (`aarav.ontrack`, `karan.dual`, `rahul.coach`, and the seed additions from Z12-34).
- Every flow ends each screen with `runFlow: ../../common/assert-no-crash.yaml` (extended by Z12-35) and takes a screenshot named `<screen ID>-<theme>-<platform>.png`.
- **Older flows stay.** The flows under `flows/auth`, `flows/trainee`, `flows/trainer` and `session-persists.yaml` run in `qa.yml` against staging with the QA seed accounts (`qa+…`), and `qa.yml` is unchanged in W12 (D-W12-16). "Covers" below means the v3 flow walks the same journey on the demo seed; nothing older is deleted in W12. Z12-58 lists any old flow the v3 set makes redundant as a follow-up.
- Lock-screen notification and Live Activity taps cannot be done by Maestro: Z12-35's XCUITest / `idb ui tap` (iOS) and UiAutomator (Android) helpers do those steps (F13, F20).

## Map

| Flow | Role | Planned file | Older flows it covers | Status |
|---|---|---|---|---|
| F01 | Trainee | `flows/v3/F01-first-install.yaml` | `trainee/today.yaml` (last step only); invite and intake are new | planned |
| F02 | Trainee | `flows/v3/F02-sign-in.yaml` | `auth/sign-in-password.yaml`, `auth/sign-in-code.yaml` | planned |
| F02b | Trainee | `flows/v3/F02b-auth-errors.yaml` | `auth/sign-in-code.yaml` (code path) | planned |
| F03 | Trainee | `flows/v3/F03-first-workout.yaml` | `trainee/workout-log.yaml` | planned |
| F04 | Trainee | `flows/v3/F04-plan-deviation.yaml` | `trainee/workout-log.yaml` (set logging) | planned |
| F05 | Trainee | `flows/v3/F05-exercise-detail-rest.yaml` | `trainee/workout-log.yaml` (rest timer) | planned |
| F06 | Trainee | `flows/v3/F06-interruptions.yaml` | `session-persists.yaml` (kill and relaunch pattern) | planned |
| F07 | Trainee | `flows/v3/F07-diet-day.yaml` | `trainee/meal-log.yaml` (eaten as planned, Something different) | planned |
| F08 | Trainee | `flows/v3/F08-log-it-myself.yaml` | `trainee/meal-log.yaml` (food library search) | planned |
| F09 | Trainee | `flows/v3/F09-diet-edit-delete-late.yaml` | none (new) | planned |
| F10 | Trainee | `flows/v3/F10-offline-sync.yaml` | none (new; Android airplane mode, iOS API stop per Z12-35) | planned |
| F11 | Trainee | `flows/v3/F11-weekly-checkin.yaml` | `trainee/checkin.yaml` | planned |
| F12 | Trainee | `flows/v3/F12-progress-weight.yaml` | `trainee/progress.yaml` | planned |
| F13 | Trainee | `flows/v3/F13-notifications-deep-links.yaml` | none (new; lock-screen steps through the Z12-35 helpers) | planned |
| F14 | Trainee | `flows/v3/F14-ask-coach.yaml` | none (new) | planned |
| F15 | Trainee | `flows/v3/F15-settings-account.yaml` | `trainee/settings.yaml` | planned |
| F16 | Trainee | `flows/v3/F16-expiry-errors-ended.yaml` | none (new) | planned |
| F17 | Dual | `flows/v3/F17-role-switch.yaml` | `auth/role-select.yaml` (the demo seed has `karan.dual`, so role select is reachable) | planned |
| F20 | Trainer | `flows/v3/F20-triage-nudge.yaml` | `trainer/attention.yaml` (inbox and review sheet) | planned |
| F21 | Trainer | `flows/v3/F21-review-resolve-notes.yaml` | `trainer/attention.yaml` (resolve), `trainer/notes-more.yaml` (note) | planned |
| F22 | Trainer | `flows/v3/F22-reply-question.yaml` | none (new) | planned |
| F23 | Trainer | `flows/v3/F23-review-checkin.yaml` | `trainer/checkin-review.yaml` | planned |
| F24 | Trainer | `flows/v3/F24-session-diet-review.yaml` | none (new) | planned |
| F25 | Trainer | `flows/v3/F25-clients-activity.yaml` | `trainer/clients.yaml` | planned |
| F26 | Trainer | `flows/v3/F26-ended-reactivation.yaml` | `trainer/clients.yaml` (client status) | planned |
| F27 | Trainer | `flows/v3/F27-offline-loading-errors.yaml` | none (new) | planned |
| F28 | Trainer | `flows/v3/F28-settings-inperson-signout.yaml` | `trainer/notes-more.yaml` (More) | planned |
| F29 | Trainee | `flows/v3/F29-future-days.yaml` | `trainee/today.yaml` (day navigation) | planned |

28 flows. Owner by task (who first writes the file for its device gate): F02, F02b, F15, F16, F17 → Z12-49 (F01 too); F03–F06 → Z12-45 (F03 summary part → Z12-44); F07, F09 → Z12-42; F08 → Z12-43; F10 → Z12-41; F11, F12 → Z12-46; F13 → Z12-47 (Live Activity steps Z12-48); F14 → Z12-49; F20, F25 → Z12-50 then Z12-53; F21 → Z12-51; F22–F28 → Z12-53 (F28 in-person meal → Z12-52); F29 → Z12-39. Z12-58 writes any not yet written.
