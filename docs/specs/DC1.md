---
id: DC1
title: Align Agents.md with CLAUDE.md as the source of truth
batch: W3
depends_on: []
lane: docs
files_owned:
  - Agents.md
frames: []
model: sonnet
size: S
---

## Outcome
`Agents.md` points to CLAUDE.md and the task spec as the source of truth and no longer tells agents to read wiki pages first.

## Context
- D-W2-10 (decided by Firoz, 31 Oct 2026) and v14 Rev 4: CLAUDE.md is the source of truth; Agents.md gets aligned.
- `Agents.md` lines 5-14 list wiki pages as sources of truth and say to stop on conflicts; CLAUDE.md "Source of truth for a task" (line 9) says the spec and CLAUDE.md win.

## Gap list
- `Agents.md` "Sources of truth" list (lines 7-14) and "Context loading rule" table rank wiki pages above the spec and CLAUDE.md.

## Acceptance criteria
- [ ] The sources list starts with: the task spec, then CLAUDE.md, then repository code and tests; wiki pages are "reference only".
- [ ] The context-loading table no longer requires wiki pages.
- [ ] Nothing else in `Agents.md` changes; no product rule changes.

## Out of scope
- CLAUDE.md (unchanged). Wiki pages.
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
