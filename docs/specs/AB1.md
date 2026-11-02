---
id: AB1
title: Fix Android EAS build: ExpoModulesPackage autolinking
batch: W3
depends_on: []
lane: build
files_owned:
  - .npmrc  # node-linker (or the equivalent setting) only
  - pnpm-lock.yaml  # regenerated for the new layout only; shared with BT2/BT2b (W4) under the W4.md lockfile rule
  - apps/mobile/metro.config.js  # only if the chosen layout needs a resolver change
frames: []
model: opus
size: S
---

## Outcome
An EAS Android development build of the mobile app compiles. The generated `PackageList.java` imports `expo.modules.ExpoModulesPackage`, Gradle `:app:compileDebugJavaWithJavac` passes, and Firoz gets an install link for the staging variant. This unblocks every Android device check: X3, LA1–LA3c, X4e, X4d.

## Context
- **Depends on PR #139** ("Mobile: link EAS project", `apps/mobile/app.json` only, branch `mobile/link-eas-project`). It must be merged before this task starts; branch off `main` after it lands. PR #139 is not a spec, so it is not in `depends_on`.
- Failing builds, project `@tech-fitbuds-team/thefitbud`, profile `development`, platform Android: `fa0acab2-1e36-41d1-8372-216fd0bbbde1` (2 Nov 2026) and `5e0295a7` (31 Oct 2026). Both fail at Gradle `:app:compileDebugJavaWithJavac`. `:live-activity:compileDebugKotlin` succeeded, so the LA3 module itself is not the cause.
- The errors are in the generated file `android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java`: at lines 14 and 64, `cannot find symbol` for `import expo.core.ExpoModulesPackage`. Expo SDK 52 (`apps/mobile/package.json:27`, `expo` `~52.0.46`, lockfile `expo@52.0.49`, `expo-modules-autolinking@2.0.8`) provides `expo.modules.ExpoModulesPackage`, so autolinking is reading a stale or wrong package description.
- **Suspected cause, not verified:** pnpm's isolated `node_modules` layout in this monorepo (`.npmrc` today has only `auto-install-peers=true` and `strict-peer-dependencies=false`; `pnpm-workspace.yaml` lists `apps/*` and `packages/*`). React Native autolinking and the Expo Gradle plugin resolve packages by walking `node_modules`, and the symlinked layout can make them resolve the wrong `expo` description. The likely fix is `node-linker=hoisted` in the root `.npmrc` plus a regenerated `pnpm-lock.yaml`. **The implementer must confirm the cause first** (for example, reproduce with `expo prebuild` and Gradle locally, and inspect what `npx expo-modules-autolinking resolve` and `npx react-native config` report for `expo` from `apps/mobile`) and may choose an equivalent fix (for example `public-hoist-pattern` entries, or a `react-native.config.js` override) if it is smaller and keeps the other workspaces unchanged. Record the confirmed cause in the PR.
- An older production build, `83a7f392`, failed with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: the pnpm overrides (`package.json:33-37`, `@types/react` `~18.3.20`, `@types/react-dom` `~18.3.1`) did not match the lockfile. The `overrides:` block in `pnpm-lock.yaml:22-24` must still match `package.json` after regeneration, and `pnpm install --frozen-lockfile` must pass (EAS installs with a frozen lockfile).
- Build infrastructure, so `opus` by the model rule. No app code changes.
- Written against `main` at 56a83ba. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `.npmrc:1-2`: no `node-linker` setting, so pnpm uses the isolated (symlinked) layout.
- `pnpm-lock.yaml`: generated for the isolated layout; must be regenerated for whatever layout is chosen, with the `overrides:` block (`:22-24`) unchanged.
- Generated `PackageList.java:14` and `:64` (EAS build `fa0acab2`): `import expo.core.ExpoModulesPackage` / `new ExpoModulesPackage()` that does not resolve on SDK 52.

## Acceptance criteria
- [ ] The cause is confirmed and written in the PR, with the command output that shows it (before and after).
- [ ] From a clean clone, `pnpm install --frozen-lockfile` passes, then `npx expo prebuild --platform android --clean` in `apps/mobile` and `./gradlew :app:assembleDebug` in `apps/mobile/android` (or the equivalent check if no Android SDK is available, see Stop conditions) produce a `PackageList.java` that imports `expo.modules.ExpoModulesPackage` and compiles.
- [ ] `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, and the web and API builds (`pnpm --filter @fitbud/trainer-web build`, `pnpm --filter @fitbud/api build`; `wrangler deploy --dry-run` only if it runs fully offline) still pass.
- [ ] No stray dependency changes: the lockfile diff changes only the layout, no package is added, removed or bumped in any `package.json`, and the resolved versions of `expo`, `react-native` and `expo-modules-autolinking` are unchanged. The PR lists `git diff --stat` and a short summary of the lockfile diff.
- [ ] The lockfile `overrides:` block matches `package.json` `pnpm.overrides` exactly.
- [ ] The generated `android/` directory is not committed.
- [ ] **Final check (manual, after merge, by Firoz or the bot):** `eas build --profile development --platform android` for the staging variant succeeds and gives an install link. Not claimed by the implementer.

## Out of scope
- An Expo SDK upgrade or any dependency bump (see Stop conditions).
- iOS builds (on hold by Firoz, 1 Nov). EAS project linking (PR #139). Sentry packages (BT2, BT2b, W4).
- Any app code, native module or config plugin change (`apps/mobile/modules/**`, `apps/mobile/plugins/**`, `apps/mobile/targets/**`).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- No unit test can catch autolinking. Add a short check to the PR description, with output: `grep -n "ExpoModulesPackage" android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java` after prebuild and Gradle shows `expo.modules.ExpoModulesPackage`.
- If a node-level check is possible without the Android SDK (for example asserting that `npx expo-modules-autolinking resolve --platform android` from `apps/mobile` lists `expo` with the SDK 52 package), record it in the PR; do not add it to CI in this task.
- Checks to run: `pnpm install --frozen-lockfile`, `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, the web and API builds.

## Visual check
- Non-UI: no screenshot. The PR shows the `PackageList.java` import line and the Gradle result.

## Stop conditions
- The hoisted (or chosen) layout breaks the web or API builds, the tests or typecheck, and no equivalent fix keeps them green.
- The fix needs an Expo SDK upgrade or any dependency version change.
- PR #139 is not merged on `main`.
- The cause cannot be confirmed locally (no Android SDK and no node-level evidence); write up what was found and stop rather than guess.
- `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` or the overrides would have to change.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
