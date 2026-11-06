---
id: CU2
title: Fix the stale persist comment in the mobile token session
batch: W3b
depends_on: [CU1]
lane: mobile
files_owned:
  - apps/mobile/src/lib/api.ts  # comment only
frames: []
model: sonnet
size: S
---

## Outcome
Readers of `api.ts` see that the session is persisted on native too (SecureStore), so nobody "fixes" a no-op that is not one. **P0 in W3b** (cheap; misleads anyone touching auth).

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- D-W3-11 (AB3, #159): on Android and iOS the refresh token and minimal session metadata are stored with `expo-secure-store`.

## Gap list
- `apps/mobile/src/lib/api.ts:170`: `persist` documented as "(web: localStorage; native: no-op)", false since D-W3-11.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The comment names the real native store (SecureStore via `apps/mobile/src/lib/sessionStorage.ts`) and cites D-W3-11.
- [ ] Diff is comments only; `git diff -w` shows no code change.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Any behaviour change in `api.ts` or the session code.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- None (comment only).
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- The comment cannot be made true without a code change.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
