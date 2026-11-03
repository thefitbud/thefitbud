# QT9 visual-check screenshots

All shots: Expo web render of the real `AuthScreen` / `CodeSignInScreen`, Playwright + Chromium, viewport 393x852 at 2x, demo-seeded local API (`pnpm api`) behind Metro's `/__fitbud_api` proxy. In every shot the identifier is `aarav.ontrack@demo.fitbud.test` and the code is `123456`.

In every shot `/auth/otp/start` is stubbed with a Playwright route (200, `sent: true`), so no email is sent. **None of these shots is a real OTP verify against the API**: a real wrong or valid code cannot force the other outcomes, and 429/503/network cannot be produced by the local API at all. They show the real UI code mapping each response to copy; they are not evidence of server behaviour.

| File | How it was produced | Stubbed? |
|---|---|---|
| `01-otp-invalid-393x852.png` | `/auth/otp/verify` stubbed: 401, code `OTP_INVALID` | Stubbed response |
| `02-rate-limited-393x852.png` | `/auth/otp/verify` stubbed: 429, code `RATE_LIMITED` | Stubbed response |
| `03-network-393x852.png` | `/auth/otp/verify` request aborted (network failure) | Stubbed failure |
| `04-server-error-393x852.png` | `/auth/otp/verify` stubbed: 503 with a server message that must not appear on screen | Stubbed response |
| `05-in-flight-button-disabled-393x852.png` | Slow stubbed verify (1.5 s, then 401); two `click()` calls on "Verify and sign in" in one tick; captured 400 ms later. Exactly 1 verify request was sent and the button reported `aria-disabled=true`. | Stubbed response (guard behaviour is real) |
| `06-finish-failed-393x852.png` | `/auth/otp/verify` stubbed: real-shape 200 login result. `Storage.setItem` is made to throw for the session token (as with full or blocked browser storage), so `signInWithToken` throws inside `finishAuth`. A second tap on "Verify and sign in" sent no second verify request (1 total). | Stubbed 200 plus forced storage failure |

## Placement

The error shows in the existing `ErrorBanner` above the form, as before QT9. Frame `103-trainee-signin-error-ios.png` is the password screen, not the code screen, so these shots are not claimed to match it. Copy is checked against D-QA1-4 only.
