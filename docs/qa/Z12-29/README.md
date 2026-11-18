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

Run 44296122295 (`device.yml`, flows `launch,z12-29`), app commit `90dae2cce1e66778c6e48544efd6415407b4968a` (the job logs' `app:` line, both platforms). Every device shot in this folder comes from that run.

| Platform | Light | Dark | Device log |
|---|---|---|---|
| iOS | 3/3 PASS | 3/3 PASS | clean |
| Android | 3/3 PASS | 3/3 PASS | clean |

Flows: `device/launch/*` (launch smoke) and `device/z12-29/1-delete-and-reactivate.yaml`. The second flow covers the whole change on the device: Account → Privacy → Delete account → typed DELETE → password re-sign-in → real `POST /account/deletion` on the job's local seeded API → archived notice → sign in again → reactivate screen → Reactivate → app (coaching ended). Personas: `siddharth.yearly` (light) and `divya.wedding` (dark), one per theme so dark starts from an active account; neither is used by the launch flows.

Device grades: BP1-delete-account and BP1-reactivate-account CLOSE on both platforms and themes (same notes as Expo web).

### Earlier runs
- 44256764329 and 44257442762 (`e24fa276`, `d7c6d07a`): the launch smoke passed; the z12-29 flow failed on both platforms. Two root causes. (1) An app bug: the delete screen's own styles resolved outside M2Page's theme scope, so its cards stayed light in dark mode. Fixed by wrapping the screen in `ThemeScope scheme="system"`. (2) A flow bug: the flow tapped hint text that the keyboard covered. It now dismisses the keyboard by tapping the card text above the field. Both fixes are in `9ad91957`.
