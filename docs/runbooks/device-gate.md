# Runbook · the W12 device gate

From W12 on, a mobile task merges only after the device gate ran its flows on the iOS
simulator and the Android emulator, against the local seeded API, in light and dark, with
zero crashes, red boxes or warnings (W12 prompt §3, D-W12-16). The workflow is
`.github/workflows/device.yml` ("Device gate"); the harness and every rule it applies are
described in `scripts/qa/device/README.md`. It is not a required check.

## 1. Dispatch it for your task

Run it on your PR's branch, or on `main` with `ref` set to your branch:

```bash
gh workflow run device.yml --repo thefitbud/thefitbud --ref main \
  -f ref=claude/Z12-44-workout-tab \
  -f flows=z12-44 -f roles=trainee -f platforms=both -f themes=both -f extras=all
```

| Input | Use |
|---|---|
| `ref` | the branch, tag or SHA whose app to build; empty = the branch the workflow runs from. `scripts/qa` (the harness) always comes from the workflow's own commit, so a branch made before the harness changed still gets today's gate. Maestro flows come from your ref: your own `common/` and `device/` files win, and the harness only adds flow files your branch does not have |
| `flows` | a Maestro tag (`launch`, `full`, your task's tag), several tags (`launch,z12-44`), or path globs under `apps/mobile/.maestro` (`flows/v3/F08*.yaml`) |
| `roles` | optional filter: `trainee`, `trainer`, `dual` |
| `platforms`, `themes` | `both` unless you are re-running one side |
| `extras` | `all` adds the push + lock-screen tap, Live Activity tap attempt and offline/online samples |
| `android_api` | emulator image, default 36 |

Put task-only flows in `apps/mobile/.maestro/device/<task>/` with a task tag; tag a flow
`device-offline` to run it with the device offline (the run then goes one flow at a time,
in path order; only the first flow should `clearState`). Screenshots a flow names after a
v3 screen (`takeScreenshot: TR-26e`) are saved as `TR-26e-<theme>-<platform>.png`.

```bash
gh run list --repo thefitbud/thefitbud --workflow device.yml --limit 3   # find the run
gh run watch <run id> --repo thefitbud/thefitbud                          # never cancel it
```

## Scoped task runs (Firoz, 15 Nov 2026)

A W12 task's device run covers only the flows for the screens it changed, plus the **launch
smoke test** on iOS and Android: the app opens, sign-in works, Today loads
(`apps/mobile/.maestro/device/launch/`, tag `launch`: the demo trainee reaches a loaded
Today, the demo trainer `rahul.coach` reaches a loaded Attention). The older `smoke` flows
fail on the current app and are not part of this.

- Dispatch with `flows=launch,<task tag or flow globs>`. The list may mix tags and globs: an item
  with only letters, digits, `-` or `_` is a tag, anything else (a `/` or `*`) is a glob; the run
  is their union, and a tag or glob that matches no flow fails the dispatch, for example
  `-f flows=launch,z12-44` or `-f flows=launch,flows/v3/F08*.yaml`.
- Record in the PR which flows ran and why they cover the change.
- Before any device run, run typecheck, lint and the unit tests, and do the Expo web
  screenshot check against the v3 mocks (393x852, light and dark; method in
  `docs/qa/QT9/README.md` and `docs/qa/BT3d/QA-BT3d.md`).
- Z12-58 alone runs the full suite.

## 2. Read the result

- **Job summary** (`device-ios`, `device-android`): PASS/FAIL, the reasons, flows per
  theme, the first log findings, and the evidence lines (build mode and time, push method,
  lock-screen outcome, offline method, mean screenshot luminance per theme).
- **The job fails** when a flow fails in any theme, or the device log shows a crash, red
  box, LogBox, `console.error` / `console.warn`, a React warning, or never shows the app
  starting. Nothing is allow-listed without a written reason
  (`scripts/qa/device/allowlist.json`).
- **Artifacts** `device-ios` / `device-android` (14 days): `shots/`, `<platform>/summary.md`,
  JUnit and Maestro logs per theme, `logs/` (device log, crash reports, API log),
  `lockscreen/` dumps, the native fingerprint manifest.
- **Finding your run:** each run is named `Device gate · <app ref> · <flows>` (the `run-name`), so list the device.yml runs and pick the one named after your branch. Every dispatched run's `head_branch` is `main`.
- **`refs/device-gate/<run id>`** (dispatched runs only; a re-run is `<run id>-<attempt>`):
  the screenshots and verdict files as one commit, for cloud agent sessions, which cannot download artifacts (the artifact
  blob host is not on their network allowlist).
- Copy your screens into the repository (a cloud session uses the ref; with `gh` and
  artifact access, `gh run download <run id> --repo thefitbud/thefitbud --pattern 'device-*' --dir /tmp/device-run` works too):

```bash
git fetch origin refs/device-gate/<run id>:refs/device-gate/<run id>
mkdir -p /tmp/device-run && git archive refs/device-gate/<run id> | tar -x -C /tmp/device-run
scripts/qa/device/copy-shots.sh /tmp/device-run docs/qa/<task ID>
node scripts/qa/device/parity-gen.mjs        # adds only missing rows, to their section's table; never rewrites a row
```

Then fill your rows in `docs/qa/W12/parity.md` and list `screen ID → control → result` in
the PR (§3 items 3–4).

## 3. Timing

A full native build is about 33 minutes on iOS (arm64 only) and 8–12 on Android. When no
native input changed (every W12 task except Z12-57), the native build comes from the cache
and only the JS bundle is rebuilt and swapped in; the summary's `build` line says which.
The flows take about 7 minutes per theme per platform for the four smoke flows.

## 4. What the gate cannot prove

Real pushes through Expo/APNs/FCM, the Live Activity on a real lock screen, iOS OS
reachability, haptics and keep-awake: those go on Firoz's device checklist (Z12-58).
