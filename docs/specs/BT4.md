---
id: BT4
title: D1 Time Travel restore runbook
batch: W3
depends_on: [I4a]
lane: ops-docs
files_owned:
  - docs/runbooks/d1-restore.md
frames: []
model: sonnet
size: S
---

## Outcome
`docs/runbooks/d1-restore.md` tells Firoz, step by step, how to restore a D1 database to an earlier point and check it.

## Context
- v14 BT4: all three D1 databases (`fitbud-dev`, `fitbud-staging`, `fitbud-prod`) are on the production storage backend, which supports Time Travel (30-day window on paid plans).
- Agents never run remote commands; the runbook is for Firoz, who rehearses it once on staging (manual step).

## Gap list
- No restore runbook in `docs/` (`docs/runbooks/` is created by WD1 in W2 with `trainer-web-deploy.md` only).

## Acceptance criteria
- [ ] Sections: when to restore; `wrangler d1 time-travel info <db> --env <env>`; choosing a timestamp or bookmark; `wrangler d1 time-travel restore <db> --env <env> --timestamp=…` (and `--bookmark`); note the bookmark printed for undo; verify with read-only `wrangler d1 execute … --command "SELECT count(*) …"`; redeploy only if a migration was undone.
- [ ] Says restore replaces the whole database and that writes after the timestamp are lost; production needs Firoz's go.
- [ ] A rehearsal log table (date, env, timestamp, result) for Firoz to fill.
- [ ] Commands use database and env names from `apps/api/wrangler.toml`; no secrets or account IDs.

## Out of scope
- R2 backup, automated backups, exports (post-beta).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Docs only: none. Run `pnpm lint` if markdown lint is configured.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- The task would need to run any command against a real database.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
