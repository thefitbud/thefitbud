# W14 prompts

One self-contained prompt per task. Paste one into a fresh Claude Code session at the repo root (or say "start batch W14 task N"). Each session does one task end to end and never waits for a person (D-W14-4).

Start order: see `W14.md` → Order (Firoz list 2 tasks Z14-17…Z14-24 are in item 4; Z14-22…Z14-24 also wait for the trainer mocks, D-W14-28). Z14-2 may start before Z14-5 merges (it merges after). Any other task whose dependencies have not merged stops at step 2 and records that in the Report.

## Z14-1: API latency: Needs you off the read path, one-query auth, batched hot paths, in-process sync dispatch
Model: **opus** · Size: L · Depends on: none

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-1, "API latency: Needs you off the read path, one-query auth, batched hot paths, in-process sync dispatch", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-1.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-1-report, open a PR titled "Z14-1: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-1-api-latency from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-1/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-1/.
7. Push and open a PR titled "Z14-1: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-1.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-2: Trainee offline-first reads, non-blocking logs, outbox overlay, neutral offline, one Today skeleton
Model: **opus** · Size: L · Depends on: Z14-5 (persistence step only)

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-2, "Trainee offline-first reads, non-blocking logs, outbox overlay, neutral offline, one Today skeleton", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-2.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Z14-5 is needed only for the persistence step: start now, build everything else, and merge only after Z14-5 has merged (merge main into your branch first).
3. Branch: git checkout -b claude/Z14-2-trainee-offline-first from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-2/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-2/.
7. Push and open a PR titled "Z14-2: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-2.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-3: Trainer app instant paint: kept tabs, cached snapshots, one-round client page, parallel cold start
Model: **sonnet** · Size: L (was M; review and detail screens added 24 Nov 2026) · Depends on: none

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-3, "Trainer app instant paint: kept tabs, cached snapshots, one-round client page, parallel cold start", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-3.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-3-report, open a PR titled "Z14-3: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-3-trainer-instant-paint from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-3/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-3/.
7. Push and open a PR titled "Z14-3: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-3.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-4: API hygiene and push delivery: PRAGMA optimize, notifications index, cleanup job, Smart Placement, channelId and priority
Model: **sonnet** · Size: M · Depends on: none

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-4, "API hygiene and push delivery: PRAGMA optimize, notifications index, cleanup job, Smart Placement, channelId and priority", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-4.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-4-report, open a PR titled "Z14-4: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-4-api-hygiene-push from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-4/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-4/.
7. Push and open a PR titled "Z14-4: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-4.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-5: Native bundle: expo-sqlite store, image picker, date picker, Live Activity intent, Android live notification
Model: **opus** · Size: M · Depends on: none

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-5, "Native bundle: expo-sqlite store, image picker, date picker, Live Activity intent, Android live notification", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-5.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-5-report, open a PR titled "Z14-5: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-5-native-bundle from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-5/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-5/.
7. Push and open a PR titled "Z14-5: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-5.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-6: Notifications on the phone: foreground handler, live permission state, token re-registration, high-importance channels
Model: **sonnet** · Size: M · Depends on: Z14-4

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-6, "Notifications on the phone: foreground handler, live permission state, token re-registration, high-importance channels", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-6.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-4) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-6-report, open a PR titled "Z14-6: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-6-phone-notifications from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-6/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-6/.
7. Push and open a PR titled "Z14-6: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-6.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-7: Workout writes are idempotent and atomic on the server
Model: **opus** · Size: M · Depends on: Z14-1

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-7, "Workout writes are idempotent and atomic on the server", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-7.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-1) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-7-report, open a PR titled "Z14-7: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-7-workout-writes-idempotent from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-7/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-7/.
7. Push and open a PR titled "Z14-7: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-7.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-8: Workout logging can't double-save; lock-screen logs land in the right workout
Model: **opus** · Size: M · Depends on: Z14-7, Z14-5, Z14-2

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-8, "Workout logging can't double-save; lock-screen logs land in the right workout", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-8.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-7, Z14-5, Z14-2) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-8-report, open a PR titled "Z14-8: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-8-workout-double-save from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-8/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-8/.
7. Push and open a PR titled "Z14-8: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-8.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-9: Progress chart, weight keypad, bell dot, Android selection colour, DOB picker
Model: **sonnet** · Size: M · Depends on: Z14-5

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-9, "Progress chart, weight keypad, bell dot, Android selection colour, DOB picker", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-9.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-5) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-9-report, open a PR titled "Z14-9: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-9-progress-polish from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-9/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-9/.
7. Push and open a PR titled "Z14-9: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-9.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-10: Mocks: workout summary with RPE, time-zone list, assigned diet plan, something-different states
Model: **opus** · Size: M · Depends on: none

**Done, do not run:** FitBud UI drew the mocks on 24 Nov 2026 (`docs/design/mockups/z14-10/`, PR #528) and Firoz approved them the same day (D-W14-14). Kept for the record.

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-10, "Mocks: workout summary with RPE, time-zone list, assigned diet plan, something-different states", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-10.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-10-report, open a PR titled "Z14-10: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-10-w14-mocks from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-10/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-10/.
7. Push and open a PR titled "Z14-10: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-10.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-11: API: trainee sets RPE and note after finishing, attaches a meal photo, and edits or removes a logged meal for 24 hours (trainer notified)
Model: **sonnet** · Size: L (was M) · Depends on: Z14-7, Z14-20 (shared packages/api-client)

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-11, "API: trainee sets RPE and note after finishing, attaches a meal photo, and edits or removes a logged meal for 24 hours (trainer notified)", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-11.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-7, Z14-20) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-11-report, open a PR titled "Z14-11: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-11-rpe-meal-photo-api from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-11/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-11/.
7. Push and open a PR titled "Z14-11: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-11.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-12: Workout summary: RPE after finishing, read-only View summary, rating and note editable for 48 h
Model: **sonnet** · Size: M · Depends on: D-W14-14, Z14-8, Z14-11

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-12, "Workout summary: RPE after finishing, read-only View summary, rating and note editable for 48 h", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-12.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-14, Z14-8, Z14-11) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-12-report, open a PR titled "Z14-12: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-14. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-14)" on a branch `claude/Z14-12-report`, open a PR titled `Z14-12: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-12-workout-summary-rpe from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-12/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-12/.
7. Push and open a PR titled "Z14-12: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-12.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-13: Diet: clean meal actions, no 'not available' flash, working portion and ate-out screens, real meal photos, bell dot
Model: **sonnet** · Size: L · Depends on: D-W14-14, Z14-2, Z14-5, Z14-11

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-13, "Diet: clean meal actions, no 'not available' flash, working portion and ate-out screens, real meal photos, bell dot", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-13.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-14, Z14-2, Z14-5, Z14-11) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-13-report, open a PR titled "Z14-13: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-14. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-14)" on a branch `claude/Z14-13-report`, open a PR titled `Z14-13: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-13-diet-logging from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-13/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-13/.
7. Push and open a PR titled "Z14-13: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-13.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```
## Z14-13b: Diet: the trainee edits or removes a logged entry for 24 hours
Model: **sonnet** · Size: M · Depends on: D-W14-14, Z14-13, Z14-11, Z14-12

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-13b, "Diet: the trainee edits or removes a logged entry for 24 hours", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-13b.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-14, Z14-13, Z14-11, Z14-12) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-13b-report, open a PR titled "Z14-13b: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-14. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-14)" on a branch `claude/Z14-13b-report`, open a PR titled `Z14-13b: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-13b-diet-edit-24h from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-13b/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-13b/.
7. Push and open a PR titled "Z14-13b: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-13b.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-14: Time zone list and the assigned diet plan screen
Model: **sonnet** · Size: M · Depends on: D-W14-14

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-14, "Time zone list and the assigned diet plan screen", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-14.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-14) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-14-report, open a PR titled "Z14-14: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-14. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-14)" on a branch `claude/Z14-14-report`, open a PR titled `Z14-14: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-14-timezone-assigned-plan from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-14/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-14/.
7. Push and open a PR titled "Z14-14: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-14.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-16: Trainer sees an 'Edited'/'Removed' marker on client meal entries and is notified (copy, tap opens the diet day, settings toggle)
Model: **sonnet** · Size: M (was S) · Depends on: D-W14-14, Z14-11, Z14-3, Z14-6, Z14-19

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-16, "Trainer sees an 'Edited'/'Removed' marker on client meal entries and is notified (copy, tap opens the diet day, settings toggle)", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-16.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-14, Z14-11, Z14-3, Z14-6, Z14-19) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-16-report, open a PR titled "Z14-16: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-16-trainer-edited-marker from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-16/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-16/.
7. Push and open a PR titled "Z14-16: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-16.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```
## Z14-17: Mocks: trainer Attention sections and jump pills, review panel, client profile, note sheet
Model: **opus** · Size: M · Depends on: none

**Done by FitBud UI, do not run in Claude Code:** FitBud UI draws these mocks on the resequence branch (`docs/design/mockups/z14-17/`) and records Firoz's answer as D-W14-28 in `W14.md`. Kept so the batch has one prompt per task.

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-17, "Mocks: trainer Attention sections and jump pills, review panel, client profile, note sheet", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-17.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (none) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-17-report, open a PR titled "Z14-17: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-17-trainer-mocks from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-17/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-17/.
7. Push and open a PR titled "Z14-17: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-17.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-18: Trainer app: Android back goes to the previous screen on every trainer screen and sheet
Model: **sonnet** · Size: M · Depends on: Z14-3

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-18, "Trainer app: Android back goes to the previous screen on every trainer screen and sheet", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-18.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-3) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-18-report, open a PR titled "Z14-18: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-18-trainer-android-back from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-18/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-18/.
7. Push and open a PR titled "Z14-18: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-18.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-19: Trainer app: tapping a client's picture or name opens their profile
Model: **sonnet** · Size: S · Depends on: Z14-18

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-19, "Trainer app: tapping a client's picture or name opens their profile", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-19.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-18) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-19-report, open a PR titled "Z14-19: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-19-client-avatar-profile from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-19/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-19/.
7. Push and open a PR titled "Z14-19: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-19.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-20: API: cursor pages for the check-in inbox, coach notes and coach asks (additive)
Model: **sonnet** · Size: S · Depends on: Z14-1

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-20, "API: cursor pages for the check-in inbox, coach notes and coach asks (additive)", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-20.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-1) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-20-report, open a PR titled "Z14-20: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-20-trainer-list-paging-api from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-20/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-20/.
7. Push and open a PR titled "Z14-20: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-20.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-21: Trainer app: Clients, Activity and Check-ins load more as you scroll
Model: **sonnet** · Size: M · Depends on: Z14-3, Z14-19, Z14-20

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-21, "Trainer app: Clients, Activity and Check-ins load more as you scroll", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-21.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-3, Z14-19, Z14-20) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-21-report, open a PR titled "Z14-21: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-21-trainer-infinite-lists from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-21/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-21/.
7. Push and open a PR titled "Z14-21: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-21.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-22: Attention: jump pills, capped sections with See all, collapsible headers, aligned rows
Model: **sonnet** · Size: M · Depends on: D-W14-28, Z14-3, Z14-19, Z14-21

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-22, "Attention: jump pills, capped sections with See all, collapsible headers, aligned rows", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-22.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-28, Z14-3, Z14-19, Z14-21) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-22-report, open a PR titled "Z14-22: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-28. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-28)" on a branch `claude/Z14-22-report`, open a PR titled `Z14-22: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-22-attention-sections from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-22/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-22/.
7. Push and open a PR titled "Z14-22: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-22.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-23: Review panel: clear actions (Remind, Seen keep open, Resolve), one way to move, no ⋯ menu, same review from the profile
Model: **sonnet** · Size: M · Depends on: D-W14-28, Z14-19, Z14-22

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-23, "Review panel: clear actions (Remind, Seen keep open, Resolve), one way to move, no ⋯ menu, same review from the profile", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-23.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-28, Z14-19, Z14-22) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-23-report, open a PR titled "Z14-23: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-28. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-28)" on a branch `claude/Z14-23-report`, open a PR titled `Z14-23: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-23-review-panel from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-23/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-23/.
7. Push and open a PR titled "Z14-23: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-23.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-24: Client profile: loading in place, refreshed layout, one note sheet that closes, clear note visibility, deduped ⋯ menu, See all notes
Model: **sonnet** · Size: M · Depends on: D-W14-28, Z14-3, Z14-18, Z14-20, Z14-21

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-24, "Client profile: loading in place, refreshed layout, one note sheet that closes, clear note visibility, deduped ⋯ menu, See all notes", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..29 apply), docs/specs/Z14-24.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (D-W14-28, Z14-3, Z14-18, Z14-20, Z14-21) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-24-report, open a PR titled "Z14-24: report blocked on dependencies", merge it per the merge rules, and end.
- **Mock gate:** open `docs/specs/batches/W14.md` and read D-W14-28. If it does not read "Approved by Firoz, <date>", stop now: append a Report row "blocked on mock approval (D-W14-28)" on a branch `claude/Z14-24-report`, open a PR titled `Z14-24: report blocked on mocks`, merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-24-client-profile-notes from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-24/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-24/.
7. Push and open a PR titled "Z14-24: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-24.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```

## Z14-15: Wording and error-code audit: Nudge becomes Remind, no codes on screen, errors that say what went wrong
Model: **sonnet** · Size: M · Depends on: Z14-1, Z14-2, Z14-3, Z14-4, Z14-5, Z14-6, Z14-7, Z14-8, Z14-9, Z14-10, Z14-11, Z14-12, Z14-13, Z14-13b, Z14-14, Z14-16, Z14-18, Z14-19, Z14-20, Z14-21, Z14-22, Z14-23, Z14-24

```text
You are working in the GitHub repo thefitbud/thefitbud (local checkout at the repo root). Task: Z14-15, "Wording and error-code audit: Nudge becomes Remind, no codes on screen, errors that say what went wrong", batch W14.

1. Read, in order: AGENTS.md, CLAUDE.md, docs/specs/README.md, docs/specs/batches/W14.md (all decisions D-W14-1..23 apply), docs/specs/Z14-15.md (your spec: outcome, files you own, acceptance, tests, visual, device run, stop conditions, merge), and the matching sections of docs/specs/batches/W14-diagnosis.md.
2. git fetch origin && git checkout main && git pull. Check that every task in depends_on (Z14-1, Z14-2, Z14-3, Z14-4, Z14-5, Z14-6, Z14-7, Z14-8, Z14-9, Z14-10, Z14-11, Z14-12, Z14-13, Z14-13b, Z14-14, Z14-16, Z14-18, Z14-19, Z14-20, Z14-21, Z14-22, Z14-23, Z14-24) has merged to main (gh pr list --state merged --search "Z14- in:title" --limit 50; count only PRs titled "Z14-<n>: …" merged on or after 24 Nov 2026, since before that date Z14-* meant the old Phase 10 IDs, now Z16-*). If one has not, do not start: append a Report row to W14.md saying which dependency was missing, push it on branch claude/Z14-15-report, open a PR titled "Z14-15: report blocked on dependencies", merge it per the merge rules, and end.
3. Branch: git checkout -b claude/Z14-15-wording-audit from the latest main. Change only the files listed under files_owned in the spec (plus tests and docs/qa/Z14-15/). If you must touch another task's file, stop and follow the spec's stop conditions.
4. Build every acceptance item in the spec. Where the spec leaves a choice, decide, keep going, and write the choice and why in the PR body and in your Report row (decide and note; never wait for a person, never ask a question and pause).
5. Standing rules: every error the user can see is friendly, says what actually went wrong and what to do next, and never shows an error code (codes stay in logs). No secrets, tokens or keys in code, docs, logs or PR text. Never run deploy, migrate-remote, EAS build/submit, or any command that changes staging or production; list those as steps for Firoz in the Report instead.
6. Run pnpm lint, pnpm typecheck and pnpm test (and the package-level tests the spec names) until green. For mobile tasks, do the scoped device run from the spec: gh workflow run device.yml with flows=launch plus only the flows the spec lists (only the changed screens plus the launch smoke test), and attach the captures under docs/qa/Z14-15/.
7. Push and open a PR titled "Z14-15: <one-line summary>" against main. Body: what changed, how each acceptance item is met, decide-and-note choices, test and device-run evidence, follow-ups.
8. Required checks: ci, e2e and banned-strings must be green. Wait for them; if one fails, fix and push again. Never cancel a GitHub Actions run, never merge with --admin, never skip hooks.
9. Review: start a fresh reviewer session (Opus, no shared context) with the spec and the PR diff; fix every blocking finding, then at most one fix round; if it still fails, stop per the spec's stop conditions and record why in the Report.
10. Merge with a merge commit (never squash or rebase-merge), bottom-up if stacked; you have standing authorization to merge your own PR once checks are green and review passes. Delete the branch after merge.
11. Append your row to the Report table in docs/specs/batches/W14.md (task, PR, merged SHA, model used, decide-and-note choices, device run link, notes including any Firoz steps) in the same PR or a small follow-up PR merged the same way.

Done when: every acceptance box in docs/specs/Z14-15.md is met, the PR is merged with ci, e2e and banned-strings green and a passing fresh review, and the Report row is in W14.md.
```
