---
id: AB5
title: iOS config for dev builds and push (Team ID, notifications plugin, widget bundle id)
batch: W3
depends_on: [AB4]
lane: build
files_owned:
  - apps/mobile/app.json  # ios.appleTeamId, ios.config.usesNonExemptEncryption
  - apps/mobile/app.config.js  # aps-environment per variant, expo-notifications plugin with mode
  - apps/mobile/targets/FitBudLiveActivity/expo-target.config.js  # explicit widget bundleIdentifier
  - apps/mobile/app.config.test.ts  # new assertions
frames: []
model: sonnet
size: S
---

## Outcome
The iOS development build (staging identity, `com.thefitbud.mobile.staging`) can be signed by EAS for Firoz's registered iPhone with the FitBud Apple team, receives Expo push through APNs, and the Live Activity widget extension has a fixed, predictable bundle id. Android behaviour is unchanged.

## Context
- Apple Developer access resumed 3 Nov 2026 (the 1 Nov hold is lifted). Apple Team ID **`26257QDTHP`** (not a secret; it goes in the repo). The Apple team and an Admin App Store Connect API key are already linked to the Expo account `tech-fitbuds-team` (done 3 Nov by FitBud UI), so EAS creates the App IDs, App Group, certificates, profiles and the APNs key itself. None of that is in this task.
- Metro warns on `main`: `[bacons/apple-targets] Expo config is missing required ios.appleTeamId`. `@bacons/apple-targets` 0.2.1 needs it to sign the widget target.
- Push is Expo Push Service (v14 D-B7, X4a/X4e). `expo-notifications ~0.29.14` is installed (`apps/mobile/package.json:35`) but is not in the plugins list, so the iOS build has no `aps-environment` entitlement and iOS cannot get a push token.
- `expo-notifications` plugin (`plugin/build/withNotificationsIOS.js:8-11`) takes option `mode` (default `development`) and writes `aps-environment` only when it is not already set. Set both from one value so they cannot disagree: `production` for the production variant, `development` for staging and development (EAS internal/ad hoc builds use the development APNs environment; store builds use production).
- Widget bundle id: `@bacons/apple-targets` 0.2.1 `withWidget.js:225-230` accepts `bundleIdentifier`; a value starting with `.` is appended to the host app's id. Use `".widget"` (or the equivalent `${config.ios.bundleIdentifier}.widget`), giving `com.thefitbud.mobile.widget` and `com.thefitbud.mobile.staging.widget`, which matches `docs/runbooks/staging-setup.md:45`.
- `usesNonExemptEncryption: false`: the app only uses HTTPS/OS crypto (exempt); this skips the export-compliance prompt in TestFlight (BT1).
- Android notification icon/color: `app.json` defines none today, so add the plugin **without** `icon`/`color`; Android notifications must look and behave exactly as now (LA3/X4e channels live in `src/notifications/androidChannels.ts`, untouched).
- AB3 (#159) and AB4 (#164) are merged; they owned `app.json` and `app.config.js`, so there is no live claim. AB5 runs after AB4 in the build lane. Keep `expo-dev-client` and `expo-secure-store` (AB3) in `app.json` plugins, and keep `@bacons/apple-targets` after `./plugins/withLiveActivity` (LA1).
- HealthKit, associated domains, push-to-start Live Activities: not now (W9 / post-beta, D-B7).

## Gap list
- `apps/mobile/app.json:14-16`: `ios` has only `supportsTablet`; no `appleTeamId`, no `config.usesNonExemptEncryption`.
- `apps/mobile/app.json:26-29` and `apps/mobile/app.config.js:79`: `expo-notifications` is not a plugin.
- `apps/mobile/app.config.js:68-71`: no `aps-environment` entitlement for any variant (`plugins/withLiveActivity.js:159-161` merges existing entitlements, so one set here survives).
- `apps/mobile/targets/FitBudLiveActivity/expo-target.config.js:13-29`: no `bundleIdentifier`; the id is derived implicitly.
- Written against `main` at 4e1575a. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `app.json` `ios` has `"appleTeamId": "26257QDTHP"` and `"config": { "usesNonExemptEncryption": false }`; `supportsTablet` kept.
- [ ] `app.config.js` adds `ios.entitlements["aps-environment"]` = `"production"` for `APP_VARIANT=production`, `"development"` for staging, development and unset; existing entitlements (App Group) are kept.
- [ ] `app.config.js` adds `["expo-notifications", { mode: <same value> }]` to plugins, without `icon`, `color` or sounds, placed before `@bacons/apple-targets`; the plugin list otherwise keeps its order and entries.
- [ ] `expo-target.config.js` returns `bundleIdentifier: ".widget"` (resolving to `<host bundle id>.widget`); type, deploymentTarget, frameworks and entitlements unchanged.
- [ ] `npx expo config --type prebuild` (Linux, each `APP_VARIANT`) succeeds and no longer prints the missing `ios.appleTeamId` warning. Paste the relevant output in the PR.
- [ ] Android unchanged: `APP_VARIANT=staging npx expo prebuild --platform android --no-install` in a scratch copy; diff `AndroidManifest.xml` against `main` and paste it in the PR. Any change beyond what `expo-notifications` needs to function (no new icon/color metadata) is a stop condition.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] **Device check (Firoz / FitBud UI, not claimed by the implementer):** after merge, `eas build --profile development --platform ios` signs with team `26257QDTHP`, installs on Firoz's registered iPhone, gets an `ExponentPushToken` and receives a staging reminder push; the widget extension id in the build log is `com.thefitbud.mobile.staging.widget`.

## Out of scope
- Any Apple portal, App Store Connect or EAS credential work (`eas build`, `eas credentials`, `eas device:create`): FitBud UI / Firoz, outside the repo.
- `eas.json` changes, including `submit.production.ios` (`ascAppId`, `appleTeamId`) and `autoIncrement`: BT1 owns them.
- HealthKit, associated domains, push-to-start or remote Live Activity updates, notification icon/color/sounds, any JS or native code change.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/app.config.test.ts`: for production, staging, development and unset variants assert `ios.appleTeamId === "26257QDTHP"`, `ios.config.usesNonExemptEncryption === false`, `ios.entitlements["aps-environment"]` (production → `production`, others → `development`), the App Group entitlement still present, the `expo-notifications` plugin entry's `mode` equals the entitlement, `@bacons/apple-targets` is still last, and `liveActivityTarget(config).bundleIdentifier` resolves to `<ios.bundleIdentifier>.widget` (`com.thefitbud.mobile.widget` / `com.thefitbud.mobile.staging.widget`).
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- `expo-notifications` needs `icon`/`color` or otherwise changes Android notification appearance or behaviour.
- `@bacons/apple-targets` 0.2.1 ignores or rejects `bundleIdentifier` (check the prebuild output); report, do not upgrade the package.
- A dependency, lockfile, native or `eas.json` change is needed.
- A file outside `files_owned` must change.
- The task would need a remote command (`eas build`, `eas credentials`, …), a secret or a deploy.
