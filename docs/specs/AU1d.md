---
id: AU1d
title: Mobile app keeps the session alive with /auth/refresh
batch: W2
depends_on: [AU1c, AU1e, X2]
lane: client-auth
files_owned:
  - apps/mobile/src/auth/AuthProvider.tsx
  - apps/mobile/src/auth/AuthProvider.test.tsx
  - apps/mobile/src/lib/sessionStorage.ts
  - apps/mobile/src/lib/sessionStorage.test.ts
  - apps/mobile/src/lib/api.ts
  - apps/mobile/src/lib/api.test.ts
  - apps/mobile/src/screens/AuthScreen.tsx
  - apps/mobile/src/screens/AcceptInviteScreen.tsx
  - apps/mobile/src/dev/CaptureBridgeActivator.tsx
frames: []
model: opus
size: S
---

## Outcome
The mobile app passes AU1c's refresh hook to the shared client, keeps the refresh token where it keeps the access token today, refreshes before expiry and once on a 401, and signs out only when refresh fails.

## Context
- Split from v14 AU1c in W2.md (AU1c was larger than M across three codebases). Same rules as AU1c (D-W2-3).
- Storage today: `apps/mobile/src/lib/sessionStorage.ts` persists the token in localStorage (`fitbud.accessToken`) on web only; on native the token lives in memory, so the user signs in again after an app restart. D-W2-3 says store the refresh token "the same way", so on native it stays in memory. D-W2-13 (decided by Firoz, 31 Oct 2026): the refresh token stays in memory only on native. Do not add secure storage.
- X2 (W1) owns `apps/mobile/src/lib/api.ts` before this task; merge after X2.
- AU1e makes the invitation-accept response carry `refreshToken`/`expiresIn`, used by `AcceptInviteScreen`.

## Gap list
- `apps/mobile/src/auth/AuthProvider.tsx:99-107`: `accessTokenRef` only; no refresh token or expiry.
- `apps/mobile/src/auth/AuthProvider.tsx:177-182`, `:253-259`: a 401 signs out straight away.
- `apps/mobile/src/auth/AuthProvider.tsx:224-233`: `signInWithToken(token)` takes only the access token; `:271` `signOut` clears only it.
- `apps/mobile/src/lib/api.ts:115-122`: `createMobileApiClient` passes no refresh hook.
- `apps/mobile/src/lib/sessionStorage.ts`: one key, web only.
- `apps/mobile/src/screens/AuthScreen.tsx:40-43` (`finishAuth(token)`), `:56-57` (password login); `apps/mobile/src/screens/AcceptInviteScreen.tsx:294`; `apps/mobile/src/dev/CaptureBridgeActivator.tsx:25,34`: drop `refreshToken`/`expiresIn`.

## Acceptance criteria
- [ ] `signInWithToken(token, refresh?: { refreshToken: string; expiresIn: number })`; every caller listed above passes the refresh fields when the response has them.
- [ ] `createMobileApiClient` passes `refreshAccessToken`, which calls `refreshAuth` and updates the stored tokens; one in-flight refresh at a time.
- [ ] A timer refreshes about 60 s before expiry while the app is in the foreground, and on returning to the foreground if expiry has passed.
- [ ] Refresh failure clears both tokens and the expiry and signs out.
- [ ] On web the refresh token and expiry go in localStorage next to `fitbud.accessToken`; on native they stay in memory (no new storage library).
- [ ] Test mode (no `refreshToken`) behaves as today.

## Out of scope
- Secure-storage persistence on native (D-W2-13: memory only). Shared client changes (AU1c). API changes (AU1b, AU1e).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/sessionStorage.test.ts` (new): web keys written and cleared; native path writes nothing.
- `apps/mobile/src/auth/AuthProvider.test.tsx` (new): 401 → refresh → retry; refresh failure → signed out; test-mode token → no refresh.
- `apps/mobile/src/lib/api.test.ts`: the client is built with the refresh hook.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (no UI change).

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
