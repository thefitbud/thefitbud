# QA · Z12-35 · Device gate harness

The harness (`scripts/qa/device/`, `.github/workflows/device.yml`; how it works:
`scripts/qa/device/README.md`) ran on its own PR, #438, through the `pull_request`
trigger for harness paths, with the defaults: both platforms, both themes, the `smoke`
flows, extras on. Failures were expected: the point of the example run is that the
harness builds the PR head natively, runs it against the local seeded API on both
platforms, and reports.

## Example runs

RUNS_TABLE

## What the example run shows

FINDINGS

## Departures and decisions

- **Runs in GitHub Actions, not in the session** (orchestrator decision): the W12 cloud
  container has no KVM and no Xcode. Android on `ubuntu-latest` + KVM, iOS on `macos-15`.
- **Xcode 16.4 / iOS 18.6, not the newest on the image.** Expo SDK 52 / RN 0.76 does not
  build with Xcode 26 (`qa.yml` documents the same pin). The newest iOS 18 runtime that
  Xcode has is picked automatically.
- **Android API 36** (latest stable `google_apis` x86_64 image), overridable with the
  `android_api` input.
- **iOS offline = stop the local API.** The simulator shares the Mac's network; pf would
  cut the runner off. OS reachability on iOS stays on Firoz's checklist.
- **Android push = shell notification on CI.** The APK has no Firebase config (an EAS
  secret), so an FCM broadcast would crash the app rather than test it; the script uses
  the FCM broadcast automatically when a build does carry one.
- **Harness-only native patches** (generated, git-ignored projects only; `app.config.js`,
  plugins and native deps untouched): ATS local networking, JS/native warning markers in
  `AppDelegate.mm`, `UIUserInterfaceStyle = Automatic` (orchestrator decision: the shipped
  app follows the system from Z12-57), Android cleartext to the emulator's host only.
- **Mobile vitest console.error gate** (`apps/mobile/src/test/fail-on-console.ts`). Turning
  it on failed 206 tests: 202 were the render harness's own SVG stand-ins (PascalCase DOM
  tags), fixed in `src/test/render.tsx` with custom-element stand-ins; 4 are React DOM's
  nested-`<button>` rule (react-native-web renders nested Pressables as nested buttons),
  allow-listed with a written reason. Follow-up for the WorkoutTab owner (Z12-44/45): the
  `OverflowMenu` button sits inside the day card's button, which on iOS hides it from
  VoiceOver; un-nest it and drop the allow-list entry. Tests that hit it:
  `WorkoutTab.render.test.tsx`, `WorkoutTab.week.test.tsx`,
  `WorkoutTab.pendingSummary.test.tsx`, `workout/coach-logged/WorkoutTab.gating.test.tsx`.
- **`docs/qa/W12/parity.md` is not committed here** (Z12-32 writes it); only the generator
  `parity-gen.mjs` and its test ship.
- **Z12-33's two-trainer device check** is in `apps/mobile/.maestro/device/z12-33/`
  (dispatch `flows=z12-33` against `claude/Z12-33-cache-late-write` once that branch has
  merged `main` with this harness). One departure from docs/qa/Z12-33 step 8: Attention is
  the trainer's landing tab, so it loads online as Rahul signs back in, before the device
  can go offline; the check that offline never shows Priya's rows still holds.
