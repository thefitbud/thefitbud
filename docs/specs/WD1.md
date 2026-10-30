---
id: WD1
title: Trainer web hosted on a Cloudflare Worker with a service binding to the API
batch: W2
depends_on: [I4c]
lane: infra
files_owned:
  - apps/trainer-web/wrangler.toml
  - apps/trainer-web/worker/index.ts
  - apps/trainer-web/worker/index.test.ts
  - apps/trainer-web/worker/tsconfig.json
  - apps/trainer-web/package.json  # deploy scripts and wrangler devDependency
  - apps/api/wrangler.toml  # routes / custom domains only
  - pnpm-lock.yaml  # shared with LA1 under the W2.md lockfile rule
  - docs/runbooks/trainer-web-deploy.md
frames: []
model: opus
size: M
---

## Outcome
The trainer web app builds into a Worker with static assets that serves the SPA on `app-staging.thefitbud.com` / `app.thefitbud.com` and forwards `/api/*` to the API Worker through a service binding on the same origin, ready for Firoz to deploy.

## Context
- D-W2-2 (decided): one web Worker with static assets and SPA fallback; `/api/*` goes to the API Worker by service binding with the `/api` prefix stripped (matching `apps/trainer-web/vite.config.ts`); web on `app-staging.thefitbud.com` / `app.thefitbud.com`, API on `api-staging.thefitbud.com` / `api.thefitbud.com`. Same origin keeps the `SameSite=Lax` session cookie (`apps/api/src/routes/auth.ts:127-130`) working.
- Realtime uses `/api/realtime` as a WebSocket (`packages/api-client/src/index.ts:2180-2192`); the forward must pass the upgrade through unchanged.
- Invite links: `apps/api/src/lib/public-app-url.ts:17-22` builds `https://<APP_HOST>/i/<token>`, and APP_HOST is the web host (I4a). The page is served by the API (`apps/api/src/routes/invite-landing.ts:26`, mounted at `apps/api/src/index.ts:90`). Whether the web Worker forwards `/i/*` unchanged or the links point at the API host is **D-W2-11, Open**. This task stops on that point until W2.md closes it.
- The domain name for the web app is **D-W2-7, Open** (`coach.` vs `app.`). The spec uses `app.` because I4a already wrote `APP_HOST = app…`; if D-W2-7 changes it, only route strings change.
- I4c (W1) adds the API deploy scripts; follow the same naming (`deploy:staging`, `deploy:production`) and never run them. OB1 follows in this lane and owns the `[observability]` blocks in `apps/api/wrangler.toml`.

## Gap list
- `apps/trainer-web/package.json`: no `wrangler` devDependency and no deploy script; no `apps/trainer-web/wrangler.toml`.
- `apps/trainer-web/vite.config.ts`: `/api` proxy (strip prefix) exists only for local dev.
- `apps/api/wrangler.toml`: no `routes` / custom domains for `api-staging.thefitbud.com` or `api.thefitbud.com`.
- No Worker entry that forwards `/api/*` (and WebSocket upgrades) to the API.

## Acceptance criteria
- [ ] `apps/trainer-web/wrangler.toml` with `assets = { directory = "./dist", not_found_handling = "single-page-application", binding = "ASSETS" }`, `main = "worker/index.ts"`, `[env.staging]` and `[env.production]` each with a custom domain route for the web host and `[[services]] binding = "API"` pointing at the API Worker for that env.
- [ ] `worker/index.ts` sends `/api/*` to `env.API.fetch` with the prefix stripped, keeping method, headers (including `Cookie`, `Authorization`, `Upgrade`), body and query; everything else goes to `env.ASSETS`.
- [ ] `apps/api/wrangler.toml` adds custom domain routes for the API host per env; nothing else in that file changes.
- [ ] `package.json` adds `wrangler` (same major as `apps/api`) and `deploy:staging` / `deploy:production` scripts that build then deploy with `--env`.
- [ ] `wrangler deploy --dry-run --env staging --outdir <tmp>` succeeds for both Workers (no upload).
- [ ] `docs/runbooks/trainer-web-deploy.md` lists Firoz's steps: DNS for the four hosts in Cloudflare, deploy order (API first), and a smoke test (sign in, open a client, realtime connects).

## Out of scope
- Deploying (Firoz, I6). `/i/*` handling while D-W2-11 is Open. Mobile links to the web app (D-W2-7 follow-up). Observability (OB1).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/worker/index.test.ts` (new): `/api/me` reaches the fake `API` binding as `/me` with cookie and auth headers; WebSocket upgrade header passes through; `/clients/123` reaches `ASSETS`.
- Dry-run output pasted in the PR.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (hosting only; the SPA is unchanged).

## Stop conditions
- D-W2-11 (`/i/*` forwarding) or D-W2-7 (web domain) is still **Open** when the task reaches the route or forwarding code.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
