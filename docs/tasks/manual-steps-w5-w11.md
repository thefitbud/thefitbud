# Manual steps for W5–W12

**Status:** DO NOT START: these batches are planning only, kept ready for after the beta ships. Do not pick up or run any task here until Firoz says so.

Separate from `manual-steps.md`. P0 blocks a task, P1 is a decision a task waits on, P2 is a step after merge. (Rewritten 3 Nov 2026 from Firoz's answers; the file name stays so existing links work.)

**Owners**
- **Coding agent (in the batch):** the orchestrator or implementer sessions of that batch, inside the working rules (implementers never run remote commands).
- **FitBud UI (my computer):** the planning bot on the box, which has `wrangler` with `CLOUDFLARE_API_TOKEN`, `EXPO_TOKEN` (EAS robot), `FIREBASE_SA_STAGING` and `ZEPTOMAIL_TOKEN` as environment variables, and a Chrome profile signed in as tech@thefitbud.com for Firebase, Cloudflare, Expo, Sentry and Zoho. Remote D1 migrations, secrets set with `wrangler`, deploys, seeding and EAS builds go here. Secret values are never written to a file.
- **Firoz (only he can):** steps that need an account only Firoz holds. Google Play Console is owned by Firoz's personal Gmail. The Apple Developer account is **on hold and is not touched by anyone**; Apple steps wait.

## P0 · blocks tasks
- [ ] **W5 · Coding agent (in the batch).** Merge QA1 (PR #147, Maestro + Playwright capture) first if it is still open; ZA1's visual diff runs after `qa.yml`.
- [ ] **W7 · FitBud UI (my computer), Firoz reviews.** Draw DS1 (Home full views, 6 web frames), DS2 (bulk side panel, 4 web frames), DS4 (Home row and count card, web + iPad) and DS7 (read-only field style, web + iPad) for ZC9/ZC10, ZC8, ZC2 and ZC13.
- [ ] **W8 · FitBud UI (my computer), Firoz reviews.** Draw DS3 (Activate and Save as vN+1 dialogs, 2 web frames) for ZD6.
- [ ] **W11 · FitBud UI (my computer), Firoz reviews.** Draw BP1: `BP1-delete-account-ios.png`, `BP1-delete-account-web.png`, `BP1-reactivate-account-ios.png`, `BP1-reactivate-account-web.png` for ZG29, with the D-W11-6 copy.
- [ ] **W12 · FitBud UI (my computer), Firoz reviews.** Draw DS6: `DS6-session-log-after-web.png`, `DS6-session-log-after-ipad.png`, `DS6-session-log-live-ipad.png` for ZH11.

## P1 · decisions
- None open. Answered or decided on 3 Nov: D-W5-9..11 (W5), D-W6-7..9 (W6: account archive, reactivation, immediate deletion by email, backup token scope), D-W7-6..8 (W7 copy and frames), D-W9-5..6 (W9 health libraries), D-W11-4..6 (W11: Phase 10 to W12, BP1 frames and copy), D-W12-1..9 (W12).

## P2 · after merge
- [ ] **W5 · FitBud UI (my computer).** Re-seed production drinks (DK1) after ZA9 merges: `wrangler d1 execute` of `08_post_seed.sql` on staging, check, then production.
- [ ] **W6 · FitBud UI (my computer).** Apply the W6 migrations (ZB1–ZB4, ZB16) to staging (`fitbud-staging`), run the smoke checks, deploy `fitbud-api-staging`, then production at the next deploy.
- [ ] **W6 · FitBud UI (my computer).** Run the read-only EC1f count on staging and production (D-W6-6) and record the result in the W6 report.
- [ ] **W6 · FitBud UI (my computer).** BP2 backups (ZB13, D-W6-9): create R2 buckets `fitbud-backups-staging` and `fitbud-backups-production` with a 30-day lifecycle rule (`wrangler r2 bucket create`, `wrangler r2 bucket lifecycle add`); create one account-owned API token per env with only Account · D1 · Edit in the Cloudflare dashboard (Chrome, tech@); set it with `wrangler secret put CF_D1_EXPORT_TOKEN` for each env (value never in a file); deploy the backup Worker; check the first object; run the restore drill from `docs/runbooks/d1-backups.md`.
- [ ] **W6 · FitBud UI (my computer), ongoing.** Account deletion requests sent to tech@thefitbud.com (Zoho in Chrome): verify the sender matches the account and run `docs/runbooks/account-deletion.md` (ZB14); reply once the purge run reports it.
- [ ] **W6/W11 · Firoz (only he can).** In the Play Console, add the account deletion URL (`/account/delete` on the production API, ZB14) and update the data safety form (deletion: archived 6 months, then deleted; immediate deletion by email). Play Console is on Firoz's personal Gmail; if he invites tech@thefitbud.com as a Play Console user with app content permissions, FitBud UI can do it instead. The App Store side waits for the Apple account.
- [ ] **W9 · FitBud UI (my computer).** New Android dev build after ZE9 merges (`eas build --profile development --platform android` with the `EXPO_TOKEN` robot). **Can be done on my computer:** EAS builds run in Expo's cloud and only need the token. The rebuild is required because ZE9 adds native modules and config plugins (D-W9-6).
- [ ] **W9 · nobody (no step).** Health Connect needs no console or cloud setup: the `READ_STEPS` permission and the rationale screen ship in the app manifest through the config plugin, and the user grants access on the device.
- [ ] **W9 · FitBud UI (my computer).** Steps device check (ZE9, ZE10) on an Android 14 emulator on the box (Health Connect is built in from Android 14; add test steps with Google's Health Connect Toolbox app), with the new dev build installed. **Can be done on my computer** if the emulator boots there: `/dev/kvm` exists on the box, but its access for the FitBud UI user is checked first. If the emulator cannot run, the check falls back to Firoz's Android phone (install the dev build link and open Steps).
- [ ] **W9 · Firoz (only he can).** Play Console health apps declaration for Health Connect `READ_STEPS` (and the matching data safety entry), before any Play testing or production build with steps goes out; not needed for the dev build. **Cannot be done on my computer:** Play Console is owned by Firoz's personal Gmail and tech@thefitbud.com has no access. If Firoz invites tech@thefitbud.com to the Play Console with app content permissions, FitBud UI can submit it. Google's review can take up to 7 days, then 5–7 business days for access to propagate.
- [ ] **W9 · waits (Apple on hold).** HealthKit capability on the App IDs `com.thefitbud.mobile` and `com.thefitbud.mobile.staging`, and the iOS dev build with HealthKit. **Cannot be done on my computer and is not done by anyone now:** it needs the Apple Developer account, which is on hold and must not be touched (EAS capability sync would touch it too, so no iOS build runs). iOS steps stay untested until Firoz lifts the hold (D-W9-4).
- [ ] **W12 · FitBud UI (my computer).** Apply the W12 migrations (ZH1, ZH5, ZH6) to staging, deploy, then production; check a 45-minute session reminder and a 15-minute call reminder on the Android dev build (emulator).
