# FitBud beta: Firoz's manual steps (W1 to W11)

Written 31 Oct 2026 from `docs/specs/batches/W1.md` to `W4.md` and `docs/tasks/beta-tasklist-v14.md` (rev 5, §6 CF2). Updated 1 Nov 2026 with Firoz's W3/W4 answers; completed steps removed 1 Nov 2026 (queues and DLQs, Firebase projects, answered decisions). There are no W5–W11 batches: every v14 beta task is in W1–W4 (D-W4-9, decided by Firoz, 1 Nov 2026: no W5–W11 until after the beta ships), so no manual step belongs to W5–W11.

**Priority:** P0 = blocks a task from starting or merging. P1 = needed before the beta (invites Sun 15 Nov). P2 = can wait.
**Sorted** by priority, then by the earliest batch it blocks. **Secrets are named, never given.** Paste values only into `wrangler secret put`, EAS or the provider's dashboard.
Step-by-step help for secrets, Apple and push: the W2 manual-steps guide (shared separately), sections 1–3.

| # | Pri | Step | Blocks (batch) | Deadline |
|---|---|---|---|---|
| 1 | P0 | Expo/EAS project and X3 dev build on your phones | X3, LA1/LA1b/LA1c device checks (W2); X4e, X4d, X4g, LA2, LA3, LA3b, LA3c checks (W3) | before W2 |
| 2 | P0 | Apple App IDs, App Groups, Push capability (**on hold by Firoz, 1 Nov**) | LA1 (W2), X4e (W3) | before W2 |
| 3 | P0 | ZeptoMail: Mail Agent restored and `ZEPTOMAIL_TOKEN` set | I5 check, I6 (W2) | before W2 ends |
| 4 | P0 | DS5 legal frame and counsel's legal text | BT3 (W3), BT3b (W3), BT1 (W4) | before W3 (text by Mon 9 Nov) |
| 5 | P0 | Put the Android rest frame `27-android-rest.png` on `main` | LA3c (W3) | before W3 |
| 6 | P0 | I6 first staging deploy (service-account key, staging secrets, domains, migrations, seed) | X4c/X4e/X4d staging checks (W3); BT5 (W4) | before W3 |
| 7 | P0 | APNs key (**on hold by Firoz, 1 Nov**) and FCM V1 key uploaded to Expo | X4e, X4d device checks (W3); BT5 (W4) | before W3 |
| 8 | P0 | App Store Connect record and TestFlight testers (**on hold by Firoz, 1 Nov**) | BT1 (W4) | before W4 |
| 9 | P0 | Play Console: verify the account, create the app and closed testing track | BT1 (W4) | before W4 |
| 10 | P0 | Run the BT5 dress rehearsal on staging | I6b, store submission (W4) | Thu 12 Nov |
| 11 | P0 | I6b production deploy (service-account key, production secrets, domains, migrations, seed) | store submission (W4) | after BT5 passes |
| 12 | P1 | Rotate the old shared credentials (CF2 step 9) | none (security) | before the beta |
| 13 | P1 | Live Activity device checklists by the cut-line | LA1, LA1b, LA1c (W2); LA2, LA3, LA3b, LA3c (W3) | Thu 12 Nov |
| 14 | P1 | D1 Time Travel restore rehearsal (BT4 runbook) | none (ops readiness) | during W3 |
| 15 | P1 | Sentry: copy DSNs, create `SENTRY_AUTH_TOKEN` | BT2/BT2b checks, BT5 step 7 (W4) | before W4 |
| 16 | P1 | Store submission: `eas build`, `eas submit`, privacy forms, external review | the beta (W4) | Sat 14 Nov |
| 17 | P2 | Expo enhanced push security with `EXPO_ACCESS_TOKEN` | none | after the beta starts |
| 18 | P2 | Plan post-beta batches from v13 (D-W4-9 decided: none until the beta ships) | none before the beta | after the beta ships |

## Details

**1. Expo/EAS and X3 (P0, W2).** `npm i -g eas-cli`, `eas login`, `eas init` in `apps/mobile` (writes the project ID); `eas device:create` for your iPhone; `eas build --profile development --platform ios` and `--platform android` (X6 guide); install on both phones; turn on Developer Mode (iOS). Secrets: none in the repo.

**2. Apple (P0, W2, on hold by Firoz, 1 Nov).** In the developer portal (or let EAS do it during the build): App Groups `group.com.thefitbud.mobile` and `group.com.thefitbud.mobile.staging`; App IDs `com.thefitbud.mobile` and `.staging` with App Groups and Push Notifications on; the widget extension App ID with the same App Group. Hand back: the widget bundle ID, a capabilities screenshot, phone model and iOS version.

**3. ZeptoMail (P0, W2).** Done: `thefitbud.com` verified (DKIM and bounce CNAME live), SPF includes `zoho.in`, DMARC `_dmarc` `p=none` added 1 Nov. Left: `mail_agent_1` shows "shutdown"; a Zoho support request was sent 1 Nov, so follow it up until the agent is active. Then generate the Send Mail token and set `ZEPTOMAIL_TOKEN` (staging, production) with `wrangler secret put ZEPTOMAIL_TOKEN --env <env>` from `apps/api`; check with `wrangler secret list --env <env>`.

**4. Legal (P0, W3).** Put the DS5 frames (Privacy, Terms, Credits; web and mobile) in `docs/design/mockups/png/`; get counsel's text by Mon 9 Nov (or an interim policy counsel signs off); commit it (D-W3-4, decided) as `docs/legal/privacy.md`, `terms.md`, `credits.md`. The privacy text says deletion is by email to `tech@thefitbud.com` during the beta.

**5. Android rest frame (P0, W3).** Design frame must be on `main` before W3 runs. Add `docs/design/mockups/png/27-android-rest.png`: viewport 412x915 (export at 1080x2400, like `27-android-trainee-workout-notif.png`), the ongoing workout notification during rest: countdown, Skip action, next set name. Blocks LA3c (W3). No secrets.

**6. I6 staging deploy (P0, W3).** Follow `docs/runbooks/trainer-web-deploy.md` (WD1): first, in the Firebase console for `thefitbud-staging` → Project settings → Service accounts → Generate new private key, keep it in your vault (never in the repo); then staging secrets `FIREBASE_SERVICE_ACCOUNT_JSON` (that key), `MEDIA_SIGNING_SECRET`, `ZEPTOMAIL_TOKEN`, `SENTRY_DSN` (D-W4-5, decided), optional `EXPO_ACCESS_TOKEN`; remote migrations; library seed with `--remote --yes`; deploy API then web; attach `api-staging.thefitbud.com` and `app-staging.thefitbud.com`; smoke test. Check with `wrangler secret list --env staging` and `wrangler tail --env staging`.

**7. Push credentials (P0, W3; Apple part on hold by Firoz, 1 Nov).** Apple Keys → new key with APNs → download the .p8 once, note Key ID and Team ID → `eas credentials` → iOS → Push Notifications key → upload. Firebase → service-account JSON per project → `eas credentials` → Android → FCM V1 → upload. Delete local copies after upload. No Worker secret is needed for this.

**8. App Store Connect (P0, W4, on hold by Firoz, 1 Nov).** App record for `com.thefitbud.mobile`, TestFlight internal and external groups, beta review contact. Note the App Store Connect app ID and Apple Team ID for `eas submit` (set as EAS env, not in the repo).

**9. Play Console (P0, W4).** The developer account "techfitbud" (personal) is unverified. Left: verify the contact phone; then create the app `com.thefitbud.mobile` with a closed testing track and a testers list (emails stay in the console, never in the repo). New personal accounts need at least 12 testers opted in for 14 days before a production release (closed testing is unaffected). The Play service-account key for submit stays outside the repo.

**10. BT5 rehearsal (P0, W4).** Run `docs/qa/QA-BT5.md` on staging with one iPhone and one Android phone on the staging variant; record pass/fail and evidence; any failure becomes a beta-blocker task.

**11. I6b production deploy (P0, W4).** Same as step 6 with `--env production`: generate the service-account key for `thefitbud-prod` the same way; production secrets `FIREBASE_SERVICE_ACCOUNT_JSON` (that key), `MEDIA_SIGNING_SECRET` (new value, never reused), `ZEPTOMAIL_TOKEN`, `SENTRY_DSN`, optional `EXPO_ACCESS_TOKEN`; migrations; production library seed; attach `api.thefitbud.com` and `app.thefitbud.com`.

**12. Rotate old credentials (P1).** Change every password or key that was kept on the old shared wiki credential pages, and remove them from there. Store new values only in your vault.

**13. Live Activity checklists (P1, W2–W3).** Run the device checklist in each LA PR on your dev build; compare with frames 27, 27b, 27c, 27-android and 27-android-rest; attach photos. If LA1 doesn't work on your iPhone by Thu 12 Nov, the beta ships without it (D-B7); it never blocks BT1.

**14. Restore rehearsal (P1, W3).** Follow `docs/runbooks/d1-restore.md` once on `fitbud-staging`; fill in the rehearsal log.

**15. Sentry (P1, W4).** Done 1 Nov: org `fitbud-zi` with projects `fitbud-api` (Cloudflare) and `fitbud-mobile` (React Native). Left: copy each DSN and create an auth token. Secrets: `SENTRY_DSN` (Worker secret, per env), `SENTRY_AUTH_TOKEN` (EAS secret, `eas env:create` or the expo.dev dashboard). The mobile DSN is set as `EXPO_PUBLIC_SENTRY_DSN` per EAS profile.

**16. Store submission (P1, W4).** Follow `docs/runbooks/store-release.md` (BT1): `eas build --profile production`, `eas submit` for iOS and Android; App Privacy answers and Play Data safety; privacy URL `https://app.thefitbud.com/privacy`; submit for TestFlight external review (~1–2 days); promote the Play build to closed testing; send invites Sun 15 Nov.

**17. Enhanced push security (P2).** expo.dev → Access tokens → create; set `EXPO_ACCESS_TOKEN` on both envs; then enable enhanced push security in the Expo project.

**18. Post-beta batches (P2).** D-W4-9 is decided: plan W5 onwards from v13 after the beta ships.
