---
id: X2b
title: Align expo-constants, expo-font and expo-linking with Expo SDK 52
batch: W1
depends_on: [X2, X6]
lane: mobile-build
files_owned:
  - apps/mobile/package.json
  - pnpm-lock.yaml  # these three packages only, under the W1.md lockfile rule
  - docs/specs/X2b.md
frames: []
model: sonnet
size: S
---

## Outcome
The EAS dev build Firoz makes in X3 (guide: `docs/runbooks/physical-device.md`) compiles and starts, because every Expo native module in `apps/mobile` matches Expo SDK 52.

## Context
- Requested by the repo owner (tech@thefitbud.com, Claude Code session, 31 Oct 2026). Follow-up to X2, which fixed `react-native-svg` the same way.
- The app is on Expo SDK 52: `expo ~52.0.46`, `react-native 0.76.9`, `react 18.3.1`, `expo-modules-core ~2.2.3`. Every other Expo module is on its SDK 52 version.
- `expo/bundledNativeModules.json` for SDK 52 expects `expo-constants ~17.0.8`, `expo-font ~13.0.4`, `expo-linking ~7.0.5`. `pnpm --filter @fitbud/mobile exec expo install --check` (offline, against that map) flags the three as mismatches.
- A native module built for a different SDK compiles against a different `expo-modules-core` / React Native and is likely to break the iOS/Android dev build or crash at startup (`expo-font` and `expo-constants` load at launch). Jest/Vitest and Metro web don't compile native code, so CI does not catch it.
- Decision (owner, 31 Oct 2026): stay on SDK 52 for the beta. A whole-SDK upgrade is out of scope here; checking SDK 52 against current store and EAS requirements before BT1 is a follow-up.

## Gap list
- `apps/mobile/package.json`: `"expo-constants": "^58.0.12"`, `"expo-font": "^58.0.8"`, `"expo-linking": "^58.0.13"`.
- `pnpm-lock.yaml`: resolves both `expo-constants@17.0.8` (via `expo`) and `58.0.12`, both `expo-font@13.0.4` and `58.0.8`, and `expo-linking@58.0.13`.

## Acceptance criteria
- [ ] `apps/mobile/package.json` has `"expo-constants": "~17.0.8"`, `"expo-font": "~13.0.4"`, `"expo-linking": "~7.0.5"`.
- [ ] `pnpm-lock.yaml` resolves one copy of each (17.0.8, 13.0.4, 7.0.5); the only other lockfile changes are removals of packages only the v58 copies pulled in.
- [ ] No other workspace package (`packages/ui-mobile` included) depends on a second copy.
- [ ] `pnpm --filter @fitbud/mobile exec expo install --check` reports no mismatches.
- [ ] Code that imports the three packages typechecks and existing mobile tests pass.

## Out of scope
- An Expo SDK upgrade, other dependency bumps, any app code change.
- X3 (Firoz's build). Agents never run `eas build`.
- Product rules (CLAUDE.md, never break) and working rules (no remote or deploy commands, no secrets, one task / one branch / one PR off latest `main`, update by merging `main`).

## Tests to add
- None (dependency pins only). Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `expo install --check`.

## Visual check
- n/a

## Stop conditions
- A file outside `files_owned` must change (for example, app code that no longer compiles against the SDK 52 APIs).
- The task would need a remote command, a secret or a deploy.
