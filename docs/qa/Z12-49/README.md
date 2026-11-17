# QA · Z12-49 More, settings, auth, onboarding and system screens

Spec: `docs/specs/Z12-49.md` (batch W12). Device shots: `docs/qa/Z12-49/<screen ID>-<theme>-<platform>.png` (device gate). Expo-web shots: `docs/qa/Z12-49/web/<screen ID>-<theme>-web.png`.

## Expo-web screenshot check (D-W12-34 (2))

`docs/qa/Z12-49/capture.mjs`: Expo web (`expo start --web`) behind Metro's `/__fitbud_api` proxy to a local API on the demo seed (`pnpm db:reset`), Playwright Chromium at 393x852, 2x, `colorScheme` light and dark. Expo web proves copy, structure and values, not native layout.

States the local API cannot produce are made with a Playwright route stub. None of these is evidence of server behaviour; they show the app's mapping of a response to the screen:

| Shot | Stub |
|---|---|
| TR-01e | `POST /auth/login` → 401 `INVALID_CREDENTIALS` |
| TR-01f | `POST /auth/login` → 429 `RATE_LIMITED` (the real local limiter also tripped once during these captures and showed the same banner) |
| TR-01g | `POST /auth/otp/verify` → 401 `OTP_EXPIRED` (today's API answers an expired code with `OTP_INVALID`; see the PR) |
| TR-01d | `POST /auth/otp/verify` → 200 `{ purpose: "reset", resetProof }` (the reset code is emailed; not saved) |
| TR-16b | `GET …/reminder-status` with `pushDeliverable: false` |

Everything else is the real local API: Aarav (More, Reminders, Account, Help, Profile, Change password), Sneha (TR-04), Vikram (TR-03), Kavya (TR-22a), Nikhil (TR-22b), Karan (TM-08a, TM-08d, TM-08c).

## Grades

MATCH, CLOSE or GAP against `docs/design/v3/png/` (light) and `png-dark/` (dark). Never a pixel claim. Departures are listed in the PR body with their reasons.

| Screen | Expo web (light / dark) | Notes |
|---|---|---|
| TR-01a | CLOSE / CLOSE | placeholder text kept (the shared Maestro subflows tap it) |
| TR-01b | CLOSE / CLOSE | field label "Mobile number or email" (codes go by email; a number finds the account) |
| TR-01c | CLOSE / CLOSE | |
| TR-01d | CLOSE / CLOSE | |
| TR-01e | CLOSE / CLOSE | "That number and password don't match." / "email" for an email |
| TR-01f | CLOSE / CLOSE | no countdown: the API's 429 carries no retry window |
| TR-01g | CLOSE / CLOSE | stubbed `OTP_EXPIRED` |
| TR-02a / TR-02b | not captured | needs an invite token; tokens only, layout on tokens |
| TR-03 | CLOSE / CLOSE | questions come from the pinned form version |
| TR-04 | CLOSE / CLOSE | "Steps" row only with the steps flag on |
| TR-05 | not captured | reached from Reminders on Android ("Reminders not arriving?"); tokens and dark only |
| TR-16a | CLOSE / CLOSE | extra row "Evening summary"; "Updates from Rahul" is the coach-log setting |
| TR-16b | CLOSE / CLOSE | |
| TR-18 | not captured | header and copy only (topic chips kept: the API records the topic) |
| TR-20a | CLOSE / CLOSE | coach line "Since …" (no programme or week source); Credits in the footer |
| TR-20b | CLOSE / CLOSE | name and email read-only; no height (no source) |
| TR-20c | CLOSE / CLOSE | no "Download my data" (no source); Delete account is Z12-29's |
| TR-20d | — | Z12-29 (D-W12-25) |
| TR-20e | CLOSE / CLOSE | |
| TR-20f | unit test only | needs unsent logs; render test covers Send first / Sign out anyway / Cancel |
| TR-20g | CLOSE / CLOSE | "At least 8 characters" (the API's rule; the mock says 10) |
| TR-21 | not captured | the app-level error view uses the TR-21 layout (CenteredState); a failing /me after a stored session is needed to show it |
| TR-22a | CLOSE / CLOSE | standalone (no tab bar) until TraineeShell is free (#461) |
| TR-22b | CLOSE / CLOSE | ended relationship, not "coaching with Asha now" |
| TR-23 | not captured | unchanged content (only the reason line has a source), tokens and dark |
| TR-24 | render test | `AuthScreen.sessionExpired.render.test.tsx`; shown after a refused refresh |
| TR-25 | not captured | steps flag off on the local seed; tokens and dark |
| TM-08a | CLOSE / CLOSE | |
| TM-08b | render test | `/me` with no mobile role cannot be stubbed (the contract needs a role); covered by `RoleSelectScreen.test.tsx` |
| TM-08c | CLOSE / CLOSE | the trainee-side sheet ("Switch to coach view?") |
| TM-08d | CLOSE / CLOSE | no "4 clients · 2 need you": trainer data is not readable in the trainee role |
