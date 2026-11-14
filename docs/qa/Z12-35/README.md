# QA · Z12-35 · Device gate harness

The harness (`scripts/qa/device/`, `.github/workflows/device.yml`; how it works:
`scripts/qa/device/README.md`) ran on its own PR, #438, through the `pull_request`
trigger for harness paths, with the defaults: both platforms, both themes, the `smoke`
flows, extras on. Failures were expected: the point of the example run is that the
harness builds the PR head natively, runs it against the local seeded API on both
platforms, and reports.

## Example runs

| Run | Head | Android | iOS | Notes |
|---|---|---|---|---|
| [43610441275](https://github.com/thefitbud/thefitbud/actions/runs/43610441275) | `77adfd8d` | ran end to end: 1/4 flows pass per theme, log clean | built (44 min), Maestro's iOS driver did not start in time | first run; idb tap untrusted |
| [43613279879](https://github.com/thefitbud/thefitbud/actions/runs/43613279879) | `d4e14846` | same flows; lock-screen tap found the push in the shade and tapped it | same driver failure | theme patch logged; luminance evidence added |
| [43616323952](https://github.com/thefitbud/thefitbud/actions/runs/43616323952) | `263fb968` | same | **ran end to end**: driver warm-up fixed it; 1/4 flows pass per theme, log clean | **the example run: both platforms, both themes, complete** |
| [43619775723](https://github.com/thefitbud/thefitbud/actions/runs/43619775723) | `6cd2f93d` | native cache miss: full build 8 min, cache saved | native cache miss, arm64-only build | first run with the native-build cache |
| [43623489626](https://github.com/thefitbud/thefitbud/actions/runs/43623489626) | `31ea770c` | **native cache hit: build 70 s** (was 8–12 min); same results as the full build | **native cache hit: build 98 s** (was 33–44 min); same results; idb installed (built with Xcode 26.3) | **proof of the native-build cache**: identical flow results and a clean log on the swapped bundle |
Z12_33_ROWS

## What the example run shows

Run 43616323952, both platforms, light and dark, `smoke` flows, the same four results on
iOS and Android in both themes:

| Flow | Result | Why (harness or app) |
|---|---|---|
| `auth/sign-in-password.yaml` | **PASS** (both platforms, both themes) | the Release app reaches the local seeded API over plain HTTP (ATS / network-security patch), signs in as rahul.coach |
| `auth/sign-in-code.yaml` | FAIL: `"Today's workout\|Needs you\|Choose mode" is visible` is false | expected: the fixed QA sign-in code is staging-only, the local API emails a random code to its dev mail sink. Needs a flow that reads `GET /dev/mail` (Z12-58) |
| `trainee/today.yaml` | FAIL: `No visible element found: "Nutrition"` | the nightly flow's QA-seed expectation does not hold for the local demo persona (aarav.ontrack's Today); flow/seed mismatch for Z12-58's v3 flows, not a crash |
| `trainer/clients.yaml` | FAIL: `".*QA Rohan.*" is visible` is false | the flow's own `env:` default (`QA Rohan`) wins over the harness's `-e QA_SLIPPING_NAME=Rohan Mehta`; the v3 flows (Z12-58) should take names from the runner only |

- **Device logs: clean on both platforms** (no crash, red box, LogBox, console.error /
  console.warn, React warning; `Running "main"` captured, so the scan had something to
  scan). Android logcat ~143k lines; iOS app-process log ~398k lines.
- **Theme:** both devices switched (`simctl ui appearance`, `cmd uimode night` read back),
  and the iOS Info.plist was patched to `Automatic`. Mean screenshot luminance light 0.865
  / dark 0.85 (iOS), 0.859 / 0.859 (Android): **the current app has no dark styling**
  (no `useColorScheme`/`Appearance` anywhere in `apps/mobile/src` or `packages/ui-mobile`),
  so dark screenshots look light until Z12-37 lands the v3 dark tokens. The luminance line
  will show the switch from then on.
- **Push:** iOS `simctl push` delivered (APNs payload in Expo's envelope); Android
  `shell-notification` posted and confirmed by `dumpsys notification`.
- **Lock screen:** Android UiAutomator found "FitBud" in the shade over the keyguard and
  tapped it (`tapped-no-app`, correct for a shell-owned notification). iOS: idb could not be
  installed (the Homebrew formula needs Xcode 26); fixed in `eb31fe71` (build with Xcode 26
  or use the prebuilt release). Live Activity: `not-found` (no workout running), as expected.
- **Offline:** Android airplane mode on/off read back; iOS local API stopped and restarted,
  demo sign-in working again afterwards.
- **Timing:** iOS full build 44 min with both simulator architectures, 33 min arm64-only
  (run 43619775723); Android 8–12 min. With the native-build cache (run 43623489626): iOS
  98 s, Android 70 s, i.e. a JS-only task's gate is about 25 min end to end instead of 60+.
  The flows take about 15 min per platform for the four smoke flows in two themes.

## Native-build cache (proved)

Run 43619775723 missed (first run with the cache) and saved both apps; run 43623489626 hit
on both platforms, rebuilt only the JS bundle (`expo export:embed` + `hermesc`, bytecode
version checked against the cached bundle), re-signed (iOS ad hoc; Android zipalign +
debug keystore + `apksigner verify`) and produced the same results as the full builds:
password sign-in passes on both platforms in both themes, the same three flow failures,
a clean device log with `Running "main"` captured. Key inputs and the hit/miss rules:
`scripts/qa/device/README.md` "Native-build cache".

## iOS lock-screen tap

idb now installs (run 43623489626: built with the image's Xcode 26.3, then back to 16.4).
The tap found nothing: the lock screen showed only the clock and date after `simctl push`.
Either the app had no notification authorization at that moment (no flow had asked for it)
or iOS kept the entry in the lock screen's Notification Center; `b80e0eef` adds a swipe-up
into Notification Center before giving up. Z12-47 (push routing) should grant notification
permission in its flow before it relies on this tap.

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
- **Console-error vitest gate in every vitest workspace** (D-W12-28): one shared setup,
  `packages/config/vitest/fail-on-console.js` (rules and allow-list in `console-gate.js`),
  listed in `setupFiles` of `apps/api`, `apps/mobile`, `apps/trainer-web` (new
  `vitest.config.ts` that merges `vite.config.ts` unchanged) and `packages/{api-client,
  brand, contracts, core, tokens, ui-mobile}` (new `vitest.config.ts` each). The proof that
  a `console.error` fails a test is `apps/mobile/src/test/fail-on-console.test.ts`.
  Offenders when it was turned on, all fixed in test files only:
  - mobile: 206 tests. 202 were the render harness's own SVG stand-ins (PascalCase DOM
    tags), fixed in `src/test/render.tsx` with custom-element stand-ins; 4 are React DOM's
    nested-`<button>` rule (react-native-web renders nested Pressables as nested buttons),
    allow-listed with a written reason (below).
  - trainer-web: `ClientRow.test.tsx` rendered a table row outside a table; it now renders
    it inside `<table><tbody>`, as `ClientsPage` does.
  - api: 11 tests whose code path logs a structured error by design (fault injection,
    misconfiguration, a failed spawn). Each now spies on `console.error` and asserts the
    exact log line (`"message":"Unhandled API error"`, `queue.message_failed`,
    `account.purge_failed`, `RUNTIME_MISCONFIGURED`, the spawn messages), so the tests got
    stricter, not weaker. Files: `run-command.test.ts`, `auth-login.test.ts`,
    `configuration.test.ts` (2), `meals.test.ts`, `workouts.test.ts`, `progress.test.ts`,
    `reminders.at-most-once.test.ts` (2), `account-purge.test.ts`.
  `pnpm test`: 17 of 17 tasks green (api 1625, mobile 1252, trainer-web 678, core 244, …). Follow-up for the WorkoutTab owner (Z12-44/45): the
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
