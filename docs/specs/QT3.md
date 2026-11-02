---
id: QT3
title: Maestro E2E flows for the Android app (trainee and trainer journeys)
batch: QA1
depends_on: [QT1, QT2, QT4, QT9]
lane: mobile-maestro
files_owned:
  - apps/mobile/.maestro/config.yaml  # new
  - apps/mobile/.maestro/flows/**  # new
  - apps/mobile/.maestro/common/sign-in-*.yaml  # new subflows (not assert-no-crash.yaml, QT4)
  - apps/mobile/.maestro/README.md  # new
frames: []
model: sonnet
size: M
---

## Outcome
A Maestro suite drives the Android staging-variant app (`com.thefitbud.mobile.staging`, preview or dev build) on an emulator against `api-staging.thefitbud.com` through every main trainee and trainer journey, takes a screenshot at each key screen, and fails on any red box or error screen.

## Context
- **Why:** AB2's crash shipped because unit tests never mount native views; only a real Android run catches it. The OTP bug (QT9) was found by hand. Firoz should not be the test harness.
- **Build:** `apps/mobile/eas.json:15-22` (`preview`, `APP_VARIANT=staging`, staging API) is the default target; the `development` profile also works (dev client must be pointed at a bundle; the README explains both). QT7 builds the APK in CI.
- **Accounts:** read emails, names and today's expected items from `apps/api/src/seed/qa/expectations.json` (QT2) via Maestro `env` set by the runner (`QA_TRAINER_EMAIL`, `QA_ONTRACK_EMAIL`, `QA_SLIPPING_EMAIL`, `QA_OTP_CODE`, `QA_PASSWORD`). The OTP code and password are passed as environment variables from GitHub secrets (`QA_TEST_OTP_CODE`, `FITBUD_QA_PASSWORD`), never written in a flow.
- **Selectors:** the app has almost no `testID`s (two files). Use visible text and accessibility labels. If a journey cannot be driven without a new `testID`, list it in the PR as a follow-up (QT3b) and skip that step with a `# TODO(QT3b)` comment; do not edit app code.
- **Flows** (one file each under `flows/`, tagged `trainee`, `trainer`, `auth`, `smoke`):
  1. `auth/sign-in-code.yaml`: Use code instead → send → enter `QA_OTP_CODE` → lands on role select or Today. Also double-tap check: tap verify twice, expect one sign-in and no error (QT9).
  2. `auth/sign-in-password.yaml`: trainer password sign-in.
  3. `auth/role-select.yaml`: for an account with both roles if seeded, else assert the single-role skip.
  4. `trainee/today.yaml` (on-track): Today renders with today's workout and meals from expectations.
  5. `trainee/workout-log.yaml`: open workout → start → log a set → rest timer appears and counts down → skip rest → finish → summary.
  6. `trainee/meal-log.yaml`: Diet → log a planned meal → "Something different" → food search for a library food (e.g. "dal") → add.
  7. `trainee/checkin.yaml`: open check-in → fill → submit → sent state.
  8. `trainee/progress.yaml`, `trainee/settings.yaml` (profile, notifications, privacy, sign out).
  9. `trainer/clients.yaml`: Clients list shows QA Aarav and QA Rohan; open QA Rohan → status.
  10. `trainer/attention.yaml`: Attention inbox shows ≥2 items for QA Rohan; open an exception → review screen (do **not** resolve automatically in the shared nightly run unless the reset runs first; QT7 runs reset first, so resolving one is allowed and asserted).
  11. `trainer/checkin-review.yaml`: open the pending check-in → review → mark reviewed.
  12. `trainer/notes-more.yaml`: add a note on a client; More screen renders.
- **Every flow:** `takeScreenshot` at each key screen with a stable name `<flow>__<step>` (e.g. `trainee-today__loaded`), then `runFlow: ../common/assert-no-crash.yaml` (QT4). Screenshots land in the output dir set by `--test-output-dir` (QT7/QT8 collect them).
- Flows are independent: each starts with `launchApp: clearState: true` and signs in via a `common/sign-in-*.yaml` subflow.
- Map each screenshot to its design frame in `apps/mobile/.maestro/README.md` (e.g. `trainee-today__loaded` → `04-trainee-today-android-v3-partial.png`, `trainer-client-status__loaded` → `18-trainer-mobile-client-status-ios.png`). The UI bot uses this table.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- No mobile E2E of any kind on `main`; the only E2E is trainer-web Playwright against a local API.

## Acceptance criteria
- [ ] All flows pass `maestro check-syntax` (or a YAML parse test if the CLI is unavailable in the session).
- [ ] Each journey in the list above has a flow; each flow takes ≥1 screenshot and calls `assert-no-crash.yaml` after every screenshot.
- [ ] No secret, OTP code, password or real email appears in any flow file.
- [ ] `config.yaml` sets `flows: flows/**` and the tag filters `smoke` (auth + today + trainer clients, < 5 min) and `full`.
- [ ] `README.md` documents: install Maestro, run an emulator, install the APK, the env vars, `maestro test --format junit --test-output-dir …`, and the screenshot→frame table.
- [ ] **Run evidence:** the implementer has no emulator in a cloud session, so the first real run is QT7's workflow (or Firoz locally). Not claimed by the implementer.

## Out of scope
- iOS flows (iOS builds on hold since 1 Nov). Adding `testID`s or any app code change. Push and Live Activity notifications (device checklists stay manual).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- The flows themselves. A syntax check as above, recorded in the PR.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (unchanged), Maestro syntax check.

## Visual check
- Screenshots are compared against the frames by the UI bot after QT7 runs; n/a for the implementer.

## Stop conditions
- A journey needs a `testID` or other app change to be drivable at all (list them; ship the rest).
- The seed expectations (QT2) do not guarantee the data a flow needs.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
