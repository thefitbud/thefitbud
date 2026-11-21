# Mobile distribution · staging TestFlight and Play internal

How Firoz ships the **staging** app (`com.thefitbud.mobile.staging`, display name FitBud Staging) to TestFlight and Google Play internal testing. Agents never run `eas build` or `eas submit`. No secret values belong in this file.

Production store release stays in [`store-release.md`](store-release.md). Dev / internal preview installs stay in [`physical-device.md`](physical-device.md).

## Why `staging-store`

| Profile | Distribution | Use |
|---|---|---|
| `development` | internal, dev client | Metro JS; local or staging API |
| `preview` | internal | Standalone staging APK/IPA via Expo install link |
| **`staging-store`** | **store** | Staging binary for TestFlight and Play **internal** track (closed beta rehearsal) |
| `production` | store | `com.thefitbud.mobile` → TestFlight / Play closed testing |

`staging-store` uses the same staging API and trainer-web URLs as `preview`, `APP_VARIANT=staging`, remote credentials (EAS-managed), `autoIncrement: true`, and the EAS **preview** environment (so `GOOGLE_SERVICES_JSON` and other staging file envs apply).

Workspace packages export `./dist`, which is gitignored. EAS runs `eas-build-post-install` in `apps/mobile/package.json` (`pnpm -w run build:packages`) so Bundle JavaScript can resolve `@fitbud/*` on the worker.

## One-time console setup

1. **App Store Connect:** create (or confirm) an app whose bundle id is `com.thefitbud.mobile.staging`. Copy its Apple ID into the vault as `ASC_STAGING_APP_ID` (submit profile reads `$ASC_STAGING_APP_ID`). Team ID `26257QDTHP` is already public in `apps/mobile/app.json`.
2. **Expo credentials:** the Admin App Store Connect API key is already linked on the Expo account (`tech-fitbuds-team`). Submit uses that stored key — do not put `.p8` paths or key ids in the repo. Confirm with `eas credentials` for the staging bundle id if a submit fails auth.
3. **Play Console:** create (or confirm) an app with package `com.thefitbud.mobile.staging`. **The first Android App Bundle for a new Play app must be uploaded manually** in Play Console (Create app → Internal testing → Create new release → upload the `.aab`). After that first manual upload, `eas submit --profile staging-store --platform android` can push later drafts to the internal track (`releaseStatus: draft`). Omit a local service-account path so Expo Submit uses the Play key already assigned on Expo servers.

## Build (Firoz)

From `apps/mobile`, after `eas login`:

```bash
eas build --profile staging-store --platform ios
eas build --profile staging-store --platform android
```

Do not start these from an agent session. Wait for each build to finish on expo.dev before submit.

## Submit (Firoz)

Export `ASC_STAGING_APP_ID` in the shell that runs submit (vault only). Then:

```bash
eas submit --profile staging-store --platform ios --latest
eas submit --profile staging-store --platform android --latest
```

- **iOS:** binary lands in TestFlight for the staging app. Add internal testers in App Store Connect. Privacy URL can match staging web (`https://app-staging.thefitbud.com/privacy`) once that page exists.
- **Android:** upload goes to the **internal** track as a **draft**. Promote / add testers in Play Console. Remember the first AAB is manual (above).

## After install

Sign in against staging Firebase (`AUTH_MODE=firebase` on the staging API). Demo passwords from `docs/LOCAL_TESTING.md` do not work on staging.
