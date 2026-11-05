---
id: AB1
title: Fix Android EAS build: ExpoModulesPackage autolinking
batch: W3
depends_on: []
lane: build
files_owned:
  - .npmrc  # the only file the merged fix changes (public-hoist-pattern)
frames: []
model: opus
size: S
---

## Outcome
**Status: merged 2 Nov (#143). The final EAS build is Firoz's step and is still outstanding.** This spec was corrected after the fact: its original suspected cause, suggested fix and suggested diagnostic were all wrong, and are marked below.

An EAS Android development build of the mobile app compiles. The generated `PackageList.java` imports `expo.modules.ExpoModulesPackage`, Gradle `:app:compileDebugJavaWithJavac` passes, and Firoz gets an install link for the staging variant. This unblocks every Android device check: X3, LA1–LA3c, X4e, X4d.

## Context
- **PR #139** ("Mobile: link EAS project", `apps/mobile/app.json` only) adds `owner` and `extra.eas.projectId`, without which `eas build` has no project to target. **Merged 2 Nov.** It was listed as a blocker for starting AB1; in the event the owner directed AB1 to be built against `main` without waiting, which was harmless because nothing in #139 affects Gradle autolinking.
- Failing builds, project `@tech-fitbuds-team/thefitbud`, profile `development`, platform Android: `fa0acab2-1e36-41d1-8372-216fd0bbbde1` (2 Nov 2026) and `5e0295a7` (31 Oct 2026). Both fail at Gradle `:app:compileDebugJavaWithJavac`. `:live-activity:compileDebugKotlin` succeeded, so the LA3 module itself is not the cause.
- The errors are in the generated file `android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java`: at lines 14 and 64, `cannot find symbol` for `import expo.core.ExpoModulesPackage`. Expo SDK 52 (`apps/mobile/package.json:27`, `expo` `~52.0.46`, lockfile `expo@52.0.49`, `expo-modules-autolinking@2.0.8`) provides `expo.modules.ExpoModulesPackage`. **The string `expo.core.ExpoModulesPackage` exists nowhere in `node_modules`** — nothing reads it, it is synthesised (see the confirmed cause below).
- **Confirmed cause** (verified in #143; this paragraph replaces the original "suspected cause", which named pnpm's layout correctly but the mechanism and the fix wrongly). It *is* pnpm's isolated layout, but not because anything resolves the wrong `expo` — `expo@52.0.49` resolves correctly every time. The chain is:
  1. `expo-modules-autolinking@2.0.8`'s `reactNativeConfig.js` hands `loadConfigAsync` the **symlinked** package root `apps/mobile/node_modules/expo`; it `realpath`s only `react-native`.
  2. `expo/react-native.config.js` begins `require('expo-modules-autolinking/exports')`. Under the isolated layout that package exists only beside expo's *real* location in `node_modules/.pnpm`, and it is not a dependency of `@fitbud/mobile`, so nothing on the walk-up path from the symlink resolves it.
  3. `config.js`'s `requireConfig` swallows the `MODULE_NOT_FOUND` in a bare `catch {}` and returns `null`.
  4. `androidResolver.js` therefore falls back to `` `import ${packageName}.${nativePackageClassName};` ``, where `packageName` is regex-scraped from `expo/android/build.gradle`'s `namespace "expo.core"` and the class name is globbed from `**/*Package.{java,kt}`. The bad import is **manufactured from a failed lookup**.
- **Fix as merged (#143):** `public-hoist-pattern[]=expo-modules-autolinking` in the root `.npmrc`, which puts it in the root `node_modules` — on Node's walk-up path from any package symlinked under the repo. `node-linker=hoisted` and a lockfile regeneration were **considered and rejected**: strictly larger, and the regeneration collides with W4's BT2/BT2b. The `*eslint*` and `*prettier*` lines must be repeated alongside it, because `public-hoist-pattern` **replaces** pnpm's defaults rather than extending them; verified on pnpm 9.15.4 that omitting them removes eslint from the root `node_modules`.
- **⚠️ Do not diagnose this through `npx` or `pnpm exec`.** Both go through pnpm's bin shim, which sets `NODE_PATH` into the pnpm store and **accidentally repairs the very resolution that is broken** — so they report the correct import while the build is failing. (The original version of this spec suggested exactly that, and it cost a wrong diagnosis.) Note also that `expo-modules-autolinking resolve` is **not** the failing path — `react-native-config` is — and `npx react-native config` cannot run at all, because `@react-native-community/cli` is not installed (it is only used when `EXPO_USE_COMMUNITY_AUTOLINKING=1`, which EAS does not set). The check that reproduces the bug is the command `android/settings.gradle` actually runs, with `NODE_PATH` unset and cwd `apps/mobile`:
  ```bash
  cd apps/mobile && env -u NODE_PATH node --no-warnings --eval \
    'require(require.resolve("expo-modules-autolinking",{paths:[require.resolve("expo/package.json")]}))(process.argv.slice(1))' \
    react-native-config --json --platform android
  ```
- An older production build, `83a7f392`, failed with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: the pnpm overrides (`package.json:33-37`, `@types/react` `~18.3.20`, `@types/react-dom` `~18.3.1`) did not match the lockfile. The `overrides:` block in `pnpm-lock.yaml:22-24` must still match `package.json`, and `pnpm install --frozen-lockfile` must pass (EAS installs with a frozen lockfile). The merged fix leaves the lockfile byte-identical, so this class of failure is not reintroduced.
- Build infrastructure, so `opus` by the model rule. No app code changes.
- Written against `main` at 56a83ba. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `.npmrc`: `expo-modules-autolinking` is not reachable from the symlinked `apps/mobile/node_modules/expo`, so `expo/react-native.config.js` fails to load and its real `packageImportPath` is never used.
- Generated `PackageList.java:14` and `:64` (EAS build `fa0acab2`): `import expo.core.ExpoModulesPackage` / `new ExpoModulesPackage()` that does not resolve on SDK 52.

## Acceptance criteria
- [x] The cause is confirmed and written in the PR, with the command output that shows it (before and after).
- [x] From a clean clone, `pnpm install --frozen-lockfile` passes and the Gradle-equivalent autolinking command (above) reports `import expo.modules.ExpoModulesPackage;`. **`./gradlew :app:assembleDebug` was NOT run** — there is no Android SDK in a cloud session and `dl.google.com` is blocked by the agent proxy, so no real `PackageList.java` was produced. The node-level check is tight because `@react-native/gradle-plugin`'s `GeneratePackageListTask` substitutes `packageImportPath` into a fixed template (its only transform, FQDN-prefixing bare `BuildConfig`/`R`, is a no-op for these strings).
- [x] `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, and the web and API builds (`pnpm --filter @fitbud/trainer-web build`, `pnpm --filter @fitbud/api build`; `wrangler deploy --dry-run` only if it runs fully offline) still pass.
- [x] No stray dependency changes: **the lockfile does not change at all** (byte-identical to `main`), no package is added, removed or bumped in any `package.json`, and the resolved versions of `expo`, `react-native` and `expo-modules-autolinking` are unchanged.
- [x] The lockfile `overrides:` block matches `package.json` `pnpm.overrides` exactly (trivially — the lockfile is unchanged).
- [x] The generated `android/` directory is not committed.
- [ ] **Final check (manual, after merge, by Firoz or the bot):** `eas build --profile development --platform android` for the staging variant succeeds and gives an install link. Not claimed by the implementer.

## Out of scope
- An Expo SDK upgrade or any dependency bump (see Stop conditions).
- iOS builds (on hold by Firoz, 1 Nov). EAS project linking (PR #139). Sentry packages (BT2, BT2b, W4).
- Any app code, native module or config plugin change (`apps/mobile/modules/**`, `apps/mobile/plugins/**`, `apps/mobile/targets/**`).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- No unit test can catch autolinking. Add a short check to the PR description, with output: `grep -n "ExpoModulesPackage" android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java` after prebuild and Gradle shows `expo.modules.ExpoModulesPackage`.
- The node-level check that actually reproduces the bug is the Gradle-equivalent command in Context, run with `NODE_PATH` unset and **not** through `npx`/`pnpm exec`. `expo-modules-autolinking resolve` is the wrong subcommand — it reports correctly even when the build is broken. Recorded in the PR; deliberately not added to CI in this task — follow-up **AB1b**, which matters because the upstream bare `catch {}` makes this failure silent and reachable again at any SDK bump.
- Checks to run: `pnpm install --frozen-lockfile`, `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, the web and API builds.

## Visual check
- Non-UI: no screenshot. The PR shows the `PackageList.java` import line and the Gradle result.

## Stop conditions
- The chosen hoisting breaks the web or API builds, the tests or typecheck, and no equivalent fix keeps them green.
- The fix needs an Expo SDK upgrade or any dependency version change.
- The cause cannot be confirmed locally (no Android SDK and no node-level evidence); write up what was found and stop rather than guess.
- `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` or the overrides would have to change.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
