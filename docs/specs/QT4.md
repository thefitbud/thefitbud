---
id: QT4
title: Global crash guard: lint rule for native accessibilityRole and a Maestro no-crash assertion
batch: QA1
depends_on: []
lane: mobile-guard
files_owned:
  - apps/mobile/eslint-rules/no-invalid-accessibility-role.mjs  # new
  - apps/mobile/eslint-rules/no-invalid-accessibility-role.test.mjs  # new
  - apps/mobile/eslint.config.mjs
  - apps/mobile/.maestro/common/assert-no-crash.yaml  # new subflow
frames: []
model: sonnet
size: S
---

## Outcome
A web-only accessibility role can never again crash the Android app unnoticed: `pnpm lint` fails on any `accessibilityRole` value outside the React Native Android set, and every Maestro flow (QT3) calls one shared subflow that fails if the red box, the "There was a problem loading the project" screen or the app's error screen appears.

## Context
- **AB2 (#146, merged 2 Nov)** fixed `apps/mobile/src/components/Screen.tsx` (`accessibilityRole="main"` → `role="main"`) and added `apps/mobile/src/components/accessibilityRole.test.ts`, a vitest scan of `apps/mobile/src/**/*.tsx` and `packages/ui-mobile/src/**/*.tsx` against the 39 Android roles (the list is in that test, citing `ReactAccessibilityDelegate.java`). **Reuse that list**: import it, or move it to a shared constant only if that needs no file outside `files_owned`; otherwise duplicate it with a comment pointing at the AB2 test as the source of truth and a test asserting the two lists are equal.
- Why a lint rule as well: the AB2 test only runs in `pnpm test`; the lint rule shows the error in the editor and in the `ci` lint step, and catches values in new files the scan's globs might miss (e.g. `apps/mobile/modules/**`). The rule reports: a literal or template-literal value outside the set; any `as` cast on an `accessibilityRole` value; a conditional whose branches include an invalid literal. Expressions it cannot resolve are allowed.
- **Maestro subflow:** `assert-no-crash.yaml` asserts not visible: `There was a problem loading the project`, `Invalid accessibility role value`, `Render Error`, `Error while updating property`, `Unable to load script`, the Expo dev-client error header `Something went wrong`, and the app's own error boundary copy (re-check the exact strings in `apps/mobile/src` before writing them). It also takes no screenshot; QT3 calls it after every screenshot step.
- Note: a release-style (preview) build has no red box, so the subflow also asserts the app process is still in front (`assertVisible` of a caller-supplied anchor is QT3's job).
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `apps/mobile/eslint.config.mjs`: only the shared base config; nothing checks roles.
- No Maestro directory exists anywhere in the repo.

## Acceptance criteria
- [ ] With the rule on, `pnpm --filter @fitbud/mobile lint` passes on `main`.
- [ ] Re-introducing `accessibilityRole={"main" as "summary"}` (AB2's bug at e145572) makes lint fail with a message naming the value and the file; show the red and green runs in the PR.
- [ ] The rule's own tests (ESLint `RuleTester`, run by vitest) cover: valid literal, invalid literal, `as` cast, conditional with one invalid branch, unresolvable expression allowed.
- [ ] The rule's role list equals AB2's list (asserted).
- [ ] `assert-no-crash.yaml` is valid Maestro syntax (`maestro check-syntax` if available, else a YAML parse test) and documents its inputs at the top.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Fixing any other role (AB2's audit found none). iOS. Running Maestro (QT3, QT7).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/eslint-rules/no-invalid-accessibility-role.test.mjs` as above (include it in the mobile vitest run without editing `apps/mobile/vitest.config.ts`; if that is impossible, stop).
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: n/a.

## Stop conditions
- The flat config in `@fitbud/config` cannot take a local plugin without changing `packages/config/**`.
- The lint rule finds an invalid value on `main` in a file outside `files_owned`: report it, do not fix.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
