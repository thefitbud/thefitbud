# FitBud beta: Firoz's manual steps (W1 to W11)

Written 31 Oct 2026 from `docs/specs/batches/W1.md` to `W4.md` and `docs/tasks/beta-tasklist-v14.md` (rev 5, §6 CF2). Updated 1 Nov 2026 with Firoz's W3/W4 answers. There are no W5–W11 batches: every v14 beta task is in W1–W4 (D-W4-9, decided by Firoz, 1 Nov 2026: no W5–W11 until after the beta ships), so no manual step belongs to W5–W11.

**Priority:** P0 = blocks a task from starting or merging. P1 = needed before the beta (invites Sun 15 Nov). P2 = can wait.
**Sorted** by priority, then by the earliest batch it blocks. **Secrets are named, never given.** Paste values only into `wrangler secret put`, EAS or the provider's dashboard.
Step-by-step help for secrets, Apple and push: the W2 manual-steps guide (shared separately), sections 1–3.

| # | Pri | Step | Blocks (batch) | Deadline |
|---|---|---|---|---|
| 1 | P0 | Cloudflare queues and DLQs | I4a (W1), I6 (W2) | before W1 |
| 2 | P0 | Two Firebase projects | AU1, I4a, X6 (W1); I6 (W2) | before W1 |
| 3 | P0 | Expo/EAS project and X3 dev build on your phones | X3, LA1/LA1b/LA1c device checks (W2); X4e, X4d, X4g, LA2, LA3, LA3b, LA3c checks (W3) | before W2 |
| 4 | P0 | Apple App IDs, App Groups, Push capability | LA1 (W2), X4e (W3) | before W2 |
| 5 | P0 | ZeptoMail domain, token and DNS | I5 check, I6 (W2) | before W2 ends |
| 6 | P0 | DS5 legal frame and counsel's legal text | BT3 (W3), BT3b (W3), BT1 (W4) | before W3 (text by Mon 9 Nov) |
| 7 | Done | ~~Answer W3 decisions D-W3-1 to D-W3-5~~ answered 1 Nov 2026 | — | done |
| 7a | P0 | Put the Android rest frame `27-android-rest.png` on `main` | LA3c (W3) | before W3 |
| 8 | P0 | I6 first staging deploy (staging secrets, domains, migrations, seed) | X4c/X4e/X4d staging checks (W3); BT5 (W4) | before W3 |
| 9 | P0 | APNs key and FCM V1 key uploaded to Expo | X4e, X4d device checks (W3); BT5 (W4) | before W3 |
| 10 | Done | ~~Answer W4 decisions D-W4-5 to D-W4-8~~ answered 1 Nov 2026 | — | done |
| 11 | P0 | App Store Connect and Play Console records, testers | BT1 (W4) | before W4 |
| 12 | P0 | Run the BT5 dress rehearsal on staging | I6b, store submission (W4) | Thu 12 Nov |
| 13 | P0 | I6b production deploy (production secrets, domains, migrations, seed) | store submission (W4) | after BT5 passes |
| 14 | P1 | Rotate the old shared credentials (CF2 step 9) | none (security) | before the beta |
| 15 | P1 | Live Activity device checklists by the cut-line | LA1, LA1b, LA1c (W2); LA2, LA3, LA3b, LA3c (W3) | Thu 12 Nov |
| 16 | P1 | D1 Time Travel restore rehearsal (BT4 runbook) | none (ops readiness) | during W3 |
| 17 | P1 | Sentry org, projects, DSNs, auth token | BT2/BT2b checks, BT5 step 7 (W4) | before W4 |
| 18 | P1 | Store submission: `eas build`, `eas submit`, privacy forms, external review | the beta (W4) | Sat 14 Nov |
| 19 | P2 | Expo enhanced push security with `EXPO_ACCESS_TOKEN` | none | after the beta starts |
| 20 | P2 | Plan post-beta batches from v13 (D-W4-9 decided: none until the beta ships) | none before the beta | after the beta ships |

## Details

**1. Queues and DLQs (P0, W1).** Cloudflare dashboard → Queues → create `fitbud-jobs-staging`, `fitbud-jobs-prod`, `fitbud-jobs-staging-dlq`, `fitbud-jobs-prod-dlq`. Check the names match `apps/api/wrangler.toml` after I4a. No secrets.

**2. Firebase (P0, W1).** Create `thefitbud-staging` and `thefitbud-prod` (Analytics off, Spark plan); Authentication → Get started; copy each Web API key (public, goes into W1.md D-W1-3 / I4a as `FIREBASE_WEB_API_KEY`); add an Android app per variant (`com.thefitbud.mobile.staging`, `com.thefitbud.mobile`) and download `google-services.json`; generate a service-account key per project and keep it in your vault (it becomes `FIREBASE_SERVICE_ACCOUNT_JSON`, step 8/13). Paste the real project IDs into W1.md D-W1-3.

**3. Expo/EAS and X3 (P0, W2).** `npm i -g eas-cli`, `eas login`, `eas init` in `apps/mobile` (writes the project ID); `eas device:create` for your iPhone; `eas build --profile development --platform ios` and `--platform android` (X6 guide); install on both phones; turn on Developer Mode (iOS). Secrets: none in the repo.

**4. Apple (P0, W2).** In the developer portal (or let EAS do it during the build): App Groups `group.com.thefitbud.mobile` and `group.com.thefitbud.mobile.staging`; App IDs `com.thefitbud.mobile` and `.staging` with App Groups and Push Notifications on; the widget extension App ID with the same App Group. Hand back: the widget bundle ID, a capabilities screenshot, phone model and iOS version.

**5. ZeptoMail and DNS (P0, W2).** Add `thefitbud.com` in ZeptoMail; add the DKIM TXT and bounce CNAME in Cloudflare DNS (grey cloud); merge ZeptoMail's include into the one existing SPF record; verify; copy the Send Mail token per Mail Agent. Secret: `ZEPTOMAIL_TOKEN` (staging, production) with `wrangler secret put ZEPTOMAIL_TOKEN --env <env>` from `apps/api`; check with `wrangler secret list --env <env>`.

**6. Legal (P0, W3).** Put the DS5 frames (Privacy, Terms, Credits; web and mobile) in `docs/design/mockups/png/`; get counsel's text by Mon 9 Nov (or an interim policy counsel signs off); commit it (D-W3-4, decided) as `docs/legal/privacy.md`, `terms.md`, `credits.md`. The privacy text says deletion is by email to `tech@thefitbud.com` during the beta.

**7. W3 decisions (done, 1 Nov 2026).** D-W3-1 to D-W3-5 are decided in `docs/specs/batches/W3.md`: trainer inbox events pushed too; `"expo"` provider; Android rest timer added; legal text in `docs/legal/`; `log_set` mapped to `workout.complete_set`.

**7a. Android rest frame (P0, W3).** Design frame must be on `main` before W3 runs. Add `docs/design/mockups/png/27-android-rest.png`: viewport 412x915 (export at 1080x2400, like `27-android-trainee-workout-notif.png`), the ongoing workout notification during rest: countdown, Skip action, next set name. Blocks LA3c (W3). No secrets.

**8. I6 staging deploy (P0, W3).** Follow `docs/runbooks/trainer-web-deploy.md` (WD1): staging secrets `FIREBASE_SERVICE_ACCOUNT_JSON`, `MEDIA_SIGNING_SECRET`, `ZEPTOMAIL_TOKEN`, `SENTRY_DSN` (D-W4-5, decided), optional `EXPO_ACCESS_TOKEN`; remote migrations; library seed with `--remote --yes`; deploy API then web; attach `api-staging.thefitbud.com` and `app-staging.thefitbud.com`; smoke test. Check with `wrangler secret list --env staging` and `wrangler tail --env staging`.

**9. Push credentials (P0, W3).** Apple Keys → new key with APNs → download the .p8 once, note Key ID and Team ID → `eas credentials` → iOS → Push Notifications key → upload. Firebase → service-account JSON per project → `eas credentials` → Android → FCM V1 → upload. Delete local copies after upload. No Worker secret is needed for this.

**10. W4 decisions (done, 1 Nov 2026).** D-W4-5 to D-W4-9 are decided in `W4.md`: `SENTRY_DSN` as Worker secret; errors only; source maps on production builds with `SENTRY_AUTH_TOKEN`; EAS remote auto-increment; no W5–W11 until after the beta.

**11. Store records (P0, W4).** App Store Connect: app record for `com.thefitbud.mobile`, TestFlight internal and external groups, beta review contact. Play Console: app record, closed testing track, testers list (emails stay in the console, never in the repo). Note the App Store Connect app ID and Apple Team ID for `eas submit` (set as EAS env, not in the repo). Play service-account key for submit stays outside the repo.

**12. BT5 rehearsal (P0, W4).** Run `docs/qa/QA-BT5.md` on staging with one iPhone and one Android phone on the staging variant; record pass/fail and evidence; any failure becomes a beta-blocker task.

**13. I6b production deploy (P0, W4).** Same as step 8 with `--env production`: production secrets `FIREBASE_SERVICE_ACCOUNT_JSON`, `MEDIA_SIGNING_SECRET` (new value, never reused), `ZEPTOMAIL_TOKEN`, `SENTRY_DSN`, optional `EXPO_ACCESS_TOKEN`; migrations; production library seed; attach `api.thefitbud.com` and `app.thefitbud.com`.

**14. Rotate old credentials (P1).** Change every password or key that was kept on the old shared wiki credential pages, and remove them from there. Store new values only in your vault.

**15. Live Activity checklists (P1, W2–W3).** Run the device checklist in each LA PR on your dev build; compare with frames 27, 27b, 27c, 27-android and 27-android-rest; attach photos. If LA1 doesn't work on your iPhone by Thu 12 Nov, the beta ships without it (D-B7); it never blocks BT1.

**16. Restore rehearsal (P1, W3).** Follow `docs/runbooks/d1-restore.md` once on `fitbud-staging`; fill in the rehearsal log.

**17. Sentry (P1, W4).** Create the org and two projects (`fitbud-api` Cloudflare Workers, `fitbud-mobile` React Native); copy DSNs; create an auth token. Secrets: `SENTRY_DSN` (Worker, per env), `SENTRY_AUTH_TOKEN` (EAS secret, `eas env:create` or the expo.dev dashboard). The mobile DSN is set as `EXPO_PUBLIC_SENTRY_DSN` per EAS profile.

**18. Store submission (P1, W4).** Follow `docs/runbooks/store-release.md` (BT1): `eas build --profile production`, `eas submit` for iOS and Android; App Privacy answers and Play Data safety; privacy URL `https://app.thefitbud.com/privacy`; submit for TestFlight external review (~1–2 days); promote the Play build to closed testing; send invites Sun 15 Nov.

**19. Enhanced push security (P2).** expo.dev → Access tokens → create; set `EXPO_ACCESS_TOKEN` on both envs; then enable enhanced push security in the Expo project.

**20. Post-beta batches (P2).** D-W4-9 is decided: plan W5 onwards from v13 after the beta ships.
