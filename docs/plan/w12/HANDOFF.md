# W12 orchestrator handoff (17 Nov 2026)

The first W12 orchestrator session hands over to a fresh one here. The session ended because its own context had grown very large, which made every step expensive. Read this file together with `docs/plan/w12/W12-PROMPT.md` (the run prompt), `docs/specs/batches/W12.md` (decisions D-W12-1 to D-W12-35, and the revised order under "Order (revised, D-W12-35)"), AGENTS.md and CLAUDE.md. Where this file and W12.md disagree, W12.md wins.

## 1. State at handover

**Merged W12 tasks (10.5 of 32):**

| Task | PR |
|---|---|
| Z12-31 | #434 |
| Z12-32 | #436 |
| Z12-33 | #435 |
| Z12-34 | #439 |
| Z12-35 | #438, with follow-ups #444, #445, #447, #452 |
| Z12-36 | #440 |
| Z12-37 | #451 |
| Z12-41 | #449 |
| Z12-54 | #437 |
| Z12-55 | #441 |
| Z12-56 | #443 |
| Z12-50 part 1 (server) | #442 |

The plan revision is #446.

**Open at handover:**
- **Z12-39 (#448):** ready. The device run on the final app head is green: 43743416490, app head 50136722, every flow passing on iOS and Android in light and dark. A delta review of its fix round was running. If it hasn't merged, merge it once a fresh review passes. Main must be merged in first if main moved (see §3).
- **Z12-38 (#450):** draft.
  - Device run 4 (43744259140 at e2f523d) was pending.
  - Agreed: after one green run on both platforms, a single docs-only commit (screenshots, parity rows, README) may follow without a new run.
  - Z12-38 must remove the D-W12-33 allow-list entry. Run 43715594740 already showed iOS `allowed: 0` with the workout flow included.
  - If the PR isn't green and complete, start a fresh Opus agent for Z12-38 on that branch with a short handoff. Don't try to resume the old one.
- **#453 and #454:** Firoz's own ops hotfixes. Not W12; don't touch them.

**Next tasks, in the revised order (W12.md, D-W12-35):**
- When #448 merges: Z12-40.
- When #450 merges: Z12-47 and Z12-50 part 2.
- After that, follow the priority list in W12.md.
- Z12-57 starts after every other mobile task has merged.
- Then Z12-58 (the full pass), Z12-59 (Firoz runs the deploy, D-W12-32) and Z12-60.

**Models (Firoz):**
- **Z12-45:** Fable, as the run prompt says.
- **Z12-60:** Opus at **high effort** (Firoz, 17 Nov 2026). This replaces the prompt's Fable.
- **Implementers:** Sonnet for standard tasks (CLAUDE.md), Opus for complex ones (sync, auth, data, the active workout).
- **Reviewers:** Opus for code PRs; Sonnet is fine for docs-only or harness-only deltas.
- Record every model choice in the report.

## 2. Usage rules (learned the hard way)

The budget ran out three times: two 5-hour limits on 15 Nov and the weekly limit from 15 Nov 18:30 to 17 Nov 09:00. The cause was long-lived agents whose context reached 500–770k tokens and was re-read on every step, made worse by polling device runs. Rules:

- **One fresh agent per round.** A fix round or a device check goes to a new agent with a short handoff, not a resumed long agent.
- **No polling.** Wait for a device run or CI with one background Bash `until …; do sleep 60; done` (`run_in_background`, long timeout), or end the turn and get notified. Never loop on short checks inside a big context.
- **Device runs confirm; they don't discover (D-W12-34).** Run lint, typecheck, unit tests and the Expo-web screenshot check first. Then do one scoped run (`flows=launch,<task tag>`). One flake re-run is allowed.
- **Keep reviews to the delta.** Re-review only the commits since the last review.
- **Orchestrator.** Act on completion notifications. Keep the scheduled check-in every 2 hours (`send_later`) as a backstop only.

## 3. How things work (read before the first merge)

- **Merging:** the branch rule requires a PR to be **up to date with main**. Otherwise the merge API answers "Required status check "ci" is expected". Merge `origin/main` into the branch, wait for `ci`, `e2e` and `banned-strings`, then merge. Use a merge commit and pass the full 40-character `expectedHeadSha`.
- **Device gate:** dispatch `device.yml` with workflow ref `main` and inputs `{"ref":"<branch>","flows":"launch,<tag or globs>"}` (GitHub MCP `actions_run_trigger`).
  - Each run is named `Device gate · <app ref> · <flows>`.
  - `head_branch` is always `main`, so identify the run by its name.
  - **Before accepting evidence, confirm that the device job log's `git log -1` equals the PR's app head.** One review caught evidence from an older commit.
  - Commits after the run that change nothing under `apps/mobile/src` or `packages/` (docs, QA, main merges without mobile code) don't need a new run.
  - A main merge needed only to satisfy the up-to-date rule also keeps the evidence valid, even if it brings another task's already device-tested mobile code, as long as `ci`, `e2e` and `banned-strings` are green on the merged head. The task's own code didn't change, CI tests the combination, and Z12-58's full pass tests it on devices. Re-running a 40-minute device check after every main merge would serialise the whole batch. Record each use in the PR. (Orchestrator decision, 17 Nov 2026; first used for Z12-39 after Z12-41 merged.)
- **Maestro flows come from the app ref.** `device.yml` overlays only `scripts/qa` from the workflow commit, and adds only harness flows the ref lacks. A branch that hasn't merged main keeps old copies of `common/*.yaml`, so merge main before dispatching.
- **Screenshots:** `git fetch origin refs/device-gate/<run id>:refs/device-gate/<run id>`, then `git archive refs/device-gate/<run id> | tar -x -C <dir>`, then `scripts/qa/device/copy-shots.sh <dir> docs/qa/<ID>`. A re-run publishes `refs/device-gate/<run id>-<attempt>`. Never propose environment or network changes: nobody is there to approve them, and one agent sat blocked for 2 hours on exactly that.
- **Implementer brief.** Give every implementer these:
  - AGENTS.md, CLAUDE.md, the spec and the W12 decisions;
  - opt migrated screens into dark (`<Screen v3>`);
  - cheap checks and the Expo-web check first (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; `/opt/pw-browsers` has chromium 1243 while Playwright wants 1248, so symlink in the scratchpad);
  - wrap local API or web boots in `flock /tmp/fitbud-capture-{1,2}.lock`;
  - the hand-off rule for shared files (D-W12-35);
  - one scoped device run;
  - fill the parity rows with `scripts/qa/device/parity-gen.mjs`;
  - decide and note;
  - don't merge;
  - the commit trailer and the PR footer from the run prompt.
- **Known simulator flakes:**
  - Android: the emulator drops keystrokes, the app sometimes never starts ("capture-empty"), and a banner that leaves after 4 s is missed after a cold relaunch.
  - iOS: DeviceUnreachableException; the system "Open in FitBud Staging?" alert left up after a deep link (`device/z12-36/3-trainee-workout.yaml` ends by opening the gallery); the first cold load of trainer Attention taking over 30 s.

## 4. Decisions to record in the W12 report (Z12-60)

These are in addition to D-W12-1 to D-W12-35 in W12.md.

1. Dark mode is opt-in per screen until each screen's task migrates it. Z12-58 checks that none is left (Z12-36).
2. The harness patches the generated iOS `Info.plist` (`UIUserInterfaceStyle=Automatic`) on the runner only, so the gate can prove iOS dark mode before Z12-57.
3. A task waiting only on its device run holds no implementer slot.
4. The vitest setup fails on `console.error` only (D-W12-28); warnings are caught by the device-log scan.
5. Device screenshots reach agents through the git ref `refs/device-gate/<run id>` (#444), not an allowlist change.
6. D-W12-33: a temporary iOS shadow allow-list entry (#445). Z12-38 removes it.
7. Firoz's steering of 15 Nov is recorded as D-W12-34 and D-W12-35 (#446). The device-gate runs are named after the app ref (#452). The launch smoke flows and mixed tag/glob selection came in #447.
8. Z12-39 and Z12-41 started their non-UI work before Z12-36 merged; their UI waited for it.
9. Z12-50 was split into a server PR (#442) and a mobile and web PR (part 2). The push library change in `expo-push.ts`/`push-provider.ts` (`display`) was accepted outside `files_owned`. Inbox-only rows are marked delivered. Category reminder switches no longer gate nudges.
10. Z12-34 reused existing accounts for the new personas (no new accounts); its scope extras are listed in #439.
11. Z12-33's device flow edits outside its `files_owned` were accepted. The orchestrator fixed the #438 flows itself (an Attention wait that passed on the skeleton).
12. Z12-56 was held until Z12-36 merged, because both change `apps/mobile/package.json`. After the main merge, vitest 4 ran `dist/` copies of tests, so every package config excludes `**/dist/**`.
13. Z12-37 (web tokens):
    - Inter loads from the Google Fonts link, the same origin as the Devanagari font.
    - Legacy CSS variables are aliases of v3 tokens.
    - The primary button stays indigo (`--coach-ink`), not the kit's navy.
    - The contrast test extension in `packages/tokens` was not done (outside `files_owned`).
    - Every screen is graded CLOSE, because Inter is wider.
14. Z12-41 (sync):
    - It may edit `liveActivityOutbox.test.ts` (each change asserts no second push) and `ActiveWorkoutScreen.tsx` (`assignmentId` and `setTargetId` on workout mutations; that was the root cause of the offline-workout bug).
    - TR-19a is built as a screen with exported content for Z12-49, graded CLOSE.
    - TR-19b says "kept on this phone", because the server refuses a log on a superseded item; it was checked on web only.
    - Sent rows leave the outbox. On the server only an applied result is final.
    - Native storage is keychain chunks (Z12-57 replaces it with a database module).
    - An explicit sign-out drops unsent logs.
15. Z12-39 (future days):
    - Trainer log routes keep `BACKDATE_LIMIT`.
    - `sync.ts` is unchanged, and a stored FUTURE_DAY rejection stays final.
    - The progress-entry guard applies to trainees only.
    - There is no clock-skew allowance at midnight.
    - An open session is blocked after a stored-zone change.
    - `PlannedMealSheet` is handed to Z12-42.
    - The empty future day says "No meals planned".
16. **Orchestrator mistake:** the first Z12-39 device run was accepted as evidence before confirming its commit. A fresh review caught it, and it was re-run on the head. The lesson is the commit check in §3.
17. **Models:** listed in §1. Firoz moved Z12-60 to Opus at high effort on 17 Nov.

## 5. Follow-ups to list in the report

- **Harness:**
  - Overlay `apps/mobile/.maestro/common/**` from the workflow commit as well.
  - `RUN.txt` should record the commit SHA.
  - `common/sign-in-code.yaml` and `flows/auth/sign-in-code.yaml` still use the exact rest-day wait.
  - Retype on a sign-in error (the Android keystroke drop).
  - z12-36's workout flow ends on a deep link, which leaves the iOS alert up.
  - The runbook lacks the line on pruning old refs, and the hint about `refs/device-gate/<id>*` for re-runs.
  - Every device run's shots come only from `collect-shots`.
- **Sync (from the Z12-41 review):**
  - M1: a client timeout can lead to two concurrent deliveries of one row, so a log that landed can show "Couldn't send". Fix it with a client "possibly in flight" set, or have the server answer `already_applied` when the idempotency record shows a 200.
  - M2, owner Z12-57: `durableStore.flush` swallows a keychain write failure, so "Saved on phone" can show for a log held only in memory. Make the enqueue fail when its own flush fails.
  - L: `dropRefusedSession` doesn't clear the `/me` snapshot.
  - L, owner Z12-57: orphaned keychain chunks.
  - L: an expired session's unsent logs are dropped when another user signs in. Add it to Z12-58's checklist.
  - The server should accept a log on a superseded item as a deviation the coach sees (`routes/meals.ts`, core `canLog`).
  - `mealName` and `workoutName` on the outbox payload (Z12-42, Z12-45).
  - Diet offers "Eaten as planned" before a meal's window opens (Z12-42).
  - Today's sync button should use `useSyncView` (Z12-46).
- **Web (Z12-37):**
  - Legacy hex CSS outside its files: `side-panel.css`, `progress.css`, `client-checkins.css`, `legal.css`, `configure.css`, `client-settings.css`, `components/*.css`.
  - The Home and home-views avatar palette.
  - `SpecimensPage` still says "Satoshi 600".
  - `--white` surfaces would need `--card` if web dark is ever turned on.
  - In `packages/tokens/src/contrast.test.ts`, add white on `--coach-ink` and retire the stale "v2 semantic" block.
  - "Next check-in" has about 1 px to spare at 1024–1279 px.
- **Mobile:**
  - Today's preview time shows "12:00 am" from `windowStartsAt` (Z12-46).
  - Un-nest the WorkoutTab `OverflowMenu` and drop its console-gate allow-list entry (Z12-44/45).
  - Grant notification permission before the iOS lock-screen tap (Z12-47).
  - The first load of trainer Attention takes over 30 s on the CI iOS simulator (performance; Z12-53/Z12-58).
  - Android `primitives-3`/`primitives-4` screenshots are identical (Z12-36 evidence).
- **Other:**
  - drizzle-kit check fails with "journal.entries is not iterable".
  - Race on the nudge cap under concurrent nudges.
  - The second sentry test name overstates what it tests.
  - The FitText comment still mentions Satoshi, and unused Satoshi files remain.
  - `turbo.json` kit inputs.
  - Mobile tsconfig node types apply to the whole program (consider `tsconfig.test.json`).
  - `trainer-web` `LogEntry.test.tsx` flaked once.

## 6. Firoz's end-of-batch request (goes in the Z12-60 report)

After all W12 work, audit every remote branch. For each one, record whether it has an open PR, whether it's merged into main, its last commit date, and whether an open task references it. Mark each as needed or not needed, with a reason. Put the list in the W12 report as a section addressed to the **FitBud UI bot**, which reviews batch reports itself, saying:
- Firoz asked to check all branches, see which are in use, and delete the unused ones. The bot decides; agents never delete branches (AGENTS.md).
- Firoz asked for a branch naming rule for the future. The current names are inconsistent: `claude/<ID>-<slug>`, `grok/<batch>-specs`, `worktree-agent-*`, `claude/<random-words>`, `fix/…`. Propose a draft rule.

Don't message anyone else about it.

## 7. Timeline as of handover

About 21 tasks remain, plus Z12-58, 59 and 60. With the 38-hour weekly pause, the earlier estimate moves to about Fri 20 Nov, and later if another weekly limit hits. The binding constraint is the usage budget, not the order of the work.
