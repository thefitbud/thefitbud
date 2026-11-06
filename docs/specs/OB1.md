---
id: OB1
title: Workers Logs on for staging and production
batch: W2
depends_on: [WD1, I4a]
lane: infra
files_owned:
  - apps/api/wrangler.toml  # [env.*.observability] blocks only
  - apps/trainer-web/wrangler.toml  # [env.*.observability] blocks only
frames: []
model: sonnet
size: S
---

## Outcome
Workers Logs are enabled for the API and web Workers: staging logs every request, production samples 20%.

## Context
- D-W2-4 (decided): staging `head_sampling_rate = 1`, production `head_sampling_rate = 0.2`.
- `[observability]` is not inherited by env blocks, so it must sit inside each `[env.<name>]`.
- I4a (W1) owns the env blocks; WD1 (just before in this lane) adds routes and creates `apps/trainer-web/wrangler.toml`. Merge after both.

## Gap list
- `apps/api/wrangler.toml`: no `[env.staging.observability]` or `[env.production.observability]`.
- `apps/trainer-web/wrangler.toml` (created by WD1): no observability blocks.

## Acceptance criteria
- [ ] Both files have `[env.staging.observability] enabled = true, head_sampling_rate = 1` and `[env.production.observability] enabled = true, head_sampling_rate = 0.2`.
- [ ] No other line changes; `wrangler deploy --dry-run --env staging|production --outdir <tmp>` passes for both Workers.

## Out of scope
- Log content (OB2). Logpush, alerts and dashboards (post-beta OB3/OB4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- None new. Paste both dry-run outputs in the PR.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
