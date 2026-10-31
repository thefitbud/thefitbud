# Trainer web and API deploy (Firoz)

How to put the API and the trainer web on their real domains (task WD1; decisions D-W2-2, D-W2-7, D-W2-11). Staging first (I6), production later (I6b) with `production` in place of `staging`. Only Firoz runs these commands; agents only run `--dry-run`.

| Host | Worker | Serves |
|---|---|---|
| `api-staging.thefitbud.com` | `fitbud-api-staging` | the API (D1, R2, queues, realtime) |
| `app-staging.thefitbud.com` | `fitbud-web-staging` | trainer web; `/api/*` and `/i/*` go to `fitbud-api-staging` |
| `api.thefitbud.com` | `fitbud-api-production` | the API |
| `app.thefitbud.com` | `fitbud-web-production` | trainer web; `/api/*` and `/i/*` go to `fitbud-api-production` |

`thefitbud.com` itself (landing page and sign-in redirect) is not part of this runbook.

How the web Worker works (`apps/trainer-web/worker/index.ts`, `apps/trainer-web/wrangler.toml`):
- Static files from `apps/trainer-web/dist`; any unknown path gets `index.html` (the SPA handles the route).
- `/api/<path>` is sent to the API Worker as `/<path>` through the `API` service binding, with method, headers, cookies, body, query and WebSocket upgrades unchanged. Trainer web and API share the origin, so there is no CORS and the session cookie is first-party.
- `/i/<token>` (invite links, built from `APP_HOST`) is sent to the API with the path unchanged.

## Before you start

- `docs/runbooks/staging-setup.md` steps 1–6 are done for the env (accounts, Cloudflare resources, Firebase, secrets).
- You are signed in to wrangler on the FitBud account: `cd apps/api && pnpm exec wrangler whoami`.
- `main` is checked out and up to date, then `pnpm install && pnpm build:packages`.

## 1. DNS for the four hosts

The hosts are Workers **custom domains** (`custom_domain = true` in both `wrangler.toml` files). The deploy creates each host's DNS record and certificate in the `thefitbud.com` zone; you do not add A or CNAME records yourself.

- [ ] Cloudflare dashboard → `thefitbud.com` → DNS → Records: make sure there is **no** existing record named `api-staging`, `app-staging`, `api` or `app`. If one exists, delete it first, or the deploy fails with a "hostname already has a record" error. Leave the Zoho and ZeptoMail mail records alone.
- [ ] After step 2 below: Workers & Pages → each Worker → Settings → Domains & Routes shows its host as **Active**, and DNS → Records shows the host as type `Worker`. The certificate can take a few minutes.

## 2. Deploy, in this order

The API goes first: the web Worker's service binding needs `fitbud-api-<env>` to exist.

```bash
# from the repo root
pnpm --filter @fitbud/api db:migrate:staging --yes        # D1 migrations
pnpm --filter @fitbud/api seed:library:staging --yes      # exercise library (I2d)
pnpm --filter @fitbud/api deploy:staging --yes            # API Worker + api-staging.thefitbud.com
pnpm --filter @fitbud/trainer-web deploy:staging             # builds dist/, then web Worker + app-staging.thefitbud.com
```

The API scripts refuse to run without `--yes` and print the command instead. To check a deploy without uploading anything:

```bash
pnpm --filter @fitbud/api deploy:staging --dry-run
cd apps/trainer-web && pnpm build && pnpm exec wrangler deploy --dry-run --env staging --outdir /tmp/fitbud-web
```

The web dry run must list `env.API (fitbud-api-staging)` and `env.ASSETS`.

Production: the same four commands with `:production`, after staging passes the smoke test.

## 3. Smoke test (staging)

Use a real trainer account on the staging Firebase project (the demo seed is local only).

- [ ] `https://api-staging.thefitbud.com/health` (or any API route) answers from the API, not a Cloudflare error page.
- [ ] `https://app-staging.thefitbud.com/` loads the sign-in page.
- [ ] Reload `https://app-staging.thefitbud.com/clients` directly: the SPA loads (no 404).
- [ ] Sign in. Browser dev tools → Network: requests go to `https://app-staging.thefitbud.com/api/...` and return 200; Application → Cookies shows `fitbud_session` on `app-staging.thefitbud.com`. No CORS errors in the console.
- [ ] Open a client: the client workspace loads with its data.
- [ ] Realtime: Network → WS shows `wss://app-staging.thefitbud.com/api/realtime/relationships/<id>/ws` with status 101, and a change made from another session (for example the phone) shows without a reload. The relative-base bug that kept this socket from opening at all was fixed before W3 (31 Oct); this step is now a real check rather than a known issue, so a 101 that never arrives is worth reporting.
- [ ] Invite link: create an invitation, open its `https://app-staging.thefitbud.com/i/<token>` link in a private window: the invite page from the API opens (not the trainer web sign-in page).
- [ ] Sign out and sign in again.

If any other step fails, roll back with Workers & Pages → the Worker → Deployments → the previous version → Rollback, and tell an agent what you saw (no tokens or cookies in the message).
