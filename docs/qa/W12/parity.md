# W12 parity matrix: app vs v3 mocks

Created by Z12-32 (planning, 14 Nov 2026) from `docs/design/v3/screen-profile.md`: **185 screens × 2 themes = 370 rows** (108 trainee incl. W-, 77 trainer). Every light mock under `docs/design/v3/png/` and every dark mock under `docs/design/v3/png-dark/` was checked to exist: none missing.

## How to fill it

- Owner of the rows: the task that builds the screen (see the lanes table in `docs/specs/batches/W12.md`). Each mobile task fills **only its own screen IDs** (device gate step 4, W12-PROMPT §3) and merges `main` before pushing; Z12-58 fills every row that is still `—` and re-checks the rest (D-W12-20).
- Z12-35 adds the generator under `scripts/qa/device/`; it must keep every verdict already written here.
- **Reachable:** `yes · <flow> step <n>` (from `docs/design/v3/flows/flows.md`) or `yes · state: <how>`; `no` needs a reason in the last column and a fix PR or a listed follow-up.
- **Verdicts:** MATCH, CLOSE or GAP per platform. Never claim a pixel match; list what remains in the last column. A GAP or `no` gets a reason and a fix PR or follow-up.
- **App screenshots:** `docs/qa/W12/shots/<screen ID>-<theme>-<platform>.png` (Z12-35 naming), or the task folder `docs/qa/<task ID>/`.
- Which flow reaches a screen: the `Flows` column of `docs/design/v3/screen-profile.md`; "state/variant" screens are reached by seed or scripted state.

Template row (W12-PROMPT §3):

`| TR-26e | light | yes · F08 step 7 | MATCH | CLOSE | shots/TR-26e-light-ios.png, …-android.png | docs/design/v3/png/trainee/TR-26e-custom-food.png | keypad is the system keyboard |`

## Trainee (TR-, W-)

| Screen | Theme | Reachable | iOS | Android | App screenshots | Mock | Remaining differences |
|---|---|---|---|---|---|---|---|
| TR-01a | light | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01a-light-ios.png`, `TR-01a-light-android.png` | `docs/design/v3/png/trainee/TR-01a-signin-password.png` | Placeholder copy kept (shared Maestro subflows tap it) |
| TR-01a | dark | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01a-dark-ios.png`, `TR-01a-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-01a-signin-password.png` | Placeholder copy kept (shared Maestro subflows tap it) |
| TR-01b | light | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01b-light-ios.png`, `TR-01b-light-android.png` | `docs/design/v3/png/trainee/TR-01b-signin-code-request.png` | Label "Mobile number or email" (a number finds the account; the code is emailed) |
| TR-01b | dark | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01b-dark-ios.png`, `TR-01b-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-01b-signin-code-request.png` | Label "Mobile number or email" (a number finds the account; the code is emailed) |
| TR-01c | light | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01c-light-ios.png`, `TR-01c-light-android.png` | `docs/design/v3/png/trainee/TR-01c-signin-code-entry.png` | Auto-submits on the sixth digit |
| TR-01c | dark | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01c-dark-ios.png`, `TR-01c-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-01c-signin-code-entry.png` | Auto-submits on the sixth digit |
| TR-01d | light | no device state | — | — | `docs/qa/Z12-49/web/TR-01d-light-web.png` | `docs/design/v3/png/trainee/TR-01d-set-new-password.png` | Web only (CLOSE): needs the emailed reset code; `docs/qa/Z12-49/web/` |
| TR-01d | dark | no device state | — | — | `docs/qa/Z12-49/web/TR-01d-dark-web.png` | `docs/design/v3/png-dark/trainee/TR-01d-set-new-password.png` | Web only (CLOSE): needs the emailed reset code; `docs/qa/Z12-49/web/` |
| TR-01e | light | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01e-light-ios.png`, `TR-01e-light-android.png` | `docs/design/v3/png/trainee/TR-01e-signin-wrong-password.png` | "That email and password don't match." (or "number"); inline only behind 401 INVALID_CREDENTIALS |
| TR-01e | dark | yes · F02 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-01e-dark-ios.png`, `TR-01e-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-01e-signin-wrong-password.png` | "That email and password don't match." (or "number"); inline only behind 401 INVALID_CREDENTIALS |
| TR-01f | light | no device state | — | — | `docs/qa/Z12-49/web/TR-01f-light-web.png` | `docs/design/v3/png/trainee/TR-01f-signin-rate-limited.png` | Web only (CLOSE): 15 failed tries would lock later flows; no countdown (429 has no retry window) |
| TR-01f | dark | no device state | — | — | `docs/qa/Z12-49/web/TR-01f-dark-web.png` | `docs/design/v3/png-dark/trainee/TR-01f-signin-rate-limited.png` | Web only (CLOSE): 15 failed tries would lock later flows; no countdown (429 has no retry window) |
| TR-01g | light | no device state | — | — | `docs/qa/Z12-49/web/TR-01g-light-web.png` | `docs/design/v3/png/trainee/TR-01g-signin-code-expired.png` | Web only (CLOSE, stubbed OTP_EXPIRED): today's API answers an expired code with OTP_INVALID |
| TR-01g | dark | no device state | — | — | `docs/qa/Z12-49/web/TR-01g-dark-web.png` | `docs/design/v3/png-dark/trainee/TR-01g-signin-code-expired.png` | Web only (CLOSE, stubbed OTP_EXPIRED): today's API answers an expired code with OTP_INVALID |
| TR-02a | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-02a-invite-accept.png` | Not captured: needs an invite token; tokens and dark |
| TR-02a | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-02a-invite-accept.png` | Not captured: needs an invite token; tokens and dark |
| TR-02b | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-02b-invite-expired.png` | Not captured: needs an invite token; tokens and dark |
| TR-02b | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-02b-invite-expired.png` | Not captured: needs an invite token; tokens and dark |
| TR-03 | light | yes · F01 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-03-light-ios.png`, `TR-03-light-android.png` | `docs/design/v3/png/trainee/TR-03-intake-form.png` | Questions come from the pinned form version |
| TR-03 | dark | yes · F01 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-03-dark-ios.png`, `TR-03-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-03-intake-form.png` | Questions come from the pinned form version |
| TR-04 | light | yes · F01 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-04-light-ios.png`, `TR-04-light-android.png` | `docs/design/v3/png/trainee/TR-04-waiting-for-coach.png` | Steps row only with the steps flag; sign-out behind the account button |
| TR-04 | dark | yes · F01 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-04-dark-ios.png`, `TR-04-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-04-waiting-for-coach.png` | Steps row only with the steps flag; sign-out behind the account button |
| TR-05 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-05-reminder-setup.png` | Not captured: Android-only entry; tokens and dark |
| TR-05 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-05-reminder-setup.png` | Not captured: Android-only entry; tokens and dark |
| TR-06a | light | yes · device/z12-40/1 (Aarav signs in) | CLOSE | CLOSE | `docs/qa/Z12-40/TR-06a-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-06a-today-default.png` | Z12-40: eyebrow "Tuesday, 17 Nov", "Today" title and the v3 strip (one-letter weekdays, coral ring on today, dots) match; summary card, hero and rows are v2 (Today v3: Z12-46); the strip keeps ‹ › week chevrons the mock does not draw; run 44098030020 (review fixes, app e4d67bf) |
| TR-06a | dark | yes · device/z12-40/1 | GAP | GAP | `docs/qa/Z12-40/TR-06a-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-06a-today-default.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44098030020 (review fixes, app e4d67bf) |
| TR-06a2 | light | — | — | — | — | `docs/design/v3/png/trainee/TR-06a2-today-scrolled.png` | — |
| TR-06a2 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-06a2-today-scrolled.png` | — |
| TR-06b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-06b-today-rest-day.png` | — |
| TR-06b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-06b-today-rest-day.png` | — |
| TR-06c | light | yes · F29 (yesterday) and device/z12-40/1 (swipe right from today) | CLOSE | CLOSE | `docs/qa/Z12-40/TR-06c-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-06c-today-past-day.png` | Z12-40: eyebrow "… · past day", title "Today", lock banner on the neutral fill ("Past days are read-only." plus the late-log sentence while a meal can still be logged), ink ring on the selected day and coral ring on today match; cards v2 (Z12-46); run 44080890973 |
| TR-06c | dark | yes · F29 (yesterday) | GAP | GAP | `docs/qa/Z12-40/TR-06c-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-06c-today-past-day.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44080890973 |
| TR-06d | light | yes · F29 step 1, device/z12-40/1 (swipe left) | CLOSE | CLOSE | `docs/qa/Z12-40/TR-06d-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-06d-today-future-day.png` | Z12-40: eyebrow "… · planned" and the strip match; Z12-39's banner and preview card unchanged; summary card still shows (Z12-46); the strip shows the "Today" pill when today is in another week (Z12-40 decision 3); run 44080890973 |
| TR-06d | dark | yes · F29 step 1 | GAP | GAP | `docs/qa/Z12-40/TR-06d-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-06d-today-future-day.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44080890973 |
| TR-06e | light | — | — | — | — | `docs/design/v3/png/trainee/TR-06e-today-offline.png` | — |
| TR-06e | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-06e-today-offline.png` | — |
| TR-06f | light | — | — | — | — | `docs/design/v3/png/trainee/TR-06f-today-loading.png` | — |
| TR-06f | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-06f-today-loading.png` | — |
| TR-06g | light | — | — | — | — | `docs/design/v3/png/trainee/TR-06g-today-refresh-error.png` | — |
| TR-06g | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-06g-today-refresh-error.png` | — |
| TR-06h | light | yes · state: coach shares a note, back to Today (`device/z12-38/1-trainee-note-banner.yaml`, run 44094063791) | CLOSE | CLOSE | `docs/qa/Z12-38/TR-06h-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-06h-today-inapp-banner.png` | title now "Rahul left a note" (Z12-47; `docs/qa/Z12-47/TR-06h-light-ios.png`, run 44119639359); opaque `--card` fill, no blur (D-W12-33); the Today behind it is Z12-46's |
| TR-06h | dark | yes · same flow, dark run (run 44094063791) | GAP | GAP | `docs/qa/Z12-38/TR-06h-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-06h-today-inapp-banner.png` | Today is not opted in to dark yet (Z12-46); the banner follows the open screen's theme, so it is light; dark tokens are ready (`--card`, `--edge`, no shadow) |
| TR-07a | light | yes · device/z12-40/1 (Aarav → Diet) | CLOSE | CLOSE | `docs/qa/Z12-40/TR-07a-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-07a-diet-day.png` | Z12-40: eyebrow "Tuesday, 17 Nov · Rahul’s plan" over "Diet" and the shared v3 strip match; summary and rows v2 (Diet v3: Z12-42); run 44098030020 (review fixes, app e4d67bf) |
| TR-07a | dark | yes · device/z12-40/1 | GAP | GAP | `docs/qa/Z12-40/TR-07a-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-07a-diet-day.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44098030020 (review fixes, app e4d67bf) |
| TR-07b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07b-eaten-as-planned-undo.png` | — |
| TR-07b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07b-eaten-as-planned-undo.png` | — |
| TR-07c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07c-diet-no-meals-planned.png` | — |
| TR-07c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07c-diet-no-meals-planned.png` | — |
| TR-07d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07d-diet-offline.png` | — |
| TR-07d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07d-diet-offline.png` | — |
| TR-07e | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07e-diet-over-budget.png` | — |
| TR-07e | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07e-diet-over-budget.png` | — |
| TR-07f | light | yes · state: Diet, yesterday selected | GAP | GAP | `docs/qa/Z12-39/TR-07f-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-07f-diet-locked-and-missed.png` | past day unchanged by Z12-39; v2 Diet layout (Diet v3: Z12-42); run 43743416490 |
| TR-07f | dark | yes · state: Diet, yesterday selected | GAP | GAP | `docs/qa/Z12-39/TR-07f-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-07f-diet-locked-and-missed.png` | renders light; unchanged by Z12-39 (Z12-42); run 43743416490 |
| TR-07g | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07g-logged-meal-detail.png` | — |
| TR-07g | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07g-logged-meal-detail.png` | — |
| TR-07h | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07h-delete-log-confirm.png` | — |
| TR-07h | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07h-delete-log-confirm.png` | — |
| TR-07i | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07i-diet-load-error.png` | — |
| TR-07i | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07i-diet-load-error.png` | — |
| TR-07j | light | — | — | — | — | `docs/design/v3/png/trainee/TR-07j-planned-meal-detail.png` | — |
| TR-07j | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-07j-planned-meal-detail.png` | — |
| TR-07k | light | yes · F29 step 2, device/z12-40/1 (swipe left on Diet) | CLOSE | CLOSE | `docs/qa/Z12-40/TR-07k-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-07k-diet-future-day.png` | Z12-40: eyebrow "… · planned" and the strip match; Z12-39's banner and planned rows unchanged; summary layout v2 (Z12-42); run 44080890973 |
| TR-07k | dark | yes · F29 step 2 | GAP | GAP | `docs/qa/Z12-40/TR-07k-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-07k-diet-future-day.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44080890973 |
| TR-08a | light | — | — | — | — | `docs/design/v3/png/trainee/TR-08a-something-different.png` | — |
| TR-08a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-08a-something-different.png` | — |
| TR-08b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-08b-changed-portion.png` | — |
| TR-08b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-08b-changed-portion.png` | — |
| TR-08c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-08c-ate-out.png` | — |
| TR-08c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-08c-ate-out.png` | — |
| TR-10a | light | — | — | — | — | `docs/design/v3/png/trainee/TR-10a-workout-rest-day.png` | — |
| TR-10a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-10a-workout-rest-day.png` | — |
| TR-10b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-10b-workout-no-plan.png` | — |
| TR-10b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-10b-workout-no-plan.png` | — |
| TR-10c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-10c-workout-missed-banner.png` | — |
| TR-10c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-10c-workout-missed-banner.png` | — |
| TR-13a | light | — | — | — | — | `docs/design/v3/png/trainee/TR-13a-progress-default.png` | — |
| TR-13a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-13a-progress-default.png` | — |
| TR-13b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-13b-progress-empty.png` | — |
| TR-13b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-13b-progress-empty.png` | — |
| TR-13c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-13c-log-weight-sheet.png` | — |
| TR-13c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-13c-log-weight-sheet.png` | — |
| TR-13d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-13d-checkin-history.png` | — |
| TR-13d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-13d-checkin-history.png` | — |
| TR-13e | light | — | — | — | — | `docs/design/v3/png/trainee/TR-13e-progress-photos.png` | — |
| TR-13e | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-13e-progress-photos.png` | — |
| TR-14a | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14a-checkin-questions.png` | — |
| TR-14a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14a-checkin-questions.png` | — |
| TR-14b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14b-checkin-photos.png` | — |
| TR-14b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14b-checkin-photos.png` | — |
| TR-14c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14c-checkin-review.png` | — |
| TR-14c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14c-checkin-review.png` | — |
| TR-14d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14d-checkin-sent.png` | — |
| TR-14d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14d-checkin-sent.png` | — |
| TR-14e | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14e-checkin-offline-queued.png` | — |
| TR-14e | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14e-checkin-offline-queued.png` | — |
| TR-14f | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14f-checkin-overdue.png` | — |
| TR-14f | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14f-checkin-overdue.png` | — |
| TR-14g | light | — | — | — | — | `docs/design/v3/png/trainee/TR-14g-checkin-reviewed.png` | — |
| TR-14g | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-14g-checkin-reviewed.png` | — |
| TR-15a | light | yes · F13 step 3 (`flows/v3/F13-notifications-deep-links.yaml`, run 44130567993 at `cd4742a`) | CLOSE | CLOSE | `docs/qa/Z12-47/TR-15a-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-15a-notifications-inbox.png` | rows hold only what the flow sent (coach notes; the seed's own are older than 30 days); Yesterday/Earlier, reminder rows and their tiles are on Expo web (`docs/qa/Z12-47/web/`); meal rows read "A meal is due" and workout/PR rows have no detail line: the notification record carries no meal, workout or PR names (server follow-up) |
| TR-15a | dark | yes · F13, dark run (run 44130567993 at `cd4742a`) | CLOSE | CLOSE | `docs/qa/Z12-47/TR-15a-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-15a-notifications-inbox.png` | rows hold only what the flow sent (coach notes; the seed's own are older than 30 days); Yesterday/Earlier, reminder rows and their tiles are on Expo web (`docs/qa/Z12-47/web/`); meal rows read "A meal is due" and workout/PR rows have no detail line: the notification record carries no meal, workout or PR names (server follow-up) |
| TR-15b | light | yes · F13 step 7, a trainee with nothing in 30 days (run 44130567993 at `cd4742a`) | CLOSE | CLOSE | `docs/qa/Z12-47/TR-15b-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/TR-15b-notifications-empty.png` | layout and copy match; the gap under the nav differs by a few points |
| TR-15b | dark | yes · F13, dark run (run 44130567993 at `cd4742a`) | CLOSE | CLOSE | `docs/qa/Z12-47/TR-15b-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/TR-15b-notifications-empty.png` | layout and copy match; the gap under the nav differs by a few points |
| TR-15c | light | no · the gate sends one push after the flows (dark only) | GAP | GAP | `docs/qa/Z12-47/lockscreen-notification-dark-ios.png`, `…-shade-dark-android.png` | `docs/design/v3/png/trainee/TR-15c-lockscreen-push.png` | lock-screen text is the server's (`apps/api/src/lib/expo-push.ts`: title "FitBud", body = type label), outside this task's files; Expo push has no iOS thread id; the iOS gate tap found no entry even with permission granted; follow-ups in PR #459 and Z12-58's phone checklist |
| TR-15c | dark | no · as light | GAP | GAP | as light | `docs/design/v3/png-dark/trainee/TR-15c-lockscreen-push.png` | lock-screen text is the server's (`apps/api/src/lib/expo-push.ts`: title "FitBud", body = type label), outside this task's files; Expo push has no iOS thread id; the iOS gate tap found no entry even with permission granted; follow-ups in PR #459 and Z12-58's phone checklist |
| TR-15d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-15d-lockscreen-live-activity.png` | — |
| TR-15d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-15d-lockscreen-live-activity.png` | — |
| TR-16a | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-16a-light-ios.png`, `TR-16a-light-android.png` | `docs/design/v3/png/trainee/TR-16a-reminders.png` | Extra "Evening summary" row; "Updates from Rahul" is the coach-log setting; "Reminders not arriving?" on Android |
| TR-16a | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-16a-dark-ios.png`, `TR-16a-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-16a-reminders.png` | Extra "Evening summary" row; "Updates from Rahul" is the coach-log setting; "Reminders not arriving?" on Android |
| TR-16b | light | no device state | — | — | `docs/qa/Z12-49/web/TR-16b-light-web.png` | `docs/design/v3/png/trainee/TR-16b-reminders-permission-off.png` | Web only (CLOSE, stubbed pushDeliverable false) |
| TR-16b | dark | no device state | — | — | `docs/qa/Z12-49/web/TR-16b-dark-web.png` | `docs/design/v3/png-dark/trainee/TR-16b-reminders-permission-off.png` | Web only (CLOSE, stubbed pushDeliverable false) |
| TR-18 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-18-ask-coach-sheet.png` | Not captured: header and copy only; topic chips kept (the API records the topic) |
| TR-18 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-18-ask-coach-sheet.png` | Not captured: header and copy only; topic chips kept (the API records the topic) |
| TR-19a | light | yes · F10 (More → Sync status with logs waiting; run 43718038556) | CLOSE | CLOSE | `docs/qa/Z12-41/TR-19a-light-ios.png`, `TR-19a-light-android.png` | `docs/design/v3/png/trainee/TR-19a-sync-status.png` | A screen with a Back row, not a sheet over More (approved departure; `SyncStatusContent` is exported for Z12-49). Device run logged a weight and a waist, so no meal or workout line; a meal reads "Meal" until the caller passes its name. No "Last sent" before the first send |
| TR-19a | dark | yes · F10 (More → Sync status with logs waiting; run 43718038556) | CLOSE | CLOSE | `docs/qa/Z12-41/TR-19a-dark-ios.png`, `TR-19a-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-19a-sync-status.png` | A screen with a Back row, not a sheet over More (approved departure; `SyncStatusContent` is exported for Z12-49). Device run logged a weight and a waist, so no meal or workout line; a meal reads "Meal" until the caller passes its name. No "Last sent" before the first send |
| TR-19b | light | yes · state: the coach republishes a meal while its log waits (not reachable in a device flow; on Z12-58's real-phone checklist) | not run on device (Expo web: CLOSE) | not run on device (Expo web: CLOSE) | `docs/qa/Z12-41/TR-19b-light-web.png` (Expo web) | `docs/design/v3/png/trainee/TR-19b-sync-conflict.png` | Body says "Your log is kept on this phone.", not "…he'll see both" (approved departure: the server writes nothing for a log on a replaced item). Opens over the sync screen, not over More |
| TR-19b | dark | yes · state: the coach republishes a meal while its log waits (not reachable in a device flow; on Z12-58's real-phone checklist) | not run on device (Expo web: CLOSE) | not run on device (Expo web: CLOSE) | `docs/qa/Z12-41/TR-19b-dark-web.png` (Expo web) | `docs/design/v3/png-dark/trainee/TR-19b-sync-conflict.png` | Body says "Your log is kept on this phone.", not "…he'll see both" (approved departure: the server writes nothing for a log on a replaced item). Opens over the sync screen, not over More |
| TR-20a | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20a-light-ios.png`, `TR-20a-light-android.png` | `docs/design/v3/png/trainee/TR-20a-more-root.png` | Coach line "Since …" (no programme/week source); Credits in the footer; title under the status bar fixed after this run (130a5ce) |
| TR-20a | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20a-dark-ios.png`, `TR-20a-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-20a-more-root.png` | Coach line "Since …" (no programme/week source); Credits in the footer; title under the status bar fixed after this run (130a5ce) |
| TR-20b | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20b-light-ios.png`, `TR-20b-light-android.png` | `docs/design/v3/png/trainee/TR-20b-profile-edit.png` | Name and email read-only (the API updates date of birth and gender only); no height (no source) |
| TR-20b | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20b-dark-ios.png`, `TR-20b-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-20b-profile-edit.png` | Name and email read-only (the API updates date of birth and gender only); no height (no source) |
| TR-20c | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20c-light-ios.png`, `TR-20c-light-android.png` | `docs/design/v3/png/trainee/TR-20c-account.png` | No "Download my data" (no source); time zone, language, privacy, past coaching here; Delete account is Z12-29's |
| TR-20c | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20c-dark-ios.png`, `TR-20c-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-20c-account.png` | No "Download my data" (no source); time zone, language, privacy, past coaching here; Delete account is Z12-29's |
| TR-20d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-20d-delete-account-confirm.png` | — |
| TR-20d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-20d-delete-account-confirm.png` | — |
| TR-20e | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20e-light-ios.png`, `TR-20e-light-android.png` | `docs/design/v3/png/trainee/TR-20e-help.png` | — |
| TR-20e | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20e-dark-ios.png`, `TR-20e-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-20e-help.png` | — |
| TR-20f | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-20f-signout-unsent.png` | Render test only (needs unsent logs); layout here, behaviour Z12-41's |
| TR-20f | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-20f-signout-unsent.png` | Render test only (needs unsent logs); layout here, behaviour Z12-41's |
| TR-20g | light | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20g-light-ios.png`, `TR-20g-light-android.png` | `docs/design/v3/png/trainee/TR-20g-change-password.png` | "At least 8 characters" (the API's rule; mock says 10); no "other devices signed out" (not what the API does) |
| TR-20g | dark | yes · F15 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-20g-dark-ios.png`, `TR-20g-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-20g-change-password.png` | "At least 8 characters" (the API's rule; mock says 10); no "other devices signed out" (not what the API does) |
| TR-21 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-21-generic-error.png` | Not captured: the app error view uses the TR-21 layout |
| TR-21 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-21-generic-error.png` | Not captured: the app error view uses the TR-21 layout |
| TR-22a | light | yes · F16 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-22a-light-ios.png`, `TR-22a-light-android.png` | `docs/design/v3/png/trainee/TR-22a-ended-coaching.png` | Standalone without the tab bar until TraineeShell is free (#461); Sign out link kept there |
| TR-22a | dark | yes · F16 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-22a-dark-ios.png`, `TR-22a-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-22a-ended-coaching.png` | Standalone without the tab bar until TraineeShell is free (#461); Sign out link kept there |
| TR-22b | light | yes · F16 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-22b-light-ios.png`, `TR-22b-light-android.png` | `docs/design/v3/png/trainee/TR-22b-reactivation-confirm.png` | Ended relationship copy, not "coaching with Asha now" |
| TR-22b | dark | yes · F16 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TR-22b-dark-ios.png`, `TR-22b-dark-android.png` | `docs/design/v3/png-dark/trainee/TR-22b-reactivation-confirm.png` | Ended relationship copy, not "coaching with Asha now" |
| TR-23 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-23-item-unavailable.png` | Not captured: only the reason line has a source; tokens and dark |
| TR-23 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-23-item-unavailable.png` | Not captured: only the reason line has a source; tokens and dark |
| TR-24 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-24-session-expired.png` | Render test only (`AuthScreen.sessionExpired.render.test.tsx`) |
| TR-24 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-24-session-expired.png` | Render test only (`AuthScreen.sessionExpired.render.test.tsx`) |
| TR-25 | light | no device state | — | — | — | `docs/design/v3/png/trainee/TR-25-steps-settings.png` | Not captured: steps flag off on the seed; tokens and dark |
| TR-25 | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainee/TR-25-steps-settings.png` | Not captured: steps flag off on the seed; tokens and dark |
| TR-26a | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26a-food-search-default.png` | — |
| TR-26a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26a-food-search-default.png` | — |
| TR-26b | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26b-food-search-results-added.png` | — |
| TR-26b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26b-food-search-results-added.png` | — |
| TR-26c | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26c-food-detail-katori.png` | — |
| TR-26c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26c-food-detail-katori.png` | — |
| TR-26d | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26d-food-search-empty-offline.png` | — |
| TR-26d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26d-food-search-empty-offline.png` | — |
| TR-26e | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26e-custom-food.png` | — |
| TR-26e | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26e-custom-food.png` | — |
| TR-26f | light | — | — | — | — | `docs/design/v3/png/trainee/TR-26f-manual-log-saved.png` | — |
| TR-26f | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/TR-26f-manual-log-saved.png` | — |
| W-01a | light | yes · device/z12-40/1 (Aarav → Workout) | GAP | GAP | `docs/qa/Z12-40/W-01a-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/W-01a-workout-tab-not-started.png` | Z12-40: Workout follows the shared day and the swipe; it keeps its own v2 week strip (workout names, Maestro labels such as "Sat Lower B") and v2 hero until the Workout v3 rework (Z12-44); run 44098030020 (review fixes, app e4d67bf) |
| W-01a | dark | yes · device/z12-40/1 | GAP | GAP | `docs/qa/Z12-40/W-01a-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/W-01a-workout-tab-not-started.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44098030020 (review fixes, app e4d67bf) |
| W-01b | light | — | — | — | — | `docs/design/v3/png/trainee/W-01b-workout-tab-in-progress.png` | — |
| W-01b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-01b-workout-tab-in-progress.png` | — |
| W-01c | light | — | — | — | — | `docs/design/v3/png/trainee/W-01c-workout-tab-done.png` | — |
| W-01c | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-01c-workout-tab-done.png` | — |
| W-01d | light | — | — | — | — | `docs/design/v3/png/trainee/W-01d-plan-changed-banner.png` | — |
| W-01d | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-01d-plan-changed-banner.png` | — |
| W-01e | light | yes · F29 step 3 | GAP | GAP | `docs/qa/Z12-40/W-01e-light-ios.png`, `…-android.png` | `docs/design/v3/png/trainee/W-01e-workout-tab-future-day.png` | behaviour matches ("Opens on …" in place of Start workout, on the shared day); layout v2 strip and hero (Z12-44); run 44080890973 |
| W-01e | dark | yes · F29 step 3 | GAP | GAP | `docs/qa/Z12-40/W-01e-dark-ios.png`, `…-android.png` | `docs/design/v3/png-dark/trainee/W-01e-workout-tab-future-day.png` | renders light under system dark: the tab body is not opted in to v3 dark (Z12-40 decision 2; its v3 task opts it in); run 44080890973 |
| W-02 | light | — | — | — | — | `docs/design/v3/png/trainee/W-02-active-start.png` | — |
| W-02 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-02-active-start.png` | — |
| W-03 | light | yes · state: Rohan → Workout → Sat Lower B → set 1 logged (device/z12-36/3) | GAP | GAP | docs/qa/Z12-36/W-03-light-ios.png, …-android.png | `docs/design/v3/png/trainee/W-03-active-mid.png` | Z12-36 anchor for primitives only: active workout not migrated yet (v2 indigo log bar and set rows); Inter is in |
| W-03 | dark | yes · state: Rohan → Workout → Sat Lower B → set 1 logged (device/z12-36/3) | GAP | GAP | docs/qa/Z12-36/W-03-dark-ios.png, …-android.png | `docs/design/v3/png-dark/trainee/W-03-active-mid.png` | renders light under system dark by design: not opted in to dark until its own W12 task sets `<Screen v3>` (Z12-36 decision 3); status bar follows (dark content) |
| W-03b | light | — | — | — | — | `docs/design/v3/png/trainee/W-03b-active-end-of-list.png` | — |
| W-03b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-03b-active-end-of-list.png` | — |
| W-04 | light | — | — | — | — | `docs/design/v3/png/trainee/W-04-active-keypad.png` | — |
| W-04 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-04-active-keypad.png` | — |
| W-05a | light | — | — | — | — | `docs/design/v3/png/trainee/W-05a-rest-running.png` | — |
| W-05a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-05a-rest-running.png` | — |
| W-05b | light | — | — | — | — | `docs/design/v3/png/trainee/W-05b-rest-ended.png` | — |
| W-05b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-05b-rest-ended.png` | — |
| W-08 | light | — | — | — | — | `docs/design/v3/png/trainee/W-08-swipe-set.png` | — |
| W-08 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-08-swipe-set.png` | — |
| W-09 | light | — | — | — | — | `docs/design/v3/png/trainee/W-09-exercise-menu.png` | — |
| W-09 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-09-exercise-menu.png` | — |
| W-09b | light | — | — | — | — | `docs/design/v3/png/trainee/W-09b-exercise-skipped.png` | — |
| W-09b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-09b-exercise-skipped.png` | — |
| W-10 | light | — | — | — | — | `docs/design/v3/png/trainee/W-10-exercise-note.png` | — |
| W-10 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-10-exercise-note.png` | — |
| W-12 | light | — | — | — | — | `docs/design/v3/png/trainee/W-12-pr-moment.png` | — |
| W-12 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-12-pr-moment.png` | — |
| W-13 | light | — | — | — | — | `docs/design/v3/png/trainee/W-13-edit-logged-set.png` | — |
| W-13 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-13-edit-logged-set.png` | — |
| W-14 | light | — | — | — | — | `docs/design/v3/png/trainee/W-14-minimised-bar.png` | — |
| W-14 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-14-minimised-bar.png` | — |
| W-15 | light | — | — | — | — | `docs/design/v3/png/trainee/W-15-discard-confirm.png` | — |
| W-15 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-15-discard-confirm.png` | — |
| W-16 | light | — | — | — | — | `docs/design/v3/png/trainee/W-16-finish-early.png` | — |
| W-16 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-16-finish-early.png` | — |
| W-17a | light | — | — | — | — | `docs/design/v3/png/trainee/W-17a-summary.png` | — |
| W-17a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-17a-summary.png` | — |
| W-17b | light | — | — | — | — | `docs/design/v3/png/trainee/W-17b-summary-shared.png` | — |
| W-17b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-17b-summary-shared.png` | — |
| W-18 | light | — | — | — | — | `docs/design/v3/png/trainee/W-18-resume-after-kill.png` | — |
| W-18 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-18-resume-after-kill.png` | — |
| W-19 | light | — | — | — | — | `docs/design/v3/png/trainee/W-19-paused.png` | — |
| W-19 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-19-paused.png` | — |
| W-20 | light | — | — | — | — | `docs/design/v3/png/trainee/W-20-active-offline.png` | — |
| W-20 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-20-active-offline.png` | — |
| W-21a | light | — | — | — | — | `docs/design/v3/png/trainee/W-21a-add-exercise.png` | — |
| W-21a | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-21a-add-exercise.png` | — |
| W-21b | light | — | — | — | — | `docs/design/v3/png/trainee/W-21b-added-exercise.png` | — |
| W-21b | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-21b-added-exercise.png` | — |
| W-22 | light | — | — | — | — | `docs/design/v3/png/trainee/W-22-replace-exercise.png` | — |
| W-22 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-22-replace-exercise.png` | — |
| W-26 | light | — | — | — | — | `docs/design/v3/png/trainee/W-26-exercise-history.png` | — |
| W-26 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-26-exercise-history.png` | — |
| W-27 | light | — | — | — | — | `docs/design/v3/png/trainee/W-27-exercise-how-to.png` | — |
| W-27 | dark | — | — | — | — | `docs/design/v3/png-dark/trainee/W-27-exercise-how-to.png` | — |

## Trainer (TM-)

| Screen | Theme | Flows | Reachable | iOS | Android | App screenshots | Mock | Remaining differences |
|---|---|---|---|---|---|---|---|
| TM-01a | light | yes · state: Rahul signs in (device/z12-36/4) | GAP | GAP | docs/qa/Z12-36/TM-01a-light-ios.png, …-android.png | `docs/design/v3/png/trainer/TM-01a-needs-you.png` | Z12-36 anchor for primitives only: Needs you not migrated yet (v2 layout, chips and colours); Inter and StatusChip v3 are in |
| TM-01a | dark | yes · state: Rahul signs in (device/z12-36/4) | GAP | GAP | docs/qa/Z12-36/TM-01a-dark-ios.png, …-android.png | `docs/design/v3/png-dark/trainer/TM-01a-needs-you.png` | renders light under system dark by design: not opted in to dark until its own W12 task sets `<Screen v3>` (Z12-36 decision 3); status bar follows (dark content) |
| TM-01a2 | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01a2-needs-you-scrolled.png` | — |
| TM-01a2 | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01a2-needs-you-scrolled.png` | — |
| TM-01b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01b-needs-you-swipe.png` | — |
| TM-01b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01b-needs-you-swipe.png` | — |
| TM-01c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01c-needs-you-reviewed-undo.png` | — |
| TM-01c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01c-needs-you-reviewed-undo.png` | — |
| TM-01d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01d-needs-you-all-caught-up.png` | — |
| TM-01d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01d-needs-you-all-caught-up.png` | — |
| TM-01e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01e-needs-you-loading.png` | — |
| TM-01e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01e-needs-you-loading.png` | — |
| TM-01f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01f-needs-you-offline.png` | — |
| TM-01f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01f-needs-you-offline.png` | — |
| TM-01g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-01g-needs-you-error.png` | — |
| TM-01g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-01g-needs-you-error.png` | — |
| TM-02a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02a-clients-list.png` | — |
| TM-02a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02a-clients-list.png` | — |
| TM-02b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02b-clients-search.png` | — |
| TM-02b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02b-clients-search.png` | — |
| TM-02c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02c-clients-filter-ended.png` | — |
| TM-02c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02c-clients-filter-ended.png` | — |
| TM-02d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02d-clients-filter-invites.png` | — |
| TM-02d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02d-clients-filter-invites.png` | — |
| TM-02e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02e-clients-empty.png` | — |
| TM-02e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02e-clients-empty.png` | — |
| TM-02f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02f-clients-offline.png` | — |
| TM-02f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02f-clients-offline.png` | — |
| TM-02g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-02g-clients-loading.png` | — |
| TM-02g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-02g-clients-loading.png` | — |
| TM-03a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03a-client-overview.png` | — |
| TM-03a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03a-client-overview.png` | — |
| TM-03b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03b-client-overview-scrolled.png` | — |
| TM-03b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03b-client-overview-scrolled.png` | — |
| TM-03c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03c-client-other-timezone.png` | — |
| TM-03c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03c-client-other-timezone.png` | — |
| TM-03d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03d-client-ended.png` | — |
| TM-03d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03d-client-ended.png` | — |
| TM-03e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03e-reactivate-sheet.png` | — |
| TM-03e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03e-reactivate-sheet.png` | — |
| TM-03f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03f-client-info.png` | — |
| TM-03f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03f-client-info.png` | — |
| TM-03g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03g-client-onboarding.png` | — |
| TM-03g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03g-client-onboarding.png` | — |
| TM-03h | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03h-client-loading-error.png` | — |
| TM-03h | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03h-client-loading-error.png` | — |
| TM-03i | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03i-client-menu.png` | — |
| TM-03i | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03i-client-menu.png` | — |
| TM-03j | light | — | — | — | — | `docs/design/v3/png/trainer/TM-03j-nudge-pick-item.png` | — |
| TM-03j | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-03j-nudge-pick-item.png` | — |
| TM-04a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04a-exception-review.png` | — |
| TM-04a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04a-exception-review.png` | — |
| TM-04b | light | yes · state: Clients → Rohan → Review → Nudge on WhatsApp (device/z12-36/4) | GAP | GAP | docs/qa/Z12-36/TM-04b-light-ios.png, …-android.png | `docs/design/v3/png/trainer/TM-04b-nudge-sheet.png` | Z12-36 anchor for primitives only: today this is the exception review's WhatsApp nudge sheet (v3 mock is the push nudge sheet, Z12-50); sheet primitive v3 |
| TM-04b | dark | yes · state: Clients → Rohan → Review → Nudge on WhatsApp (device/z12-36/4) | GAP | GAP | docs/qa/Z12-36/TM-04b-dark-ios.png, …-android.png | `docs/design/v3/png-dark/trainer/TM-04b-nudge-sheet.png` | renders light under system dark by design: not opted in to dark until its own W12 task sets `<Screen v3>` (Z12-36 decision 3); status bar follows (dark content) |
| TM-04c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04c-nudge-quiet-hours.png` | — |
| TM-04c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04c-nudge-quiet-hours.png` | — |
| TM-04d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04d-resolve-sheet.png` | — |
| TM-04d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04d-resolve-sheet.png` | — |
| TM-04e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04e-reviewed-still-open.png` | — |
| TM-04e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04e-reviewed-still-open.png` | — |
| TM-04f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04f-resolved-readonly.png` | — |
| TM-04f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04f-resolved-readonly.png` | — |
| TM-04g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04g-exception-not-found.png` | — |
| TM-04g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04g-exception-not-found.png` | — |
| TM-04h | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04h-exception-offline.png` | — |
| TM-04h | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04h-exception-offline.png` | — |
| TM-04i | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04i-exception-ended.png` | — |
| TM-04i | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04i-exception-ended.png` | — |
| TM-04j | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04j-exception-menu.png` | — |
| TM-04j | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04j-exception-menu.png` | — |
| TM-04k | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04k-note-composer.png` | — |
| TM-04k | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04k-note-composer.png` | — |
| TM-04l | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04l-off-plan-review.png` | — |
| TM-04l | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04l-off-plan-review.png` | — |
| TM-04m | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04m-nudge-sent.png` | — |
| TM-04m | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04m-nudge-sent.png` | — |
| TM-04n | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04n-nudge-limit.png` | — |
| TM-04n | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04n-nudge-limit.png` | — |
| TM-04o | light | — | — | — | — | `docs/design/v3/png/trainer/TM-04o-nudge-push-off.png` | — |
| TM-04o | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-04o-nudge-push-off.png` | — |
| TM-05a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-05a-checkins-to-review.png` | — |
| TM-05a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-05a-checkins-to-review.png` | — |
| TM-05b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-05b-checkins-overdue.png` | — |
| TM-05b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-05b-checkins-overdue.png` | — |
| TM-05c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-05c-checkins-empty.png` | — |
| TM-05c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-05c-checkins-empty.png` | — |
| TM-05d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-05d-checkins-loading.png` | — |
| TM-05d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-05d-checkins-loading.png` | — |
| TM-05e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-05e-checkins-reviewed.png` | — |
| TM-05e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-05e-checkins-reviewed.png` | — |
| TM-06a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06a-checkin-review.png` | — |
| TM-06a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06a-checkin-review.png` | — |
| TM-06b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06b-checkin-reply.png` | — |
| TM-06b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06b-checkin-reply.png` | — |
| TM-06c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06c-checkin-reviewed-undo.png` | — |
| TM-06c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06c-checkin-reviewed-undo.png` | — |
| TM-06d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06d-checkin-started-not-sent.png` | — |
| TM-06d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06d-checkin-started-not-sent.png` | — |
| TM-06e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06e-checkin-review-offline.png` | — |
| TM-06e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06e-checkin-review-offline.png` | — |
| TM-06f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06f-photo-compare.png` | — |
| TM-06f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06f-photo-compare.png` | — |
| TM-06g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-06g-checkin-reviewed-readonly.png` | — |
| TM-06g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-06g-checkin-reviewed-readonly.png` | — |
| TM-07a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07a-more-root.png` | — |
| TM-07a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07a-more-root.png` | — |
| TM-07b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07b-notification-settings.png` | — |
| TM-07b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07b-notification-settings.png` | — |
| TM-07c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07c-notifications-permission-off.png` | — |
| TM-07c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07c-notifications-permission-off.png` | — |
| TM-07d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07d-profile.png` | — |
| TM-07d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07d-profile.png` | — |
| TM-07e | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07e-help-sheet.png` | — |
| TM-07e | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07e-help-sheet.png` | — |
| TM-07f | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07f-signout-confirm.png` | — |
| TM-07f | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07f-signout-confirm.png` | — |
| TM-07g | light | — | — | — | — | `docs/design/v3/png/trainer/TM-07g-more-offline.png` | — |
| TM-07g | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-07g-more-offline.png` | — |
| TM-08a | light | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08a-light-ios.png`, `TM-08a-light-android.png` | `docs/design/v3/png/trainer/TM-08a-role-select.png` | Client hint without the coach's name before a role is picked |
| TM-08a | dark | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08a-dark-ios.png`, `TM-08a-dark-android.png` | `docs/design/v3/png-dark/trainer/TM-08a-role-select.png` | Client hint without the coach's name before a role is picked |
| TM-08b | light | no device state | — | — | — | `docs/design/v3/png/trainer/TM-08b-unsupported-role.png` | Render test only (`RoleSelectScreen.test.tsx`) |
| TM-08b | dark | no device state | — | — | — | `docs/design/v3/png-dark/trainer/TM-08b-unsupported-role.png` | Render test only (`RoleSelectScreen.test.tsx`) |
| TM-08c | light | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08c-light-ios.png`, `TM-08c-light-android.png` | `docs/design/v3/png/trainer/TM-08c-switch-role-sheet.png` | Trainee-side sheet ("Switch to coach view?") |
| TM-08c | dark | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08c-dark-ios.png`, `TM-08c-dark-android.png` | `docs/design/v3/png-dark/trainer/TM-08c-switch-role-sheet.png` | Trainee-side sheet ("Switch to coach view?") |
| TM-08d | light | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08d-light-ios.png`, `TM-08d-light-android.png` | `docs/design/v3/png/trainer/TM-08d-trainee-more-switch.png` | No "4 clients · 2 need you" (trainer data is not readable in the trainee role) |
| TM-08d | dark | yes · F17 (run 44191354664) | CLOSE | CLOSE | `docs/qa/Z12-49/TM-08d-dark-ios.png`, `TM-08d-dark-android.png` | `docs/design/v3/png-dark/trainer/TM-08d-trainee-more-switch.png` | No "4 clients · 2 need you" (trainer data is not readable in the trainee role) |
| TM-09a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-09a-activity-feed.png` | — |
| TM-09a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-09a-activity-feed.png` | — |
| TM-09b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-09b-activity-meal-sheet.png` | — |
| TM-09b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-09b-activity-meal-sheet.png` | — |
| TM-09c | light | — | — | — | — | `docs/design/v3/png/trainer/TM-09c-activity-filtered-empty.png` | — |
| TM-09c | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-09c-activity-filtered-empty.png` | — |
| TM-09d | light | — | — | — | — | `docs/design/v3/png/trainer/TM-09d-client-picker.png` | — |
| TM-09d | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-09d-client-picker.png` | — |
| TM-10a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-10a-ask-detail.png` | — |
| TM-10a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-10a-ask-detail.png` | — |
| TM-10b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-10b-ask-answered.png` | — |
| TM-10b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-10b-ask-answered.png` | — |
| TM-11a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-11a-session-detail.png` | — |
| TM-11a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-11a-session-detail.png` | — |
| TM-11b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-11b-session-finished-early.png` | — |
| TM-11b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-11b-session-finished-early.png` | — |
| TM-12a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-12a-diet-day-review.png` | — |
| TM-12a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-12a-diet-day-review.png` | — |
| TM-12b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-12b-diet-meal-sheet-ate-out.png` | — |
| TM-12b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-12b-diet-meal-sheet-ate-out.png` | — |
| TM-13a | light | no · the gate cannot send a trainer push mid-flow | GAP | GAP | — | `docs/design/v3/png/trainer/TM-13a-trainer-lockscreen.png` | trainer lock-screen text is the server's (as TR-15c); app copy is ready ("Aarav asked you", "Aarav sent their check-in") |
| TM-13a | dark | no · as light | GAP | GAP | — | `docs/design/v3/png-dark/trainer/TM-13a-trainer-lockscreen.png` | trainer lock-screen text is the server's (as TR-15c); app copy is ready ("Aarav asked you", "Aarav sent their check-in") |
| TM-13b | light | no · needs a push received while the app is open; the gate cannot send one mid-flow (Expo web: CLOSE) | — | — | `docs/qa/Z12-38/TM-13b-light-web.png` | `docs/design/v3/png/trainer/TM-13b-inapp-banner.png` | copy "Aarav Shah asked on WhatsApp" vs "Aarav asked you" plus the topic line (Z12-47 copy); native check on Z12-58's phone checklist; harness follow-up for a mid-flow push |
| TM-13b | dark | no · as light (Expo web: GAP, Clients is not opted in to dark yet, Z12-53) | — | — | `docs/qa/Z12-38/TM-13b-dark-web.png` | `docs/design/v3/png-dark/trainer/TM-13b-inapp-banner.png` | the banner follows the open screen's theme; dark once Clients opts in |
| TM-15a | light | — | — | — | — | `docs/design/v3/png/trainer/TM-15a-coach-logs-meal.png` | — |
| TM-15a | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-15a-coach-logs-meal.png` | — |
| TM-15b | light | — | — | — | — | `docs/design/v3/png/trainer/TM-15b-coach-logs-workout.png` | — |
| TM-15b | dark | — | — | — | — | `docs/design/v3/png-dark/trainer/TM-15b-coach-logs-workout.png` | — |

Rows: 370.
