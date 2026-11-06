---
id: QT6
title: API smoke and contract tests against staging
batch: QA1
depends_on: [QT1, QT2]
lane: api-qa
files_owned:
  - apps/api/qa-smoke/**  # new: staging smoke specs and helpers
  - apps/api/vitest.staging.config.ts  # new, separate from vitest.config.ts
frames: []
model: sonnet
size: M
---

## Outcome
A vitest suite calls `https://api-staging.thefitbud.com` as the QA accounts and checks that auth, `/me`, the trainee day, plans, meals, check-ins and the trainer endpoints answer with the right status and a body that parses with the shared zod contracts in `packages/contracts`.

## Context
- Routes are mounted in `apps/api/src/index.ts:92-122` (`/auth`, `/me`, `/plans`, `/meals`, `/checkins`, `/clients`, `/exceptions`, `/coach-asks`, `/activity`, `/notifications`, …). Response envelopes are `{ data }` / `{ error: { code, message } }`. Use `@fitbud/api-client` where it covers the call (it already parses with contracts); raw `fetch` + the contract schema otherwise.
- **Coverage:** `POST /auth/otp/start` + `/auth/otp/verify` (QT1), `POST /auth/login` (password), `GET /auth/session`, `GET /me`, trainee `GET /me/day/<today>`, the trainee's current plan via `/plans`, a meal log round trip via `/meals` (then verify it shows in the day), check-in form fetch and submit via `/checkins`, trainer `GET /clients`, `GET /exceptions/attention`, `GET /checkins/inbox`, client status, `GET /activity/feed`, `GET /config`. **Negative contract checks:** a trainee calling a trainer endpoint → 403; no token → 401; reused OTP → 401 `OTP_INVALID`; a non-QA email cannot use the fixed code → 401.
- Writes only as QA accounts, only on data QT2's reset restores. Every write sends an `Idempotency-Key` where the route supports it.
- Base URL from `STAGING_API_URL` (default `https://api-staging.thefitbud.com`); a guard refuses any host other than `api-staging.thefitbud.com` or `127.0.0.1`/`localhost` so it can never hit production. Missing secrets → skip with a message.
- Reporter: `default` plus `junit` to `qa-results/api/junit.xml` and `json` to `qa-results/api/results.json`. Each test records latency; the summary (QT8) shows p50/p95.
- Run with `pnpm --filter @fitbud/api exec vitest run -c vitest.staging.config.ts` (no `package.json` change; W4 BT2 owns it). The default `vitest.config.ts` must not include `qa-smoke/**`.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- API tests run only on an in-memory D1 (`apps/api/src/**/*.test.ts`); nothing checks the deployed Worker, its secrets, D1 binding or Firebase project.

## Acceptance criteria
- [ ] Every endpoint listed has at least one test; each successful body is parsed with its contract schema.
- [ ] The host guard rejects `api.thefitbud.com` (unit test that runs without network).
- [ ] With no secrets, the suite skips cleanly; with the local API (`pnpm api` + `STAGING_API_URL=http://127.0.0.1:8787` and the QA seed applied locally) the read-only subset passes, shown in the PR.
- [ ] `pnpm test` does not run `qa-smoke/**`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Load testing. Production. Push delivery. Changing any route.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/qa-smoke/*.smoke.test.ts` per area (auth, me, trainee-day, plans, meals, checkins, trainer, negative), `apps/api/qa-smoke/host-guard.test.ts`.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `vitest run -c vitest.staging.config.ts` against local.

## Visual check
- Non-UI: n/a.

## Stop conditions
- A contract schema does not match the live response on `main` (report it as a bug with the diff; do not loosen the schema).
- `typecheck` does not cover `qa-smoke/**` without editing `apps/api/tsconfig.json` (outside `files_owned`): stop.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
