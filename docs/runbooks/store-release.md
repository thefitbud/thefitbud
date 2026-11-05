# Store release (TestFlight and Play closed testing)

How Firoz builds the production app and submits it for the closed beta: TestFlight (internal, then external) and Google Play closed testing (D-W4-2, D-W4-3). The production variant is `com.thefitbud.mobile`. Agents never run `eas build` or `eas submit`.

This runbook is written in W4 and used in W13 (D-W4-13). W13 (D-W13-4) changes the store answers before submission: in-app account deletion, and HealthKit / Health Connect because steps ship in that beta. Until that update, this cut declares neither HealthKit nor Health Connect, and account deletion is by email.

No secret values belong in this file, the repo, a PR or a chat. Names only.

## Before you start

- Production API and trainer web are deployed (I6b). The store build calls `https://api.thefitbud.com`.
- Privacy policy is published at `https://app.thefitbud.com/privacy` (BT3). Both consoles require that URL.
- EAS project is linked (`docs/runbooks/physical-device.md`). `eas login` on the machine that submits.
- Build numbers: `apps/mobile/eas.json` has `cli.appVersionSource` `remote` and `build.production.autoIncrement` `true` (D-W4-8). EAS stores the build number. Do not commit a build number for each release.
- The production profile sets `APP_VARIANT=production` and `EXPO_PUBLIC_API_BASE_URL=https://api.thefitbud.com` (the name the app reads; see `apps/mobile/src/lib/api.ts`). `EXPO_PUBLIC_TRAINER_WEB_URL` is `https://app.thefitbud.com`.
- On the EAS **production** environment, set `EXPO_PUBLIC_SENTRY_DSN` to the mobile DSN (BT2b). The DSN is public by design; keep the copy in the password vault and the EAS dashboard.

## Secrets (names only)

| Name | Where it lives | When |
|---|---|---|
| `EXPO_TOKEN` | Password vault, and a CI secret only if a workflow runs `eas build` or `eas submit`. A local `eas login` session does not use it. | Only if the command runs in CI. |
| `SENTRY_AUTH_TOKEN` | Sentry → the org auth token, then an EAS secret on the **production** environment (`eas env:create` or expo.dev). Never in the repo or the shell history (D-W4-7). | Production builds, so source maps upload. |

## Submit environment variables

`eas.json` `submit.production` reads these from the environment of the machine that runs `eas submit`. No store ids or key files are in the repo.

| Name | Where the value lives |
|---|---|
| `ASC_APP_ID` | App Store Connect → the app → App Information → Apple ID (a number). Copy it into the password vault. |
| `APPLE_TEAM_ID` | Apple Developer → Membership → Team ID. Same vault. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Absolute path **outside the repo** to the Play Console service-account JSON, for example a file you keep in the vault and write to `~/.config/fitbud/google-play-service-account.json`. Do not commit the JSON. |

Play first receives the build on the **internal** track (`releaseStatus` `completed`). Promote that release to closed testing in Play Console. Do not point `eas.json` at the production track.

## Commands

From `apps/mobile`, after the env vars above are set for submit:

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production --platform ios --latest
eas submit --profile production --platform android --latest
```

Build first. Submit only after each build is finished on expo.dev. `--latest` submits the newest production build for that platform.

## App Store Connect

1. Create the app record for bundle id `com.thefitbud.mobile`, name FitBud, primary language English. SKU is an internal id you choose; it is not shown on the store.
2. Set the privacy policy URL to `https://app.thefitbud.com/privacy`.
3. **App Privacy** (this cut). Data is linked to the user and used for app functionality. Answer **not used for tracking** for every type. Do not declare Health & Fitness, Location, Financial Info or Purchases. Payments in FitBud are trainer records only; the app does not collect money.
   - Contact Info: name, email address, phone number.
   - User Content: photos, and other user content (workout logs, meal logs, check-ins, measurements, notes).
   - Identifiers: user id.
   - Diagnostics: crash data (Sentry). No performance data (`tracesSampleRate` is 0).
4. **TestFlight**
   - Internal group: people on the Apple team. No Beta App Review.
   - External group: the closed-beta trainers. This needs Beta App Review.
   - Beta App Review Information: a working trainer sign-in (create the account in production; put the email and password only in App Store Connect), contact `tech@thefitbud.com`, and a short note that the app is a closed coaching beta, sign-in is by email code, and there is no in-app purchase.
   - What to check before you send the external group to review:
     - `https://app.thefitbud.com/privacy` loads.
     - The review account can sign in against `https://api.thefitbud.com`.
     - The build is the production variant (`com.thefitbud.mobile`), not staging.
     - You can open the app, sign in, and reach a client list without a crash.
     - Crash reporting is on for this build (`EXPO_PUBLIC_SENTRY_DSN` set, `SENTRY_AUTH_TOKEN` present so the upload is symbolicated).
     - The binary does not prompt for Health, and App Privacy does not mention Health.
     - Export compliance: the app uses standard HTTPS only (`usesNonExemptEncryption` is false).
5. Add external testers only after Beta App Review accepts the build.

## Play Console

1. Create the app. Package name `com.thefitbud.mobile`. Do not publish to the production track.
2. Privacy policy URL: `https://app.thefitbud.com/privacy`.
3. **Internal testing:** upload happens via `eas submit` (`track` `internal`). Add the internal tester list (email addresses) and opt in yourself before promoting.
4. **Closed testing:** in Play Console, promote the internal release to a closed testing track. Add the trainer tester list (Google Group or email list). Do not open testing and do not use the production track.
5. **Data safety** (this cut). Data is collected and encrypted in transit. It is not sold and not used for advertising or tracking. Users can ask for deletion by emailing `tech@thefitbud.com` (no in-app delete button in this cut).
   - Personal info: name, email, phone — collected, linked to the user, shared with the coach the user is linked to (not sold).
   - Photos and app activity (logs, check-ins, measurements): collected, linked, shared with that coach.
   - Crash logs: collected, sent to Sentry as a service provider, not used for tracking.
   - Do not declare health, location, financial info or contacts from the address book.
   - Do not declare Health Connect. Steps are not in this cut.
6. **Content rating:** complete the questionnaire for a private coaching tool. No violence, no sexual content, no public user-generated feed, no unrestricted web, no real-money gambling. Record the rating Play returns; do not guess it here.
7. **Target audience:** 18 and over. The app is not for children. Do not opt into Designed for Families.
8. What to check before you promote to closed testing:
   - Internal testers can install from the internal link and sign in to production.
   - Privacy URL loads.
   - Data safety and the content rating are submitted.
   - The release notes do not promise Health Connect or payments collection.

## After submission

Store screenshots, marketing text and the tester invites are Firoz's (W13). This runbook stops at a build accepted for TestFlight external review and a build sitting on the Play closed track.
