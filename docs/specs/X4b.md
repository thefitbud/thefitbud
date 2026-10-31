---
id: X4b
title: Device-token API accepts Expo tokens and re-registers per installation
batch: W3
depends_on: [X4a]
lane: push-api
files_owned:
  - packages/contracts/src/notification.ts
  - apps/api/src/db/schema.ts  # device_tokens provider enum only
  - apps/api/src/routes/notifications.ts  # device-token routes only
  - apps/api/src/routes/notifications.device-tokens.test.ts
frames: []
model: opus
size: S
---

## Outcome
`POST /notifications/device-tokens` stores real Expo push tokens (`provider: "expo"`) for trainers and trainees, and a new token from the same installation replaces the old one instead of failing.

## Context
- v14 X4b (backend half; the mobile half is X4e, because backend and UI never share a spec). D-B9: letting trainees register their own device is decided.
- Conflict listed in W3.md: v14 C3 says the route returns 403 for trainees, but the route already allows both roles (`apps/api/src/routes/notifications.ts:134`, `:141`); the 403 is `FORBIDDEN_ROLE` when no role is selected (`apps/api/src/middleware/auth.ts:94`). This spec keeps the role rule and adds a test proving a trainee with a selected role gets 200.
- Provider value: D-W3-2 (decided by Firoz, 1 Nov 2026): add `"expo"`, no migration: `device_tokens.provider` is plain `text` with no CHECK (`apps/api/drizzle/0010_notifications.sql:6`).
- X4a (W2) sends with Expo; X4a owns the sender, this spec owns the routes.

## Gap list
- `packages/contracts/src/notification.ts:9`: `deviceTokenProviderSchema = z.enum(["fcm"])`; `:32` defaults to `fcm`.
- `apps/api/src/db/schema.ts:1245`: `provider` enum `["fcm"]` (TypeScript only).
- `apps/api/src/routes/notifications.ts:157`: looks up by token only; `:199` inserts a new row. A new token for the same `(user_id, installation_id)` hits the unique index `device_tokens_user_installation_uidx` (`apps/api/drizzle/0010_notifications.sql:16`) and fails.

## Acceptance criteria
- [ ] Provider enum is `["fcm", "expo"]` in the contract and the Drizzle schema; default stays `fcm` for old clients.
- [ ] Registering a new token for an existing `(user, installationId)` updates that row (token, provider, platform, `status: active`, `lastSeenAt`) and returns 200.
- [ ] A token owned by another user still returns 403 `DEVICE_TOKEN_OWNED`.
- [ ] A trainee with `x-fitbud-role: trainee` registers and deletes a device token (200).
- [ ] No migration file. No token value in logs or error details.

## Out of scope
- Mobile token fetch and sign-out unregister (X4e). Sending (X4a). Reminder logic (X4c).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/routes/notifications.device-tokens.test.ts` (new): expo provider accepted; same installation new token → one row, updated; other user's token → 403; trainee register/delete → 200; no role → 403 `FORBIDDEN_ROLE`.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
