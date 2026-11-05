# Maestro flows for the mobile app (QA1 · QT3, CU19)

End-to-end flows that drive the staging-variant app (`com.thefitbud.mobile.staging`)
against `api-staging.thefitbud.com` through the main trainee and trainer journeys.
Each flow takes screenshots at its key screens and fails on a red box or on
FitBud's own error screen (`common/assert-no-crash.yaml`, QT4). The nightly job and
the PR smoke job run this suite (QT7); `scripts/qa/summarize.mjs` (QT8) turns the
results into the `qa-report` artifact. How to read that artifact:
`docs/runbooks/qa-nightly.md`.

**One suite, two platforms.** `qa.yml`'s `android` job runs these flows on an
Android emulator and its `ios` job runs the **same files** on an iOS simulator
pinned to `Asia/Kolkata` (CU19, D-W3b-14). The iOS staging bundle identifier is the
same as the Android applicationId (`apps/mobile/app.config.js`), so no flow needs a
per-platform `appId`. The two report as separate suites, `mobile` (Android) and
`ios`: a flow that passes on one and fails on the other is the difference the `ios`
job exists to surface, and merging them would hide it.

Push and Live Activity notifications stay on the manual device checklists.

## Platform branches

Where a step genuinely differs, branch inside the flow with
`runFlow: { when: { platform: Android|iOS } }`. **Never fork a flow file per
platform**, and never drop a step on one platform without saying why in a comment
next to it. The branches that exist today:

| Where | Why |
|---|---|
| `flows/trainer/attention.yaml` | dismissing the review sheet: `pressKey: back` on Android, the sheet's own "Dismiss sheet" scrim on iOS, which has no hardware back key |
| `session-persists.yaml` step 3 | "back on the root screen leaves the app" is Android-only behaviour; iOS has no equivalent, so the step is skipped there and step 2 (kill and relaunch) carries the platform-independent half |

## Layout

```
.maestro/
  config.yaml                   workspace config: flows/** and the tag filters
  common/
    assert-no-crash.yaml        QT4: red-box / error-screen assertions
    sign-in-password.yaml       sign in with email + password
    sign-in-code-request.yaml   up to the empty code field
    sign-in-code.yaml           sign in with the staging login code
  flows/
    auth/      sign-in-code, sign-in-password, role-select
    trainee/   today, workout-log, meal-log, checkin, progress, settings
    trainer/   clients, attention, checkin-review, notes-more
  session-persists.yaml         AB3, manual, not part of the suite
```

Every flow starts with `launchApp: clearState: true`, signs in through a `common/`
subflow, and calls `assert-no-crash.yaml` after every screenshot.

| Flow | Tags | Account | Sign-in |
|---|---|---|---|
| `auth/sign-in-code.yaml` (includes the QT9 double tap) | auth, trainee, smoke, full | on-track trainee | code |
| `auth/sign-in-password.yaml` | auth, trainer, smoke, full | trainer | password |
| `auth/role-select.yaml` (single-role skip, both roles) | auth, trainer, trainee, full | trainer, on-track | password |
| `trainee/today.yaml` | trainee, smoke, full | on-track | password |
| `trainee/workout-log.yaml` | trainee, full | slipping | code |
| `trainee/meal-log.yaml` | trainee, full | on-track | password |
| `trainee/checkin.yaml` | trainee, full | slipping | code |
| `trainee/progress.yaml` | trainee, full | on-track | password |
| `trainee/settings.yaml` (profile, reminders, privacy, sign out) | trainee, full | on-track | password |
| `trainer/clients.yaml` | trainer, smoke, full | trainer | password |
| `trainer/attention.yaml` (resolves one exception) | trainer, full | trainer | password |
| `trainer/checkin-review.yaml` | trainer, full | trainer | password |
| `trainer/notes-more.yaml` | trainer, full | trainer | password |

The slipping account is code-only (`signIn: otp_only` in the QA seed), so the two
flows that need it use the code. Everything else signs in by password, which keeps
the number of code requests per run low.

## Prerequisites

1. **Maestro CLI** (needs Java 17+):
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   maestro --version
   ```
2. **A device.** For Android, an emulator on API 34, `x86_64`, Google APIs image
   (the CI runner uses the same). Start it before the run and wait until
   `adb devices` lists it:
   ```bash
   adb devices
   ```
   For iOS, a simulator **set to `Asia/Kolkata`** — the dates every flow asserts
   are written in that zone. The simulator takes its zone from the host, which is
   what `qa.yml`'s `ios` job sets and then reads back from inside the simulator
   before it runs anything. The CI pins are in that job: Xcode 16.4, device type
   `iPhone-16`, runtime `iOS-18-6`.
3. **The staging-variant APK.**
   - **`preview` profile (use this).** A release-style bundle with the staging API
     baked in (`apps/mobile/eas.json`, `APP_VARIANT=staging`). QT7 builds it on the
     runner with `expo prebuild` and Gradle. By hand, `eas build --profile preview
     --platform android` is a remote build that Firoz runs, not an agent. Install:
     ```bash
     adb install -r path/to/app-preview.apk
     adb shell pm list packages | grep com.thefitbud.mobile.staging
     ```
   - **The iOS simulator app.** `scripts/qa/build-ios-sim.sh` builds it locally on
     macOS (`expo prebuild` + `pod install` + `xcodebuild`, Release so the JS
     bundle is embedded and compiled to Hermes bytecode, as on a device), then
     `scripts/qa/run-maestro-ios.sh` installs and drives it. No EAS and no new
     secret (D-QA1-8, D-W3b-14).
   - **`development` profile.** Also works, but the dev client opens a launcher
     first. Start Metro (`pnpm --filter @fitbud/mobile start`), open the dev client
     once and point it at the bundle so it opens straight into the app on
     `launchApp`. The flows do not drive the launcher. The preview build has no
     red box; the flows then rely on a screen-specific assertion at every step
     rather than on the red-box check alone.

## Environment variables

Maestro does not read your shell environment; pass each value with `-e NAME=value`.
Names only here. Values never go in a flow, a PR, a log or a chat.

| Name | Where the value comes from | Used by |
|---|---|---|
| `QA_TRAINER_EMAIL` | `accounts[key=trainer].email` in `apps/api/src/seed/qa/expectations.json` (committed) | trainer flows, role-select |
| `QA_ONTRACK_EMAIL` | `accounts[key=ontrack].email`, same file | on-track flows |
| `QA_SLIPPING_EMAIL` | `accounts[key=slipping].email`, same file | workout-log, checkin |
| `QA_OTP_CODE` | GitHub secret `QA_TEST_OTP_CODE` (the staging test-mode login code, QT1) | the code sign-in |
| `QA_PASSWORD` | GitHub secret `FITBUD_QA_PASSWORD` | the password sign-in |
| `QA_TODAY_WORKOUT_NAME` (optional) | `accounts[key=ontrack].today.workoutName` in the run's `apps/api/.qa-seed/expectations.json`; leave unset or empty on a rest day | `trainee/today.yaml` |
| `QA_TODAY_MEAL_NAME` (optional) | `accounts[key=ontrack].today.mealNames[0]`, same file | `trainee/today.yaml` |

The QA display names (`QA Aarav`, `QA Rohan`) are set as defaults in the header of
the trainer flows; the runner may override them with `QA_ONTRACK_NAME` and
`QA_SLIPPING_NAME`. Emails, names and ids come from the **committed**
`expectations.json`. Anything dated (`today`, `rowCounts`, `referenceDate`,
`loggableWorkout`) comes only from the **run's own** `.qa-seed/expectations.json`,
because it changes every night (D-QA1-3). The two optional variables above are the
only dated values the suite reads, and the flows check structure only without them.

The QA personas have rest days (Wed, Fri and Sun in the sample week), so
`today.workoutName` being empty is a valid state, not a failure. For the same
reason `workout-log.yaml` uses the slipping account and takes whichever of "Start
workout" or "Log it" the Workout tab offers, rather than assuming today.

## Run

From the repo root, with the emulator up and the APK installed:

```bash
EXP=apps/api/src/seed/qa/expectations.json
export QA_TRAINER_EMAIL=$(jq -r '.accounts[] | select(.key=="trainer").email' "$EXP")
export QA_ONTRACK_EMAIL=$(jq -r '.accounts[] | select(.key=="ontrack").email' "$EXP")
export QA_SLIPPING_EMAIL=$(jq -r '.accounts[] | select(.key=="slipping").email' "$EXP")
# QA_OTP_CODE and QA_PASSWORD: export them from your vault; do not echo them.

maestro test \
  -e QA_TRAINER_EMAIL="$QA_TRAINER_EMAIL" \
  -e QA_ONTRACK_EMAIL="$QA_ONTRACK_EMAIL" \
  -e QA_SLIPPING_EMAIL="$QA_SLIPPING_EMAIL" \
  -e QA_OTP_CODE="$QA_OTP_CODE" \
  -e QA_PASSWORD="$QA_PASSWORD" \
  --format junit \
  --test-output-dir qa-results/mobile \
  --include-tags smoke \
  apps/mobile/.maestro
```

On an iOS simulator, add `--device <udid>` and write to `qa-results/ios` instead;
`scripts/qa/run-maestro-ios.sh` does exactly that.

- `--include-tags smoke` runs the smoke set (auth, Today, trainer Clients).
  `--include-tags full`, or no filter, runs everything.
- A single flow: replace the last argument with the flow file, for example
  `apps/mobile/.maestro/flows/trainee/today.yaml`.
- Run the **workspace directory** (`apps/mobile/.maestro`), not `.../flows`, so
  `config.yaml` is picked up. Pointing at `.../flows` also works if you pass
  `--include-tags` yourself.
- Flows run in path order, auth then trainee then trainer. Keep it: the trainer
  `attention.yaml` resolves exceptions, which can close the slipping client's
  workout logging that `workout-log.yaml` needs.

### Results

The QT8 contract:

| File | Where |
|---|---|
| JUnit report | `qa-results/mobile/junit.xml` |
| Screenshots | `qa-results/mobile/**/<flow>__<step>.png` (Maestro writes them into `--test-output-dir`) |
| App log | `qa-results/logs/logcat.log` (the runner captures it: `adb logcat -d > qa-results/logs/logcat.log`) |

And the iOS equivalents (CU19):

| File | Where |
|---|---|
| JUnit report | `qa-results/ios/junit.xml` |
| Screenshots | `qa-results/ios/**/<flow>__<step>.png` |
| App log | `qa-results/logs/ios-sim.log` (`scripts/qa/run-maestro-ios.sh` streams the simulator's unified log for the app process) |

`summarize.mjs` scans each device log for a crash and fails that suite on one even
when every flow passed, which is how an iOS-only Hermes `RangeError` (the CU17
class of bug, D-W3b-11a) is caught: it red-boxes a screen without necessarily
failing an assertion.

A suite that emits no `junit.xml`, zero tests, or only skipped tests is reported as
`error`. Then `node scripts/qa/summarize.mjs ...` as in `docs/runbooks/qa-nightly.md`.

The flows write to the QA accounts (workout and meal logs, a check-in, an
exception resolved, a check-in reviewed, a note). That is intended (D-QA1-7); the
nightly reset restores them. On a run without a reset (a PR smoke run, or a second
run the same night) the data stays changed, so later runs of the full suite can
fail on data they changed themselves. The smoke set writes nothing.

## Screenshots must never show the login code (D-QA1-14)

Screenshots are copied byte for byte into the public `qa-report` artifact and
cannot be redacted. The QA login code is documented as non-secret, but the suite
still never publishes it:

- **No `takeScreenshot` between typing the code and the signed-in home.**
  `auth/sign-in-code.yaml` takes one shot before the code is typed (the empty
  field) and one after sign-in. `common/sign-in-code.yaml` takes none.
- **Maestro also screenshots a failing command** (`screenshot-❌-...png`). The code
  field does not clear on a failed sign-in, so every command that can fail while
  the code is on screen is `optional: true`, and a sign-in that did not leave the
  code screen wipes the field *before* the final assertion that would fail.
- The code arrives through an environment variable, so a clean flow file does not
  prove clean images. After the first real run, open the code-screen PNGs
  (`auth-sign-in-code__code-requested` and every `screenshot-❌` file, if any) and
  check that the code field is empty. A flow review cannot show that.

If a future change adds a screenshot to any flow that types `QA_OTP_CODE`, it must
keep that window clean. `D-QA1-14` holds only while the code works only on
staging, only for the `qa+...@thefitbud.com` allowlist and only for login.

## Screenshot to design-frame map

`scripts/qa/summarize.mjs` (`parseFrameMap`) reads this table, and the UI bot uses
it to compare the captured screens with the locked frames in
`docs/design/mockups/png/`. One screenshot name and one frame per row. Android
frames are used where one exists, iOS frames otherwise. The same names are
captured on both platforms, so expect platform chrome to differ from whichever
frame a row names.

| Screenshot | Frame | Note |
|---|---|---|
| auth-sign-in-code__start | 06-trainee-signin-ios.png | password screen, where the code link lives |
| auth-sign-in-code__code-requested | 06b-trainee-signin-code-ios.png | code field still empty |
| auth-sign-in-code__signed-in | 04-trainee-today-android-v3-partial.png | |
| auth-sign-in-password__start | 06-trainee-signin-ios.png | |
| auth-sign-in-password__signed-in | 05-trainer-mobile-needs-you-v3-ios.png | |
| auth-role-select__trainer-skip | 05-trainer-mobile-needs-you-v3-ios.png | no role select for a single role |
| auth-role-select__trainee-skip | 04-trainee-today-android-v3-partial.png | |
| trainee-today__loaded | 04-trainee-today-android-v3-partial.png | a rest day matches the rest frame instead |
| trainee-workout-log__workout-tab | 10-trainee-workout-overview-ios.png | |
| trainee-workout-log__active | 11-trainee-active-workout-v3-ios.png | |
| trainee-workout-log__rest | 11b-trainee-active-workout-rest-v3-ios.png | |
| trainee-workout-log__summary | 12-trainee-workout-summary-ios.png | |
| trainee-meal-log__diet | 07-trainee-diet-ios.png | |
| trainee-meal-log__something-different | 08-trainee-something-different-ios.png | |
| trainee-meal-log__food-search | 09-trainee-food-search-ios.png | |
| trainee-meal-log__logged | 07-trainee-diet-ios.png | after a changed meal |
| trainee-checkin__form | 14-trainee-check-in-v3-ios.png | |
| trainee-checkin__sent | 100-trainee-checkin-sent-ios.png | |
| trainee-progress__loaded | 13-trainee-progress-ios.png | |
| trainee-settings__more | 16-trainee-more-ios.png | |
| trainee-settings__reminders | 79-trainee-reminder-settings-android.png | |
| trainee-settings__signed-out | 06-trainee-signin-ios.png | |
| trainer-clients__list | 17-trainer-mobile-clients-ios.png | |
| trainer-client-status__loaded | 18-trainer-mobile-client-status-ios.png | |
| trainer-attention__inbox | 05-trainer-mobile-needs-you-v3-ios.png | |
| trainer-attention__review-sheet | 31-trainer-mobile-review-sheet-v3-ios.png | |
| trainer-attention__after-resolve | 05-trainer-mobile-needs-you-v3-ios.png | one fewer open item |
| trainer-checkin-review__inbox | 50-trainer-mobile-checkins-android.png | |
| trainer-checkin-review__review | 19-trainer-mobile-check-in-review-ios.png | |
| trainer-notes__composer | 36-trainer-mobile-note-composer-sheet-ios.png | the app composes inline, not in a sheet |
| trainer-more__loaded | 51-trainer-mobile-more-ios.png | |

Screenshots with **no locked frame** (they still get the no-crash check; the UI
bot has nothing to compare them with):

- trainee-checkin__card, trainee-checkin__review: Today's check-in card and the review step have no frame.
- trainee-settings__profile, trainee-settings__privacy: no frame for the trainee profile or privacy screens (the ds5 frames are the web policy pages).
- trainer-exception__review, trainer-exception__resolved: mobile resolves from a full exception screen. Frames 33 and 37 show a sheet and a banner that the app does not have, so they are not mapped.
- trainer-checkin-review__saved: the inbox after saving; frame 75 shows a snackbar the flow does not assert.

## What the flows assert, and where they stop

Every asserted string was checked against the app source. There are almost no
`testID`s, so the flows use visible text and accessibility labels and make no app
change. Known gaps, to be fixed in a follow-up (QT3b) that touches app code:

- **Text fields without a wired label.** `Field` renders its label as a separate
  `Text`, so the code field has no name of its own. `common/sign-in-code.yaml`
  taps "the element below `6-digit code`". An `accessibilityLabel` on `Field`'s
  `TextInput` would make that a plain tap. TODO(QT3b).
- **Role select** cannot be reached: the QA seed has no account with both roles.
  The flow asserts the single-role skip instead. TODO(QT3b) with a dual-role account.
- **Check-in fill-and-send** is unconditional (CU11). The QA seed guarantees
  exactly one check-in the slipping trainee can start on the seed's reference date
  (`guarantees.startableCheckinsSlipping`), with its window open for the whole
  civil day in that trainee's own timezone, as well as the *submitted* one waiting
  for the trainer (`guarantees.pendingCheckinsSlipping`, for
  `trainer/checkin-review.yaml`).
- **Resolve** happens on the exception screen, reached from the client status.
  The review sheet's "Resolve…" is not wired in the Attention tab, and "Mark
  reviewed" only moves a client to Reviewed.
- **Rest timer** assertions use the visible countdown ("N s left"); the flow
  checks that the number changes, not how long a second takes.
- The flows first ran on 3 Nov 2026, in the `android` job of QA runs 41648846215
  and 41651787474 (CU18, which fixed the `common/` subflows the suite could not
  parse). **The suite runs. It is not green, nothing about why is settled, and the
  two runs disagree** — on byte-identical flow files, with the APK built and
  installed both times:
  - 41648846215 collected and ran all four `smoke` flows.
    `auth/sign-in-password.yaml` and `trainer/clients.yaml` passed.
    `auth/sign-in-code.yaml` failed waiting for the `6-digit code` field after
    "Send code"; `trainee/today.yaml` failed on
    `assertNotVisible: ".*is preparing your plan.*"` *after* `Today's workout` was
    already visible.
  - 41651787474 failed all four, each on its first step: the 30-second wait for
    "Sign in with a code instead" straight after `launchApp`. The app never
    reached the auth screen, so that run says nothing about any later assertion.
  Do **not** read the first run's two failures as stale QA data. A pull-request
  run does not write staging (D-QA1-6), but the accounts had been reset and
  seeded successfully at 13:24 UTC that day — the `seed-reset` job of run
  41643846967, dispatched from `main` — that run's own `android` job was cancelled
  13 seconds later without installing an APK or running a flow, and its
  `api-smoke` and `web-staging` jobs were skipped. Nothing wrote the accounts
  between that seed and 14:09, when the suite ran. The Today failure
  (`.*is preparing your plan.*` while `Today's workout` was already visible)
  was a real client defect and is CU22. The code-screen failure
  (`6-digit code` never appears after "Send code") is CU21, and it is not the
  launch failure: CU22's android run 41787562558 reached the auth screen,
  signed in, and passed password, Clients and Today, and still failed that one
  assertion.
- **CU25, the launch failure.** Run 41784737040 failed the same first step on
  both platforms. The screenshots show two different causes, both in the suite:
  - Android (`qa-raw-mobile`): the sign-in form is on screen, including
    "Sign in with a code instead", with a "Pixel Launcher isn't responding"
    dialog on top of it. Maestro only reads the top window, so the text is
    reported not visible. `run-maestro.sh` sets `hide_error_dialogs` to 1
    before the flows. A crash is still caught from logcat.
  - iOS (`qa-raw-ios`): the screen is "Something went wrong / We could not
    load your coaching account / Can't reach FitBud", and `logs/ios-sim.log`
    shows errSecMissingEntitlement (-34018, no application-identifier and no
    keychain-access-groups) on every launch. The simulator app was unsigned
    (`CODE_SIGNING_ALLOWED=NO`). SecureStore's throw is treated as offline, so
    sign-in is never shown. `build-ios-sim.sh` ad-hoc signs the app afterwards.
    That needs no certificate. The app itself is unchanged: a signed build
    with nothing stored still opens on sign-in.
