---
id: DC1
title: Confirm AGENTS.md ranks the task spec first
batch: W3
depends_on: []
lane: docs
files_owned:
  - AGENTS.md
frames: []
model: sonnet
size: S
---

## Outcome
`AGENTS.md` ranks the task spec and its batch decisions first and treats the wiki as reference only. If `main` already says so, the task closes with no change.

## Context
- D-W2-10 (decided by Firoz, 31 Oct 2026). File changed to `AGENTS.md` (decided by Firoz, 1 Nov 2026): `Agents.md` was renamed on `main` by DOC1, which made `AGENTS.md` the one rulebook and `CLAUDE.md` a pointer to it.
- On `main` today the "Source of truth" list starts with the task spec (`AGENTS.md:19`) and says the wiki is reference only (`AGENTS.md:25`), so the original gap looks closed.

## Gap list
- None known on `main`. Check the rest of `AGENTS.md` for any line that still ranks the wiki above the spec.

## Acceptance criteria
- [ ] Either a PR that removes any remaining line ranking the wiki above the spec, or a note in the batch report: "DC1: no gap on main, closed with no change".
- [ ] No product rule changes.

## Out of scope
- CLAUDE.md. Wiki pages.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Docs only: none.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
