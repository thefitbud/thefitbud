# QA · Z12-29 Account deletion and reactivation (trainee app)

Spec: `docs/specs/Z12-29.md` (batch W12). Frames: `BP1-delete-account-ios.png`, `BP1-reactivate-account-ios.png` (restyled on v3 tokens, D-W12-25); TR-20c and TR-20d (layout only, D-W12-6 copy over TR-20d's sample copy); TR-22b (check only, built by Z12-49).

Expo-web shots: `docs/qa/Z12-29/web/<shot>-<theme>-web.png`. Device shots: `docs/qa/Z12-29/<shot>-<theme>-<platform>.png` (device gate).

## Expo-web screenshot check (D-W12-34 (2))

`docs/qa/Z12-29/capture.mjs`: Expo web (`expo start --web`, `EXPO_PUBLIC_API_BASE_URL` → a local API on a spare port) on a fresh `pnpm db:reset`, Playwright Chromium at 393x852, 2x, `colorScheme` light and dark. Expo web proves copy, structure and values, not native layout.

Every shot is the real local API, except `delete-active-clients`, where `POST /account/deletion` is a route stub answering 409 `ACTIVE_CLIENTS`: no seeded account is both a client and a coach with active clients (`karan.dual` has none, and a real attempt archived him). The count copy ("You have 2 active clients.") is covered by `DeleteAccountScreen.test.tsx`.

The delete shots really archive an account: `siddharth.yearly` (light) and `divya.wedding` (dark). The real flow end to end on the local API: password re-sign-in → `POST /account/deletion` → archived notice with the purge date → sign in again → reactivate screen → `POST /account/reactivation` → the app, coaching ended.

## Grades

MATCH, CLOSE or GAP against the named frame. Never a pixel claim.

| Shot | Frame | Light / dark | Notes |
|---|---|---|---|
| `BP1-delete` | BP1-delete-account-ios, TR-20d layout | CLOSE / CLOSE | D-W12-6 copy; v3 tokens (navy brand, not the frame's indigo); email link underlined as well as coloured; the hint reads "Next, we'll ask for your password to check it's you." (the frame's "send a code to +91 …": codes go by email and `/me` has no phone) |
| `delete-proof` | — (no frame) | CLOSE / CLOSE | the fresh sign-in step (D-W6-31): password, or "Send me a code instead" |
| `delete-wrong-password` | — | CLOSE / CLOSE | only behind 401 `INVALID_CREDENTIALS` |
| `delete-active-clients` | — | CLOSE / CLOSE | stub, see above; a client-only account sees the API's own text |
| `delete-archived-notice` | — | CLOSE / CLOSE | D-W12-6 "Your account is archived. Sign in before Tue 18 May 2027 to bring it back." |
| `BP1-reactivate` | BP1-reactivate-account-ios | CLOSE / CLOSE | no name and phone card: an archived account reaches only `GET /account/status`, which has neither |
| `reactivated` | — | CLOSE / CLOSE | after Reactivate: the ended-coaching landing (D-W6-8) |
| `privacy` | — | CLOSE / CLOSE | Delete account row under "YOUR ACCOUNT" |
| `TR-20c` | TR-20c | GAP / GAP | unchanged from Z12-49: the frame's Delete account row is on Account, but `AccountScreen.tsx` is outside this task's `files_owned`; the row is on Privacy (the spec's "Privacy → Delete account"). Follow-up in the PR |
| `TR-22b` | TR-22b | CLOSE / CLOSE | not regressed (Z12-49's grade) |

## Device gate

Filled in from the device run (see the PR).
