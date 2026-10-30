---
id: AU1
title: Verify real Firebase ID tokens (RS256, JWKS) when AUTH_MODE=firebase
batch: W1
depends_on: []
lane: auth
files_owned:
  - apps/api/src/auth/firebase.ts
  - apps/api/src/auth/firebase.test.ts
  - apps/api/package.json  # dependencies block only, to add jose; see D-W1-6
  - pnpm-lock.yaml  # shared with X2 under the W1.md lockfile rule
frames: []
model: opus
size: S
---

## Outcome
With `AUTH_MODE=firebase`, the API accepts a genuine Firebase ID token for the configured project and rejects forged, expired or foreign-project tokens with 401. `AUTH_MODE=test` behaves exactly as today.

## Context
- Decision D-B9 (Firoz, 31 Oct 2026): no mid-task human approval; this spec decides the auth change.
- Decision D-W1-3 (Firoz, 30 Oct 2026): two Firebase projects. Staging project ID `thefitbud-staging`; production project ID `thefitbud-prod`. No dev project: local runs use `AUTH_MODE=test`. The project ID reaches the Worker as the existing var `FIREBASE_PROJECT_ID` (local value `fitbud-local`, `apps/api/wrangler.toml`).
- Verification rules (beta task list v14, AU1):
  - Algorithm RS256 only; verify with `jose` `createRemoteJWKSet` against `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`.
  - `iss` must equal `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`.
  - `aud` must equal `<FIREBASE_PROJECT_ID>`.
  - `exp` in the future and `iat` in the past (allow at most 60 s clock skew); `sub` a non-empty string; `auth_time` ≤ now.
  - The verified identity is `{ uid: sub, email: payload.email if a string }`.
- Callers (no signature change needed): `apps/api/src/middleware/auth.ts:56`, `apps/api/src/routes/auth.ts:74`, `apps/api/src/routes/realtime.ts:79`. They pass `{ projectId, authMode }`.
- Dependency: adding `jose` touches `apps/api/package.json` and `pnpm-lock.yaml`. Ownership of `apps/api/package.json` is **D-W1-6 (Open)** in W1.md. Lockfile rule (W1.md): whichever of AU1 / X2 merges second merges `main` in and re-runs `pnpm install`.
- Tests must not reach the network: build a local RSA key pair and a local JWKS in the test and inject it (e.g. an optional `jwks` parameter or a module-level setter used only by tests; it must not be selectable from env).
- AU1b (token exchange) and AU2 (refuse test modes outside local) follow in this lane. Until AU1b merges, firebase-mode login still returns custom tokens; that is expected.

## Gap list
- `apps/api/src/auth/firebase.ts:24-27`: firebase mode returns `null` for every token, so no real sign-in can work. Target: full RS256 verification as above.
- `apps/api/src/auth/firebase.ts:7-8`: header comment says production verification is not wired. Target: comment describes both modes.
- `apps/api/package.json:23-32`: no `jose` dependency.
- No `apps/api/src/auth/firebase.test.ts` exists today; firebase mode is untested.

## Acceptance criteria
- [ ] `verifyFirebaseIdToken(token, { projectId, authMode: "firebase" })` returns `{ uid, email? }` for a token signed by a key in the JWKS with correct `iss`, `aud`, `exp`, `iat`, `sub`, `auth_time`.
- [ ] It returns `null` for: wrong signature, unknown `kid`, `alg` other than RS256 (including `none` and HS256), wrong `iss`, wrong `aud`, expired `exp`, `iat` in the future beyond 60 s, empty `sub`, `auth_time` in the future, malformed token.
- [ ] A protected route called with a rejected token returns 401 `UNAUTHENTICATED` (via the existing `requireAuthMiddleware`).
- [ ] `AUTH_MODE=test` tokens (`test.<base64url>`) still verify exactly as before; existing `apps/api/src/auth/auth.test.ts` passes unchanged.
- [ ] No token, header or payload value is logged.
- [ ] The JWKS URL is a constant in `firebase.ts`; it is not read from env.

## Out of scope
- AU1b (custom-token exchange and `POST /auth/refresh`), AU2 (refusing test modes, email-only OTP), AU1c (client refresh, W2).
- No changes to `wrangler.toml` (infra lane: I7, I4a).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/auth/firebase.test.ts`: one valid token passes; one case per rejection in the acceptance criteria returns `null`; test-mode tokens still pass; no network access (local JWKS).
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
