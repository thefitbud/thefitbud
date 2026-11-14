# Device gate harness (Z12-35)

From W12 on, a mobile task is not done until it has been tapped through on devices: the
iOS simulator and the Android emulator, running the PR head as a native app, as every
role it touches, in light and dark, with zero crashes, red boxes or warnings in the
device logs (W12 prompt §3). This folder is the harness that does that, and
`.github/workflows/device.yml` runs it on GitHub-hosted runners.

The cloud sessions that build W12 run on Linux with no KVM and no Xcode, so the harness
runs in GitHub Actions, not in the session: an Android emulator on `ubuntu-latest` (with
KVM) and an iOS simulator on `macos-15`. Both are standard runners, free for this public
repository.

## Dispatching a run

Actions → **Device gate** → *Run workflow*, on the PR's branch. (The workflow only
shows up there once `device.yml` is on `main`.) From a terminal:

```bash
gh workflow run device.yml --repo thefitbud/thefitbud --ref <branch> \
  -f platforms=both -f themes=both -f flows=smoke -f roles= -f extras=all
```

| Input | Values | Default | What it does |
|---|---|---|---|
| `platforms` | `both`, `ios`, `android` | `both` | which jobs run |
| `themes` | `both`, `light`, `dark` | `both` | system themes the flows run in, one after the other |
| `flows` | a Maestro tag, or comma-separated path globs under `apps/mobile/.maestro` | `smoke` | `smoke`, `full`, `device`, `trainee` …, or e.g. `flows/v3/F08*.yaml,flows/trainee/today.yaml` (`*` stays in a folder, `**` crosses folders) |
| `roles` | comma-separated `trainee`, `trainer`, `dual`, `auth` | empty | keeps only the selected flows tagged with one of these |
| `extras` | `all`, `none` | `all` | after the flows: push + lock-screen tap, Live Activity tap attempt, offline → online |
| `android_api` | an API level | `36` | the emulator image, `system-images;android-<n>;google_apis;x86_64` |

The workflow also runs on a pull request, **only** when the harness itself changes
(`scripts/qa/device/**`, `device.yml`, `apps/mobile/.maestro/common/**` and
`apps/mobile/.maestro/device/**`), with the
defaults above. It never runs on other mobile PRs, it is not a required check and must
not become one, it reads no secret, and it never cancels a run (no concurrency group).

## What a run does

Per platform (jobs `device-android` and `device-ios`; the harness's unit tests run in
their own job, `device-harness-tests`):

1. **Local seeded API** (`local-api.sh start`, in the background while the app builds):
   `pnpm db:reset` (or `pnpm db:reseed` once Z12-34 adds it, with `DEVICE_DB=reseed`),
   then `wrangler dev --local` on `0.0.0.0:8787`. Never staging, never a remote D1
   command.
2. **Build** (`build-app.sh`): the nightly build scripts, unchanged in behaviour
   (`scripts/qa/build-ios-sim.sh`, `scripts/qa/build-android-apk.sh`: staging variant,
   Release, Hermes bytecode, ad-hoc signed on iOS), with two optional hooks they now
   expose:
   - `QA_API_BASE_URL`: `http://127.0.0.1:8787` on iOS (the simulator shares the Mac's
     network), `http://10.0.2.2:8787` on Android (the emulator's view of the runner);
   - `QA_POST_PREBUILD_HOOK` = `patch-native.sh`, which edits only the **generated,
     git-ignored** native project after `expo prebuild`:
     - iOS: `NSAppTransportSecurity.NSAllowsLocalNetworking = true` (Expo's template
       normally has it already; the job log prints the stock value), and an
       `AppDelegate.mm` hook that logs every JS and native warning and error as
       `[fitbud-gate] js.warn …` / `js.error` / `native.warn` / `native.error`. A Release
       build otherwise drops warnings and writes no level next to a JS line.
     - Android: a network security config allowing plain HTTP to `10.0.2.2`,
       `127.0.0.1` and `localhost` only. The Release manifest has cleartext off (Expo
       enables it only in the debug manifest).
   `app.config.js`, the config plugins and the native dependencies are not touched:
   native changes in W12 belong to Z12-57 only.
3. **Device**: iOS simulator `iPhone-16` on the newest iOS 18 runtime of Xcode 16.4,
   at `Asia/Kolkata` (`ios-sim.sh`). Xcode 16.4 is the newest toolchain Expo SDK 52 /
   RN 0.76 builds with (Xcode 26 is not supported, see `qa.yml`). Android: the
   `google_apis` x86_64 image at `android_api` (default 36, the latest stable), Pixel 6.
4. **Flows** (`run-gate.sh`): for each theme, `theme.sh` switches the system appearance,
   then Maestro runs the selected flows (`select-flows.mjs`) signed in as the local demo
   personas: `QA_TRAINER_EMAIL` rahul.coach, `QA_ONTRACK_EMAIL` aarav.ontrack,
   `QA_SLIPPING_EMAIL` rohan.slipping, `QA_DUAL_EMAIL` karan.dual, `QA_PASSWORD` the
   public demo password (read from `apps/api/src/seed/demo/spec.ts`), `DEVICE_THEME`
   and `DEVICE_PLATFORM`. The local API has no fixed sign-in code (that switch is
   staging-only), so a flow that signs in **with a code** fails locally until it reads
   the code from the local dev mail sink (`GET /dev/mail?to=<email>`).
5. **Extras** (once, in the last theme): a push and a lock-screen tap on it, a
   lock-screen Live Activity tap attempt, and an offline → online round trip with a
   screenshot of each state. These are evidence, reported in the summary; the verdict is
   the flows and the logs. Each task states which outcome it needs (§3 item 5).
6. **Logs** (`logs.sh`, `scan-logs.mjs`) and **verdict** (`gate-summary.mjs`).

## How the gate maps to prompt §3

| §3 item | Where |
|---|---|
| 1. `ci`, `e2e`, `banned-strings` green | not this workflow: the existing required checks |
| 2. task flows on iOS sim + Android emulator, local seeded API, light + dark, every role, zero crashes/red boxes/warnings | `device.yml` inputs `flows`/`roles`/`themes`; `run-gate.sh`; `scan-logs.mjs` fails the job |
| 3. manual tap-through of every control | Maestro flows the task adds (Z12-58 writes `flows/v3/`), plus `lockscreen-tap.sh`/`find-element.mjs` for what Maestro cannot reach |
| 4. screenshots per mock ID, both themes, both platforms; parity rows | `<screen ID>-<theme>-<platform>.png` in the `device-<platform>` artifact (`shots/`), `copy-shots.sh` into `docs/qa/<task>/` or `docs/qa/W12/shots/`; `parity-gen.mjs` for the rows |
| 5. lock-screen, push, offline steps done and evidenced | `lockscreen-tap.sh`, `push.sh`, `network.sh`; results under `<platform>/extras/` and the screenshots |
| 6. what only a phone can prove goes on Firoz's checklist | see "Not covered by a simulator" below |

## Flows that need the device offline

Tag a flow `device-offline` and the harness runs it with the device offline. When any
selected flow carries that tag, the run switches to one Maestro invocation per flow, in
path order (`junit-01.xml`, `junit-02.xml` … per theme): `network.sh <platform> offline`
before a `device-offline` flow, `online` after it. The flows then share the app's state,
so only the first one should start with `launchApp: clearState: true`; the others use
`launchApp: stopApp: false` to bring the running app to the front.

Task-specific gate flows live in `apps/mobile/.maestro/device/<task>/`, outside the
nightly suite's `flows/**`, and are selected by tag or glob.

## Task checks you can dispatch

| Task | Dispatch | What it proves |
|---|---|---|
| Z12-33 (trainer cache late-write guard) | `--ref claude/Z12-33-cache-late-write -f flows=z12-33 -f platforms=both` (that branch needs this harness: merge `main` into it once Z12-35 lands) | `device/z12-33/`: Rahul signs in, loads Attention, Clients and a client, pulls to refresh and signs out; Priya signs in on the same install and sees none of Rahul's clients online or offline; Rahul signs back in and sees none of Priya's offline. Screenshots `shots/flows/rahul-*`, `priya-*`. One departure from docs/qa/Z12-33 step 8: Attention is the landing tab, so it loads online as Rahul signs in, before the device can go offline |

## Offline method per platform

- **Android: real airplane mode.** `adb shell cmd connectivity airplane-mode enable|disable`,
  read back from `settings get global airplane_mode_on`. The OS reachability signal
  changes exactly as on a phone.
- **iOS simulator: the local API is stopped**, not the network (`local-api.sh stop`,
  then `serve` + `wait` on the same D1 state). The simulator has no airplane mode and
  shares the Mac's network stack; blocking the host or the port with `pf` would also cut
  the runner's connection to GitHub, and the Network Link Conditioner is not scriptable
  on a hosted runner. Every FitBud request then fails with "connection refused", which
  is what the app's reachability probe sees offline. Not exercised on iOS: the OS
  reachability signal (NWPathMonitor / NetInfo once Z12-57 adds it) — Firoz's checklist.

## Push method per platform

The payload is built by `push-payload.mjs` in the app's real shape: the
`pushPayloadSchema` routing data (ids only), validated against the built contract, with
the text the API sends (`apps/api/src/lib/expo-push.ts`: title "FitBud", body = the
type's label), in Expo's envelope.

- **iOS: `xcrun simctl push <udid> com.thefitbud.mobile.staging <payload.apns>`.** The
  routing data is the APNs `body` key next to `aps`, exactly as the Expo Push Service
  sends it, so the banner or lock-screen entry is the app's own and a tap reaches
  `expo-notifications`' response listener and the app's routing (`openListener.ts`).
- **Android: `fcm-broadcast` when the APK has a Firebase config, else
  `shell-notification`.**
  - `fcm-broadcast`: `adb root` (the `google_apis` image allows it), then `am broadcast`
    of `com.google.android.c2dm.intent.RECEIVE` with Expo's FCM data map to the app's
    `FirebaseInstanceIdReceiver`. Used only when the APK carries `google_app_id`:
    without a Firebase config, FirebaseMessaging is not initialised and the broadcast
    would crash the app instead of testing it.
  - `shell-notification`: `adb shell cmd notification post` with the same title and
    text. Owned by the shell, so it proves the lock-screen tap mechanics only; a tap
    opens nothing. **This is what runs on CI today**: `google-services.json` is an EAS
    file secret and the gate holds no secrets. App routing of a real Android push stays
    on Firoz's device checklist.
  The method used is in `android/extras/push.json`.

## Lock-screen taps

Maestro cannot tap the lock screen. `lockscreen-tap.sh` does it:

- **iOS: `idb`** (fb-idb + idb_companion, installed best effort by the workflow):
  `idb ui button HOME`, the push, `idb ui button LOCK` (twice if the first press leaves
  the display off), `idb ui describe-all --json` (springboard elements included),
  `find-element.mjs` to locate the entry, `idb ui tap x y`, then `describe-all` again to
  see whether the app is the frontmost Application. XCUITest springboard queries would
  work too but need a UI-test target compiled on the runner. Without idb the outcome is
  `unavailable` and the rest of the gate still runs.
- **Android: UiAutomator**: `KEYCODE_HOME`, the push, `KEYCODE_SLEEP`, `KEYCODE_WAKEUP`,
  `uiautomator dump`, `find-element.mjs`, `input tap` twice (the keyguard asks for a
  second tap), then `dumpsys window` for the focused package.
- **Live Activity** (`lockscreen-tap.sh <platform> <theme> live-activity "<match>"`):
  same mechanics, no push. The app starts its Live Activity (iOS) / ongoing workout
  notification (Android) itself during a workout, so a task starts a workout first
  (Z12-48). With none on screen the outcome is `not-found`.

Outcomes: `opened-app`, `tapped-no-app`, `not-found`, `unavailable`, in
`<platform>/extras/lockscreen-<target>.json`, with `lockscreen-<target>-before/after`
screenshots and the raw screen dumps under `lockscreen/`.

## Log-failure rules

`scan-logs.mjs` fails the run on any of these in the app's device log
(iOS: `xcrun simctl spawn <udid> log stream --style compact --level debug --predicate
'process == "<CFBundleExecutable>"'` plus any crash report the app wrote; Android:
`adb logcat -v threadtime`, streamed, buffers at 16 MB):

| Kind | Android | iOS |
|---|---|---|
| `crash` | `FATAL EXCEPTION` naming the app, `ANR in` the app, a native tombstone (`>>> com.thefitbud.mobile…`) | a crash report (`.ips`), or the nightly scan's patterns (`RangeError`, `SIGABRT`, `EXC_BAD_ACCESS`, uncaught exception, …) |
| `redbox` | `E ReactNativeJS/ReactNative` with RCTRedBox, LogBox, Render Error, Invariant Violation, Unhandled JS Exception | the same text at error level |
| `js-error` | `E ReactNativeJS` (console.error) | `[fitbud-gate] js.error`; without the AppDelegate patch, an error-level `[com.facebook.react.log:javascript]` line |
| `js-warn` | `W ReactNativeJS` (console.warn) | `[fitbud-gate] js.warn` |
| `rn-error` / `rn-warn` | `E` / `W ReactNative` (native side; LogBox shows these in a dev build) | `[fitbud-gate] native.error` / `native.warn` |
| `react-warning` | "Requiring unknown module", "Encountered two children", "Each child in a list", "VirtualizedLists should never be nested", "Possible unhandled promise", anywhere | same |
| `capture-empty` | the log never shows `Running "main"`: the app's output was not captured, so the scan proved nothing | same |

React's dev-only warnings (keys, nested lists, two children) are not emitted by a
Release build at all; they are caught in a dev build by
`apps/mobile/.maestro/common/assert-no-crash.yaml` (now including those five strings)
and in unit tests by `apps/mobile/src/test/fail-on-console.ts`, which fails any mobile
vitest test that calls `console.error`.

**Allow-list:** `allowlist.json`, `[{ "pattern": "<regex>", "platform":
"ios|android|both", "reason": "<why>" }]`. An entry without a written reason (20+
characters) fails the scan. It ships empty: nothing is allowed without a reason in the
PR that adds it.

## Artifacts

Each job uploads `device-<platform>` (14 days), the whole `qa-results/device/`:

```
shots/<screen ID>-<theme>-<platform>.png      screens named by the flows (takeScreenshot: TR-26e)
shots/flows/<name>-<theme>-<platform>.png     every other Maestro screenshot (older flows, failures)
shots/lockscreen-*-<theme>-<platform>.png     lock-screen before/after; offline-app, online-app
<platform>/summary.md, summary.json           the verdict (also in the job summary)
<platform>/<theme>/junit.xml, maestro.log     Maestro per theme (demo password masked)
<platform>/scan.json                          log findings
<platform>/extras/*.json                      push, lock-screen and offline evidence
logs/<platform>-device.log, *.ips, api.log    device log, crash reports, local API log
lockscreen/                                   raw idb / uiautomator dumps
```

Copy the screen shots into the repository with `copy-shots.sh`:

```bash
gh run download <run id> --repo thefitbud/thefitbud --pattern 'device-*' --dir /tmp/device-run
scripts/qa/device/copy-shots.sh /tmp/device-run                 # -> docs/qa/W12/shots/
scripts/qa/device/copy-shots.sh /tmp/device-run docs/qa/Z12-44  # or a task's own folder
```

## Parity matrix rows

`parity-gen.mjs` writes one row per screen ID × theme of `docs/design/v3/screen-profile.md`
(185 screens, 370 rows) into `docs/qa/W12/parity.md`, in the §3 row template. It is
idempotent and non-destructive: it finds the existing table by its header, matches
columns by name, keeps every filled cell and every row the profile no longer lists, and
only fills empty cells (screenshot and mock paths have defaults). `--check` exits 1 when
rows are missing and writes nothing; `--stdout` prints instead of writing.

## Files

| File | Purpose |
|---|---|
| `lib.sh` | shared helpers (bash 3.2-safe: macOS runners) |
| `local-api.sh` | seed + serve / wait / stop the local API |
| `build-app.sh`, `patch-native.sh` | build against the local API; patch the generated native project |
| `ios-sim.sh` | create and boot the simulator |
| `theme.sh`, `network.sh`, `push.sh`, `push-payload.mjs` | theme, offline/online, push |
| `screenshot.sh`, `collect-shots.mjs`, `copy-shots.sh` | screenshots and their names |
| `logs.sh`, `scan-logs.mjs`, `allowlist.json` | device logs and the failure rules |
| `lockscreen-tap.sh`, `find-element.mjs` | lock-screen notification and Live Activity taps |
| `select-flows.mjs`, `run-gate.sh`, `gate-summary.mjs` | flow selection, the run, the verdict |
| `parity-gen.mjs` | parity matrix rows |
| `*.test.mjs` | unit tests, run by `node --test "scripts/qa/**/*.test.mjs"` |

## Not covered by a simulator (Firoz's checklist, Z12-58)

A real push from the API through Expo/APNs/FCM and its lock-screen tap on Android; the
Live Activity look and its Log/Open taps on a real lock screen; the OS reachability
signal on iOS; haptics; keep-awake; real airplane mode → log → reconnect on iOS.
