---
id: BT2
title: Worker crash reporting with Sentry
batch: W4
depends_on: [OB2]
lane: api-ops
files_owned:
  - apps/api/package.json
  - apps/api/src/lib/sentry.ts
  - apps/api/src/lib/sentry.test.ts
  - apps/api/src/index.ts  # export wrapper only
  - apps/api/src/types.ts  # SENTRY_DSN, SENTRY_ENVIRONMENT only
  - apps/api/wrangler.toml  # SENTRY_ENVIRONMENT var per env only
  - pnpm-lock.yaml  # shared with BT2b under the W4.md lockfile rule
frames: []
model: sonnet
size: S
---

## Outcome
On staging and production, unhandled errors in the API Worker's fetch, scheduled and queue handlers reach Sentry with release and environment tags, and no personal or health data leaves the Worker.

## Context
- v14 BT2 (Worker half; the mobile half is BT2b because backend and UI never share a spec). D-W4-1: Sentry, staging and production only.
- `@sentry/cloudflare` with `withSentry` around the exported handler (`apps/api/src/index.ts:278-322`); `nodejs_compat` is already on (`apps/api/wrangler.toml:15`).
- DSN storage: D-W4-5 (decided by Firoz, 1 Nov 2026): Worker secret `SENTRY_DSN` per env (as in v14 CF2 step 8), not a toml var. With no DSN set (local, tests) Sentry is off.
- Tracing: D-W4-6 (decided by Firoz, 1 Nov 2026): errors only (`tracesSampleRate: 0`).
- After OB2 (W2), which owns logging in `index.ts`.

## Gap list
- No Sentry package or init in `apps/api` (`apps/api/package.json`, `apps/api/src/index.ts:278-322`).
- `apps/api/src/types.ts`: no `SENTRY_DSN` / `SENTRY_ENVIRONMENT` in `Env`.

## Acceptance criteria
- [ ] `withSentry` wraps fetch, scheduled and queue; enabled only when `SENTRY_DSN` is set and `SENTRY_ENVIRONMENT` is `staging` or `production`.
- [ ] `beforeSend` in `lib/sentry.ts` drops request bodies, cookies, `Authorization` and query strings, and removes emails, names, notes and any health fields from `extra`/`contexts`; `sendDefaultPii: false`.
- [ ] `release` = the deploy's git SHA passed by the deploy script var if present, else unset; `environment` from `SENTRY_ENVIRONMENT`.
- [ ] Handled errors (4xx, `fail()` responses) are not reported.
- [ ] Local and tests never call Sentry.

## Out of scope
- Mobile (BT2b). Source-map upload for the Worker (post-beta). Alerts and dashboards (Firoz, manual).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/lib/sentry.test.ts` (new): scrubber removes each sensitive field; no DSN → disabled; `development` env → disabled.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. Firoz sends one test error on staging (BT5 step 7).

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W4.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
