---
id: AU2
title: Refuse test modes outside local; email-only OTP outside local
batch: W1
depends_on: [AU1b]
lane: auth
files_owned:
  - apps/api/src/middleware/runtime-guard.ts
  - apps/api/src/middleware/runtime-guard.test.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/index.ts  # only the app.use middleware lines; see W1.md ownership note
  - apps/api/src/routes/auth-login.ts
  - apps/api/src/routes/auth-login.test.ts
  - apps/api/src/types.ts
frames: []
model: opus
size: S
---

## Outcome
A staging or production Worker that is accidentally configured with a test auth, push or email mode refuses to serve and says why in the logs, and outside local the OTP flow offers email only.

## Context
- Decision D-B2 / D-W1-4 (Firoz, 30 Oct 2026): OTP channel for beta is **email only**. WhatsApp OTP stays available in local; outside local it is off until post-beta.
- Decision D-B9 (Firoz, 31 Oct 2026): this spec decides the auth change; no mid-task approval.
- Rule (v14 AU2): add `"staging"` to `ENVIRONMENT`. When `ENVIRONMENT` is `staging` or `production` and any of `AUTH_MODE=test`, `PUSH_PROVIDER_MODE=test`, `EMAIL_PROVIDER=dev_sink` is set, every request returns an error with code `RUNTIME_MISCONFIGURED`, and the reason is logged once per isolate.
- **D-W1-10 (Open in W1.md):** the HTTP status for `RUNTIME_MISCONFIGURED`. v14 says 500; today's partial checks return 503 (`auth-login.ts:143` `AUTH_NOT_CONFIGURED`, `middleware/auth.ts:48-53` `AUTH_MODE_TEST_DISABLED`). Recommended: 500 as v14 says. If it is still Open at launch, stop.
- `preview` keeps today's behaviour (it is neither staging nor production).
- Treat an unset `PUSH_PROVIDER_MODE` as `test` and an unset `EMAIL_PROVIDER` as `dev_sink`, matching today's defaults (`lib/email.ts:22`).
- Centralise: a new `runtimeGuardMiddleware` in `apps/api/src/middleware/runtime-guard.ts`, registered first in `apps/api/src/index.ts` (next to the existing `app.use("*", …)` lines at `index.ts:54-62`). Leave `lib/email.ts`'s `DEV_SINK_REFUSED` (`lib/email.ts:28-30`) as a second line of defence; do not edit `lib/email.ts`.
- The log line uses `writeStructuredLog` (`apps/api/src/lib/log.ts`) with `level: "error"`, `message: "RUNTIME_MISCONFIGURED"` and the names of the offending vars only, never their values beyond the mode name.
- `/auth/otp/start` (`auth-login.ts:215-286`): outside `ENVIRONMENT=local`, never push `"whatsapp"` into `channels`, even if the `wa_otp` flag is on.

## Gap list
- `apps/api/src/types.ts:33`: `ENVIRONMENT?: "local" | "production" | "preview"`, no `staging`.
- `apps/api/src/routes/auth-login.ts:96-105`: `assertAuthRuntimeReady` checks only auth mode, and only on routes that call it.
- `apps/api/src/middleware/auth.ts:42-54`: per-request test-mode check with 503 `AUTH_MODE_TEST_DISABLED`, bypassed when `process.env.VITEST === "true"`.
- No check for `PUSH_PROVIDER_MODE=test` or `EMAIL_PROVIDER=dev_sink` at request time.
- `apps/api/src/routes/auth-login.ts:272-275`: WhatsApp channel added whenever `flags.wa_otp` is on, in any environment.

## Acceptance criteria
- [ ] `Env.ENVIRONMENT` accepts `"staging"`.
- [ ] With `ENVIRONMENT=staging` or `production` and `AUTH_MODE=test`, `GET /health` and any other route return the D-W1-10 status with `error.code = "RUNTIME_MISCONFIGURED"` and a `requestId`.
- [ ] Same for `PUSH_PROVIDER_MODE=test` (or unset) and for `EMAIL_PROVIDER=dev_sink` (or unset).
- [ ] With `ENVIRONMENT=staging`, `AUTH_MODE=firebase`, `PUSH_PROVIDER_MODE` not `test`, `EMAIL_PROVIDER` not `dev_sink`, requests are served normally.
- [ ] `ENVIRONMENT=local` and `preview` are unaffected by the guard.
- [ ] The misconfiguration is logged once per isolate, naming the offending vars; no secret values are logged.
- [ ] With `ENVIRONMENT` other than `local`, `/auth/otp/start` for a mobile identifier with `wa_otp` on returns `channels: ["email"]` and sends no WhatsApp message; in `local` behaviour is unchanged.
- [ ] Existing auth tests pass; the VITEST bypass in `middleware/auth.ts` is removed or no longer needed because tests set `ENVIRONMENT=local`.

## Out of scope
- AU1, AU1b (same lane, already merged before this), AU1c (W2), I5 (ZeptoMail provider, W2), X4a (Expo push mode, W3). Do not add `zeptomail` or `expo` enum values here.
- No `wrangler.toml` change (I4a sets the per-env vars).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/middleware/runtime-guard.test.ts`: matrix of ENVIRONMENT (local, preview, staging, production) × each test mode → served or `RUNTIME_MISCONFIGURED`; log emitted once.
- `apps/api/src/routes/auth-login.test.ts`: OTP start returns email only outside local even with `wa_otp` on; local still offers WhatsApp for a mobile identifier.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
