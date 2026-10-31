---
id: AU1e
title: Invitation accept returns a real Firebase ID token
batch: W2
depends_on: [AU1b]
lane: auth-api
files_owned:
  - apps/api/src/routes/invitations.ts
  - apps/api/src/routes/invitations.test.ts
  - packages/contracts/src/relationship.ts
frames: []
model: opus
size: S
---

## Outcome
In Firebase mode, accepting an invitation returns a Firebase ID token plus refresh token, the same as AU1b's login routes, so a new trainee is signed in after accepting.

## Context
- New in W2 (found while reading code for AU1c). AU1b (W1) exchanges the custom token in the four `auth-login.ts` routes but its gap list does not include `invitations.ts`, which also returns `mintAuthToken` output. With `AUTH_MODE=firebase`, AU1 accepts only ID tokens, so the token returned on invite accept would be rejected and the new trainee lands signed out.
- Use the exchange helper AU1b adds in `apps/api/src/auth/token-exchange.ts` and the same error mapping (Google error → 401 `AUTH_EXCHANGE_FAILED`). Do not edit `token-exchange.ts`.
- D-W2-14 (decided by Firoz, 31 Oct 2026): this stays its own W2 task; AU1b is not reopened.

## Gap list
- `apps/api/src/routes/invitations.ts:721-735`: returns `{ token, tokenKind, userId, relationshipId }` straight from `mintAuthToken`; no exchange, no `refreshToken`/`expiresIn`.
- `packages/contracts/src/relationship.ts:89`: `tokenKind` enum is `test_id_token | firebase_custom_token`; no `firebase_id_token`, no optional `refreshToken`/`expiresIn`.

## Acceptance criteria
- [ ] Firebase mode: the accept response has `tokenKind: "firebase_id_token"`, `refreshToken` and `expiresIn`; the custom token never leaves the Worker.
- [ ] Exchange failure returns 401 `AUTH_EXCHANGE_FAILED` and logs only the error name. The invitation stays accepted (the user can sign in with the code flow).
- [ ] Test mode: response unchanged.
- [ ] `acceptInvitationWithTokenResponseSchema` matches AU1b's auth token response shape.

## Out of scope
- Client handling (AU1c web invite path, AU1d mobile). Changes to the exchange helper itself (AU1b).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/routes/invitations.test.ts`: firebase-mode accept with mocked Google `fetch` returns the ID token fields; exchange error → 401 with the invitation still accepted; test mode unchanged.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
