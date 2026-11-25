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

**Push environment (Z14-30):** `staging-store` is signed for the **production** APNs environment (TestFlight delivers through production APNs); `preview`, `development` and ad hoc builds use **development**. The EAS profile sets `APS_ENVIRONMENT`, and `app.config.js` feeds that one value to the `aps-environment` entitlement and the `expo-notifications` mode. Changing it needs a new iOS build; testers must install it and sign in again so a new push token is registered. To check, read `aps-environment` in the EAS build log or the built entitlements.

`staging-store` uses the same staging API and trainer-web URLs as `preview`, `APP_VARIANT=staging`, remote credentials (EAS-managed), `autoIncrement: true`, and the EAS **preview** environment (so `GOOGLE_SERVICES_JSON` and other staging file envs apply).

Workspace packages export `./dist`, which is gitignored. EAS runs `eas-build-post-install` in `apps/mobile/package.json` (`pnpm -w run build:packages`) so Bundle JavaScript can resolve `@fitbud/*` on the worker.

**Node / pnpm on the worker (Z12-62b):** every build profile `extends` a shared `base` that sets `node: "22.23.3"` (matches `.nvmrc` / `engines.node`) and `pnpm: "9.15.4"` (matches root `packageManager`). Without that, EAS defaults to Node 20 and `@fitbud/tokens` fails in `POST_INSTALL_HOOK` (`node: bad option: --experimental-strip-types`).

**App version (Z12-62c):** `apps/mobile/app.json` `version` is the CFBundleShortVersionString / Play versionName. It is `"0.1.0"` for the closed beta. Apple rejects `0.0.0`. Bump it (for example `0.1.1`, then `0.2.0`) when you cut a new beta series; leave build numbers to EAS `autoIncrement` / remote `appVersionSource`. About screens and Sentry release strings read this value from Expo config (fallbacks of `"0.0.0"` in code are only for a missing config, not the shipped version).

**ASC app ids (Z12-62c):** `eas.json` `submit.*.ios.ascAppId` must be digit literals — EAS does not interpolate `$VARS` there. Staging (FitBud Coach Staging) is `6837745310`; production (FitBud Coach) is `6830533558`. They are not secrets.

**iOS build image (Z12-62d):** Apple requires the iOS 26 SDK (Xcode 26+) for App Store Connect uploads (ITMS-90725). Expo SDK 52’s default EAS image is still Xcode 16.2. Every profile `extends` `base`, which sets `ios.image` to `macos-sequoia-15.6-xcode-26.2` (Xcode 26.2). We stayed on SDK 52 rather than upgrading to SDK 54+; if that image fails to compile native modules, the next step is the smallest Expo SDK bump that defaults to Xcode 26.

**Android target API (Z12-62e):** Play requires `targetSdkVersion` ≥ 36. `expo-build-properties` sets `compileSdkVersion` / `targetSdkVersion` 36 and `buildToolsVersion` `36.0.0` (minSdk stays 26 for Health Connect). Still on Expo SDK 52 — no SDK upgrade. Targeting 35+ enables Android edge-to-edge; most screens use `SafeAreaView` / `StatusBar.currentHeight`, but custom header screens need a device check after the next staging-store build.

**HealthKit / other purpose strings (Z12-62d):** both `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` are set (runtime stays read-only; omitting update fails ITMS-90683). `expo-av` sets `microphonePermission: false` (playback only for rest-end sound). `expo-secure-store` sets `faceIDPermission: false` (session tokens, no Face ID).

## One-time console setup

1. **App Store Connect:** confirm the app whose bundle id is `com.thefitbud.mobile.staging` (FitBud Coach Staging). Submit uses `ascAppId` `6837745310` in `eas.json`. Team ID `26257QDTHP` is already public in `apps/mobile/app.json`.
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

```bash
eas submit --profile staging-store --platform ios --latest
eas submit --profile staging-store --platform android --latest
```

- **iOS:** binary lands in TestFlight for the staging app. Add internal testers in App Store Connect. Privacy URL can match staging web (`https://app-staging.thefitbud.com/privacy`) once that page exists.
- **Android:** upload goes to the **internal** track as a **draft**. Promote / add testers in Play Console. Remember the first AAB is manual (above).

## After install

Sign in against staging Firebase (`AUTH_MODE=firebase` on the staging API). Demo passwords from `docs/LOCAL_TESTING.md` do not work on staging.
