---
id: I4a
title: wrangler.toml env.staging and env.production with every binding
batch: W1
depends_on: [I7]
lane: infra
files_owned:
  - apps/api/wrangler.toml
frames: []
model: sonnet
size: S
---

## Outcome
`wrangler.toml` describes staging and production completely, so Firoz can deploy each env with `--env staging|production` and nothing falls back to local bindings.

## Context
- Wrangler does not inherit bindings into `[env.*]`; every binding is repeated (v14 I4a).
- Real resources (Cloudflare, checked 30 Oct 2026):
  - D1 staging `fitbud-staging`, id `1a82ab03-98e8-42e2-863a-11b0c159a468`; D1 production `fitbud-prod`, id `4fba80cf-18bd-48a0-aaaf-40c2bd9c6147`. Binding `DB`, `migrations_dir = "drizzle"`.
  - R2 staging `fitbud-media-nonprod`; R2 production `fitbud-media-prod`. Binding `MEDIA`.
  - Queues (created by Firoz in CF2): `fitbud-jobs-staging` + DLQ `fitbud-jobs-staging-dlq`; `fitbud-jobs-prod` + DLQ `fitbud-jobs-prod-dlq`. Producer binding `REMINDER_QUEUE`; consumer with the same `max_batch_size = 10`, `max_batch_timeout = 5`, `max_retries = 3` as local, plus `dead_letter_queue`.
  - DO binding `RELATIONSHIP_REALTIME` → class `RelationshipRealtimeRoom` in each env.
  - Crons `["*/5 * * * *"]` in each env.
- Worker names: `fitbud-api-staging` and `fitbud-api-production` (Wrangler's default `<name>-<env>`).
- Already on `main` (PR #76, D-W1-8 decided by Firoz 31 Oct 2026, option a): `apps/api/wrangler.toml:74-77` `[env.staging.vars]` and `:79-82` `[env.production.vars]` with `ENVIRONMENT`, `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY`. Keep those three lines in each block unchanged and add the rest below them.
- **gitleaks note:** gitleaks flags the two Firebase web API keys in `apps/api/wrangler.toml` (`[env.staging.vars]` and `[env.production.vars]`, added in PR #76) as `gcp-api-key`. They are public Firebase Web identifiers that ship to browsers (D-W1-8, Firoz, 31 Oct 2026). This finding is expected: do not remove or move the keys, and do not treat it as a stop condition.
- Per-env `[vars]` still to add (v14 I4a; Decision D-B10, Firoz 31 Oct 2026; D-W1-3):
  - staging: `AUTH_MODE = "firebase"`, `PUSH_PROVIDER_MODE = "expo"`, `EMAIL_PROVIDER = "zeptomail"`, `APP_HOST = "app-staging.thefitbud.com"`, `SESSION_COOKIE_NAME = "fitbud_session"`, `SUPPORT_EMAIL = "tech@thefitbud.com"`, `ADMIN_ALERT_EMAILS = "tech@thefitbud.com"`.
  - production: same, with `APP_HOST = "app.thefitbud.com"`.
  - `SYSTEM_EMAIL_FROM` / `SYSTEM_EMAIL_REPLY_TO` per env: **D-W1-9 (Open)**. Recommended `FitBud <no-reply@thefitbud.com>` with reply-to `tech@thefitbud.com`. Stop if still Open.
  - `MEDIA_PREFIX` is added by I4b, not here.
- `PUSH_PROVIDER_MODE = "expo"` and `EMAIL_PROVIDER = "zeptomail"` are values the code accepts only after X4a (W3) and I5 (W2). Until then a staging deploy would be refused by AU2's guard; that is intended: no staging deploy happens before I6 (W2→W3).
- **No secrets in toml:** `MEDIA_SIGNING_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ZEPTOMAIL_TOKEN`, `EXPO_ACCESS_TOKEN`, `SENTRY_DSN` are set by Firoz as Worker secrets. Do not copy the local `MEDIA_SIGNING_SECRET` value into an env block.
- The top-level (local/default) config stays byte-for-byte as it is after I7.

## Gap list
- `apps/api/wrangler.toml:1-67`: top-level local config (D1 `fitbud` with a placeholder id, R2 `fitbud-media`, queue `fitbud-jobs-dev`, `[vars]` for local).
- `apps/api/wrangler.toml:74-82`: env blocks hold only `[env.*.vars]` with 3 vars each (PR #76). No D1, R2, queue, DO or cron bindings for either env, and no `AUTH_MODE`, `PUSH_PROVIDER_MODE`, `EMAIL_PROVIDER`, `APP_HOST`, `SESSION_COOKIE_NAME`, `SUPPORT_EMAIL`, `ADMIN_ALERT_EMAILS` or `SYSTEM_EMAIL_*`.

## Acceptance criteria
- [ ] `[env.staging]` and `[env.production]` each define D1, R2, queue producer, queue consumer with `dead_letter_queue`, DO binding, `triggers.crons` and `vars`, with the exact names and ids in Context.
- [ ] No env block contains `MEDIA_SIGNING_SECRET` or any other secret value; `git grep -n "SECRET\|TOKEN\|PRIVATE" apps/api/wrangler.toml` shows only comments and the unchanged local `MEDIA_SIGNING_SECRET` line. The two `FIREBASE_WEB_API_KEY` lines are public and expected.
- [ ] The top-level config and the 3 vars per env from PR #76 are unchanged (diff shows only added lines).
- [ ] `wrangler deploy --dry-run --env staging --outdir <tmp>` and `--env production` both succeed locally (no upload).
- [ ] `pnpm --filter @fitbud/api dev` still runs the local env.

## Out of scope
- I7 (done before), I4b (`MEDIA_PREFIX`), I4c (scripts), OB1 (observability blocks, W2), WD1 (web Worker and routes, W2). No custom domains or `routes` here.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- None new; paste both dry-run outputs (trimmed of account ids) into the PR.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
