---
id: AU1b
title: Server-side Firebase token exchange and POST /auth/refresh
batch: W1
depends_on: [AU1]
lane: auth
files_owned:
  - apps/api/src/auth/custom-token.ts
  - apps/api/src/auth/token-exchange.ts
  - apps/api/src/auth/token-exchange.test.ts
  - apps/api/src/routes/auth-login.ts
  - apps/api/src/routes/auth-login.test.ts
  - apps/api/src/types.ts
  - packages/contracts/src/auth.ts
frames: []
model: opus
size: S
---

## Outcome
In firebase mode, every sign-in route returns a Firebase **ID token** plus a refresh token and expiry, and `POST /auth/refresh` returns a fresh ID token, so a client can sign in and stay signed in without the Firebase SDK.

## Context
- Decision D-B6 / D-W1-2 Option A (adopted 31 Oct 2026, decided by Claude on the recommendation): server-side exchange; clients get no Firebase SDK. Client storage and refresh are AU1c in W2 (backend and UI never share a PR).
- Today `mintAuthToken` signs a Firebase **custom** token with the service account (`FIREBASE_SERVICE_ACCOUNT_JSON`, a Worker secret) and returns `{ token, tokenKind: "firebase_custom_token" }`. AU1 makes the API accept only ID tokens, so the custom token must be exchanged.
- Exchange: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<FIREBASE_WEB_API_KEY>` with JSON `{ "token": <custom token>, "returnSecureToken": true }`. Google returns `idToken`, `refreshToken`, `expiresIn` (seconds, as a string).
- Route response in firebase mode: `{ token: idToken, tokenKind: "firebase_id_token", refreshToken, expiresIn: <number of seconds>, userId }`.
- Refresh: new `POST /auth/refresh` with body `{ refreshToken }` calls `POST https://securetoken.googleapis.com/v1/token?key=<FIREBASE_WEB_API_KEY>` with form body `grant_type=refresh_token&refresh_token=<token>`. Google returns `id_token`, `refresh_token`, `expires_in`. The route returns `{ token, tokenKind: "firebase_id_token", refreshToken, expiresIn }`.
- Rate-limit `/auth/refresh` like login: the existing `bumpRateLimit(db, "auth:ip:<ipHash>", 15, 30)` pattern in `auth-login.ts:153` (use a separate bucket key prefix `auth:refresh:ip:`).
- `FIREBASE_WEB_API_KEY` is a public identifier (v14). Add it to the `Env` type as optional `string`. **Do not** add it to `wrangler.toml` (owned by the infra lane); how its per-env value is supplied is D-W1-8 (Open), which does not block this task.
- In test mode nothing changes: `tokenKind: "test_id_token"`, no `refreshToken`, no `expiresIn`; `/auth/refresh` returns 400 `REFRESH_NOT_SUPPORTED` in test mode.
- Error mapping: any non-2xx or malformed Google response → 401 with stable code `AUTH_EXCHANGE_FAILED` (login routes) or `AUTH_REFRESH_FAILED` (refresh). Missing `FIREBASE_WEB_API_KEY` in firebase mode → 503 `AUTH_PROVIDER_NOT_CONFIGURED` (existing code). Never log tokens, keys or Google response bodies.

## Gap list
- `apps/api/src/auth/custom-token.ts:4-6`: `AuthTokenResult` has only `token` + `tokenKind` (`test_id_token | firebase_custom_token`).
- `apps/api/src/auth/custom-token.ts:55`: returns the custom token directly.
- `apps/api/src/routes/auth-login.ts:196`, `:355`, `:467`, `:564`: `/login`, `/otp/verify`, reset-password and set-password return `mintAuthToken` output unchanged.
- `apps/api/src/routes/auth-login.ts`: no `/auth/refresh` route.
- `packages/contracts/src/auth.ts:10`, `:35` (and the other token responses in that file): `tokenKind` enum lacks `firebase_id_token`; no `refreshToken` / `expiresIn`; no refresh request/response schemas.
- `apps/api/src/types.ts:22-53`: no `FIREBASE_WEB_API_KEY`.

## Acceptance criteria
- [ ] In firebase mode, `/auth/login`, `/auth/otp/verify` (login purpose), the reset-password and set-password routes return `tokenKind: "firebase_id_token"`, `refreshToken` and numeric `expiresIn`.
- [ ] The exchange sends exactly one `POST` to the Identity Toolkit URL above with `returnSecureToken: true`.
- [ ] `POST /auth/refresh` with a valid refresh token returns a new `token`, a new `refreshToken` and `expiresIn`; the response's `refreshToken` is the one Google returned (rotation).
- [ ] Google error on exchange → 401 `AUTH_EXCHANGE_FAILED`; on refresh → 401 `AUTH_REFRESH_FAILED`.
- [ ] `/auth/refresh` is rate-limited (16th call in the window from one IP → 429 `RATE_LIMITED`).
- [ ] Test mode responses are byte-for-byte the same shape as today; `/auth/refresh` in test mode → 400 `REFRESH_NOT_SUPPORTED`.
- [ ] `packages/contracts/src/auth.ts` exports `authRefreshRequestSchema` and `authRefreshResponseSchema`; `tokenKind` enums include `firebase_id_token`; `refreshToken` and `expiresIn` are optional on token responses.
- [ ] The OpenAPI document lists `POST /auth/refresh` (route registered with `operation({...})` like its neighbours).
- [ ] No log line contains a token, the API key or a Google response body.

## Out of scope
- AU1 (ID token verification), AU2 (test-mode refusal, email-only OTP), AU1c (web/mobile storage and refresh, W2). No client code.
- No `wrangler.toml` change (I4a owns it).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/auth/token-exchange.test.ts`: mocked `fetch` for both Google endpoints: exchange success maps fields; refresh success rotates the refresh token; Google 400 → error result; malformed JSON → error result; the request URLs and bodies are exactly as in Context.
- `apps/api/src/routes/auth-login.test.ts`: firebase-mode login returns `firebase_id_token` + `refreshToken`; Google error → 401 `AUTH_EXCHANGE_FAILED`; `/auth/refresh` success, failure, rate limit, and test-mode 400.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
