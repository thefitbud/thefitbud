# FitBud beta: Firoz's manual steps (W1 to W11)

Written 31 Oct 2026 from `docs/specs/batches/W1.md` to `W4.md` and `docs/tasks/beta-tasklist-v14.md` (rev 5, §6 CF2). Updated 1 Nov 2026 with Firoz's W3/W4 answers; completed steps removed 1 Nov 2026 (queues and DLQs, Firebase projects, answered decisions). Updated 2 Nov 2026: progress on steps 1, 6, 7, 9, 15 and 17; removed step 14 (restore rehearsal done, #138) and step 5 (`27-android-rest.png` is on `main` and LA3c merged, #132). Step numbers are kept so references elsewhere stay valid. There are no W5–W11 batches: every v14 beta task is in W1–W4 (D-W4-9, decided by Firoz, 1 Nov 2026: no W5–W11 until after the beta ships), so no manual step belongs to W5–W11.

**Priority:** P0 = blocks a task from starting or merging. P1 = needed before the beta (invites Sun 15 Nov). P2 = can wait.
**Sorted** by priority, then by the earliest batch it blocks. **Secrets are named, never given.** Paste values only into `wrangler secret put`, EAS or the provider's dashboard.
Step-by-step help for secrets, Apple and push: the W2 manual-steps guide (shared separately), sections 1–3.

| # | Pri | Step | Blocks (batch) | Deadline |
|---|---|---|---|---|
| 1 | P0 | Expo/EAS: Android dev build (blocked by AB1) and install on your phone; iOS part on hold | X3, LA1/LA1b/LA1c device checks (W2); X4e, X4d, X4g, LA2, LA3, LA3b, LA3c checks (W3) | after AB1 merges |
| 2 | P0 | Apple App IDs, App Groups, Push capability (**on hold by Firoz, 1 Nov**) | LA1 (W2), X4e (W3) | before W2 |
| 3 | P0 | ZeptoMail: Mail Agent restored and `ZEPTOMAIL_TOKEN` set | I5 check, I6 (W2) | before W2 ends |
| 4 | P0 | DS5 legal frame and counsel's legal text | BT3 (W3), BT3b (W3), BT1 (W4) | before W3 (text by Mon 9 Nov) |
| 6 | P0 | I6 staging: signed-in browser smoke test (deploy done 2 Nov) | X4c/X4e/X4d staging checks (W3); BT5 (W4) | before W3 ends |
| 7 | P0 | APNs key (**on hold by Firoz, 1 Nov**); FCM V1 for production Android (staging done 2 Nov) | X4e, X4d device checks (W3); BT5 (W4) | before W3 |
| 8 | P0 | App Store Connect record and TestFlight testers (**on hold by Firoz, 1 Nov**) | BT1 (W4) | before W4 |
| 9 | P0 | Play Console: invite tech@ as Admin, 2-step verification for tech@, create the app and closed testing track | BT1 (W4) | before W4 |
| 10 | P0 | Run the BT5 dress rehearsal on staging | I6b, store submission (W4) | Thu 12 Nov |
| 11 | P0 | I6b production deploy (service-account key, production secrets, domains, migrations, seed) | store submission (W4) | after BT5 passes |
| 12 | P1 | Rotate the old shared credentials (CF2 step 9) | none (security) | before the beta |
| 13 | P1 | Live Activity device checklists by the cut-line | LA1, LA1b, LA1c (W2); LA2, LA3, LA3b, LA3c (W3) | Thu 12 Nov |
| 15 | P1 | Sentry: copy DSNs, create `SENTRY_AUTH_TOKEN` (org and projects exist) | BT2/BT2b checks, BT5 step 7 (W4) | before W4 |
| 16 | P1 | Store submission: `eas build`, `eas submit`, privacy forms, external review | the beta (W4) | Sat 14 Nov |
| 17 | P2 | Expo enhanced push security: `EXPO_ACCESS_TOKEN` on production (staging set 2 Nov), then enable | none | after the beta starts |
| 18 | P2 | Plan post-beta batches from v13 (D-W4-9 decided: none until the beta ships) | none before the beta | after the beta ships |

## Details

**1. Expo/EAS (P0, W2–W3).** Done 2 Nov: the EAS project is linked (PR #139, `app.json` only; merge it first), FCM V1 is uploaded for the staging Android app, and `EXPO_ACCESS_TOKEN` is set on staging. Left: (a) the Android dev build: `eas build --profile development --platform android` for the staging variant fails at Gradle `:app:compileDebugJavaWithJavac` (`expo.core.ExpoModulesPackage` not found in the generated `PackageList.java`; builds `fa0acab2`, `5e0295a7`), fixed by spec AB1 (W3); after AB1 merges, rerun the build and keep the install link; (b) install it on your Android phone; (c) the iOS part (`eas device:create`, `--platform ios`, Developer Mode) is on hold with step 2. Secrets: none in the repo.

**2. Apple (P0, W2, on hold by Firoz, 1 Nov).** In the developer portal (or let EAS do it during the build): App Groups `group.com.thefitbud.mobile` and `group.com.thefitbud.mobile.staging`; App IDs `com.thefitbud.mobile` and `.staging` with App Groups and Push Notifications on; the widget extension App ID with the same App Group. Hand back: the widget bundle ID, a capabilities screenshot, phone model and iOS version.

**3. ZeptoMail (P0, W2).** Done: `thefitbud.com` verified (DKIM and bounce CNAME live), SPF includes `zoho.in`, DMARC `_dmarc` `p=none` added 1 Nov. Left: `mail_agent_1` shows "shutdown"; a Zoho support request was sent 1 Nov, so follow it up until the agent is active. Then generate the Send Mail token and set `ZEPTOMAIL_TOKEN` (staging, production) with `wrangler secret put ZEPTOMAIL_TOKEN --env <env>` from `apps/api`; check with `wrangler secret list --env <env>`.

**4. Legal (P0, W3).** Put the DS5 frames (Privacy, Terms, Credits; web and mobile) in `docs/design/mockups/png/`; get counsel's text by Mon 9 Nov (or an interim policy counsel signs off); commit it (D-W3-4, decided) as `docs/legal/privacy.md`, `terms.md`, `credits.md`. The privacy text says deletion is by email to `tech@thefitbud.com` during the beta.

**6. I6 staging (P0, W3).** Done 2 Nov: the API and web Workers are live at `api-staging.thefitbud.com` and `app-staging.thefitbud.com`, remote migrations applied up to `0033`, library seed loaded, curl smoke test passed. Left: the signed-in browser smoke test on `app-staging.thefitbud.com` (sign in, open the trainer home, one round trip to the API). Check with `wrangler tail --env staging` if it fails.

**7. Push credentials (P0, W3; Apple part on hold by Firoz, 1 Nov).** Done 2 Nov: FCM V1 uploaded for the staging Android app. Left: FCM V1 for the production Android app (Firebase → service-account JSON for `thefitbud-prod` → `eas credentials` → Android → FCM V1 → upload); the APNs key when Apple is back on (Apple Keys → new key with APNs → download the .p8 once, note Key ID and Team ID → `eas credentials` → iOS → Push Notifications key → upload). Delete local copies after upload. No Worker secret is needed for this.

**8. App Store Connect (P0, W4, on hold by Firoz, 1 Nov).** App record for `com.thefitbud.mobile`, TestFlight internal and external groups, beta review contact. Note the App Store Connect app ID and Apple Team ID for `eas submit` (set as EAS env, not in the repo).

**9. Play Console (P0, W4).** Done: the developer account "techfitbud" (personal) is verified. Left: invite `tech@thefitbud.com` as Admin (Users and permissions); turn on 2-step verification for `tech@`; then create the app `com.thefitbud.mobile` with a closed testing track and a testers list (emails stay in the console, never in the repo). New personal accounts need at least 12 testers opted in for 14 days before a production release (closed testing is unaffected). The Play service-account key for submit stays outside the repo.

**10. BT5 rehearsal (P0, W4).** Run `docs/qa/QA-BT5.md` on staging with one iPhone and one Android phone on the staging variant; record pass/fail and evidence; any failure becomes a beta-blocker task.

**11. I6b production deploy (P0, W4).** Same as step 6 with `--env production`: generate the service-account key for `thefitbud-prod` the same way; production secrets `FIREBASE_SERVICE_ACCOUNT_JSON` (that key), `MEDIA_SIGNING_SECRET` (new value, never reused), `ZEPTOMAIL_TOKEN`, `SENTRY_DSN`, optional `EXPO_ACCESS_TOKEN`; migrations; production library seed; attach `api.thefitbud.com` and `app.thefitbud.com`.

**12. Rotate old credentials (P1).** Change every password or key that was kept on the old shared wiki credential pages, and remove them from there. Store new values only in your vault.

**13. Live Activity checklists (P1, W2–W3).** Run the device checklist in each LA PR on your dev build; compare with frames 27, 27b, 27c, 27-android and 27-android-rest; attach photos. If LA1 doesn't work on your iPhone by Thu 12 Nov, the beta ships without it (D-B7); it never blocks BT1.

**15. Sentry (P1, W4).** Done 1 Nov: org `fitbud-zi` with projects `fitbud-api` (Cloudflare) and `fitbud-mobile` (React Native). Left (pending): copy each DSN and create an auth token. Secrets: `SENTRY_DSN` (Worker secret, per env), `SENTRY_AUTH_TOKEN` (EAS secret, `eas env:create` or the expo.dev dashboard). The mobile DSN is set as `EXPO_PUBLIC_SENTRY_DSN` per EAS profile.

**16. Store submission (P1, W4).** Follow `docs/runbooks/store-release.md` (BT1): `eas build --profile production`, `eas submit` for iOS and Android; App Privacy answers and Play Data safety; privacy URL `https://app.thefitbud.com/privacy`; submit for TestFlight external review (~1–2 days); promote the Play build to closed testing; send invites Sun 15 Nov.

**17. Enhanced push security (P2).** Done 2 Nov: `EXPO_ACCESS_TOKEN` set on staging. Left: set it on production, then enable enhanced push security in the Expo project.

**18. Post-beta batches (P2).** D-W4-9 is decided: plan W5 onwards from v13 after the beta ships.
