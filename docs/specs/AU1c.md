---
id: AU1c
title: API client and trainer web keep the session alive with /auth/refresh
batch: W2
depends_on: [AU1b]
lane: client-auth
files_owned:
  - packages/api-client/src/index.ts
  - packages/api-client/src/index.test.ts
  - apps/trainer-web/src/lib/session.ts
  - apps/trainer-web/src/lib/session.test.ts
  - apps/trainer-web/src/lib/api.ts
  - apps/trainer-web/src/lib/http-api.ts
  - apps/trainer-web/src/lib/http-api.test.ts
  - apps/trainer-web/src/lib/auth-flow.ts
  - apps/trainer-web/src/lib/auth-flow.test.ts
  - apps/trainer-web/src/auth/AuthProvider.tsx
  - apps/trainer-web/src/auth/CodeSignInPage.tsx
  - apps/trainer-web/src/auth/ForgotPasswordPage.tsx
frames: []
model: opus
size: S
---

## Outcome
The shared API client can refresh an expiring Firebase ID token through AU1b's `POST /auth/refresh`, and the trainer web app stores the refresh token, refreshes before expiry and once on a 401, and signs out only when refresh fails.

## Context
- v14 AU1c, split in W2.md: this task is the shared client plus trainer web. AU1d does the mobile app with the same client hook.
- D-W2-3 (decided): store `refreshToken` the same way the access token is stored today; refresh shortly before `expiresIn` runs out and once on a 401, then retry the original request once; if refresh fails, sign out.
- AU1b (W1) returns `{ token, tokenKind: "firebase_id_token", refreshToken, expiresIn }` from `/auth/login`, `/auth/otp/verify`, reset-password and set-password, and adds `POST /auth/refresh` with `authRefreshRequestSchema` / `authRefreshResponseSchema` in `packages/contracts/src/auth.ts`. In test mode, `/auth/refresh` returns 400 and responses carry no `refreshToken`; the client must then behave exactly as today.
- On the API, a valid session cookie wins over the bearer token (`apps/api/src/middleware/auth.ts:32-39`), so once WD1 serves the web app on the same origin, most web requests survive an expired ID token. The refresh is still required for bearer-only calls (uploads, realtime) and for `createWebSession`.
- Refresh tokens are long-lived credentials: never log them, never put them in URLs, and clear them on sign-out.

## Gap list
- `packages/api-client/src/index.ts:303-309`: `ApiClientOptions` has `baseUrl`, `getAccessToken`, `getIdempotencyKey`, `getSelectedRole`, `fetch`; no refresh hook.
- `packages/api-client/src/index.ts:2262-2330`: `request()` throws `ApiClientError` on any non-ok response; no 401 refresh-and-retry. Uploads (`:1976`) and realtime (`:2220`) read the token separately.
- `packages/api-client/src/index.ts`: no `refreshAuth()` method for `POST /auth/refresh`.
- `apps/trainer-web/src/lib/session.ts`: stores only `fitbud.trainer.accessToken` in sessionStorage (`storeSession(token, email)`, `clearSession()`); no refresh token or expiry.
- `apps/trainer-web/src/lib/api.ts:13-17` and `apps/trainer-web/src/lib/http-api.ts:17-22`: build the client and add the bearer header; no refresh.
- `apps/trainer-web/src/lib/auth-flow.ts:73-90` (`establishTrainerSession`) and `:100-116` (login and OTP): drop `refreshToken`/`expiresIn`.
- `apps/trainer-web/src/auth/CodeSignInPage.tsx:98`, `apps/trainer-web/src/auth/ForgotPasswordPage.tsx:123`: call `signInWithToken(result.token, …)` without the refresh token.
- `apps/trainer-web/src/auth/AuthProvider.tsx:69`: a 401 signs out straight away.

## Acceptance criteria
- [ ] `ApiClientOptions` gains optional `refreshAccessToken?: () => Promise<string | null>`. When set, a 401 from `request()` calls it once (concurrent 401s share one in-flight refresh), and on a new token the original request is retried once with the same idempotency key. A second 401 or a `null` result throws the original `ApiClientError`. Uploads and realtime use the same path.
- [ ] `FitBudApiClient.refreshAuth(refreshToken)` posts to `/auth/refresh` and parses `authRefreshResponseSchema`.
- [ ] Without `refreshAccessToken` (and in test mode) the client behaves byte-for-byte as before; existing api-client tests pass unchanged.
- [ ] Trainer web stores `refreshToken` and the expiry time next to the access token in sessionStorage, refreshes about 60 s before expiry, and on refresh failure clears all three and signs out to the sign-in page.
- [ ] Every trainer-web sign-in path (password, code, forgot password, invite) passes the refresh token through.
- [ ] No refresh token appears in logs, URLs, error messages or test snapshots.

## Out of scope
- Mobile (AU1d). The API side of `/auth/refresh` (AU1b, W1). Invitation-accept token exchange (AU1e). Same-origin hosting (WD1).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `packages/api-client/src/index.test.ts`: 401 → refresh → retry succeeds; refresh returns null → original error; two parallel 401s → one refresh call; no hook → no retry; upload path retries once.
- `apps/trainer-web/src/lib/session.test.ts` (new): store, read, expiry and clear of the three keys.
- `apps/trainer-web/src/lib/auth-flow.test.ts`, `apps/trainer-web/src/lib/http-api.test.ts`: refresh token is passed through; refresh failure clears the session.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (no UI change; sign-in screens look the same).

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
