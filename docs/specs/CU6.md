---
id: CU6
title: Mobile component-render harness
batch: W3b
depends_on: [CU5]
lane: mobile
files_owned:
  - apps/mobile/package.json  # devDependencies only
  - pnpm-lock.yaml
  - apps/mobile/vitest.config.ts
  - apps/mobile/src/test/render.tsx  # new harness helper
  - apps/mobile/src/components/ErrorBanner.render.test.tsx  # new: first render test
frames: []
model: opus
size: M
---

## Outcome
Agents and CI can render a mobile component in a test and assert on its text and accessibility labels, so screen-level guards (AB3's restore wiring, QT9's screen guard) can be tested instead of reasoned about.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- `apps/mobile` has no render harness: `vitest.config.ts` runs `environment: "node"` over `src/**/*.test.ts` only.
- Expo SDK 52, `react-native` 0.76.9, React 18. Choose `@testing-library/react-native` (with its peer `react-test-renderer` at the React version pinned in the repo) unless it cannot run under vitest; then record the alternative in the PR. Pin versions with `npx expo install` where applicable.
- **Lockfile:** this is the only W3b task that changes `pnpm-lock.yaml` and dependencies (approved with the batch, D-W3b-2). Dev dependencies only, no native module, no new EAS build.

## Gap list
- `apps/mobile/vitest.config.ts`: no `.test.tsx`, no RN transform, no render environment.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `src/**/*.test.tsx` runs in `pnpm test` with a working RN render (mocks for native modules kept in `src/test/`).
- [ ] `ErrorBanner.render.test.tsx` renders `ErrorBanner` and asserts its message text and accessibility role/label.
- [ ] Existing `.test.ts` suites still run in `node` and take no noticeable extra time (report before/after durations).
- [ ] `src/test/render.tsx` documents how to render a screen with the auth context mocked.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Converting existing tests. Screen tests for AB3/QT9 (later tasks may use the harness). Any runtime dependency.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `ErrorBanner.render.test.tsx` as above; a trivial test proving a native-module mock works.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- No harness runs under vitest without a runtime dependency, a native change or a jest migration.
- The lockfile change pulls a new runtime dependency.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
