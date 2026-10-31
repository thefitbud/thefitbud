---
id: X4a
title: Push sender: Expo Push Service with receipts
batch: W2
depends_on: [I5, I4a]
lane: api
files_owned:
  - apps/api/src/lib/push-provider.ts
  - apps/api/src/lib/push-provider.test.ts
  - apps/api/src/lib/expo-push.ts
  - apps/api/src/lib/expo-push.test.ts
  - apps/api/src/types.ts
  - apps/api/src/jobs/reminders.ts
  - apps/api/src/jobs/push-receipts.ts
  - apps/api/src/jobs/push-receipts.test.ts
  - apps/api/src/domain/reminders.ts
  - apps/api/src/routes/notifications.ts
  - apps/api/src/index.ts  # scheduled(): one call to the receipts job
frames: []
model: opus
size: M
---

## Outcome
With `PUSH_PROVIDER_MODE=expo`, reminder and notification pushes are sent through the Expo Push Service, provider acceptance (ticket id) is recorded, and a scheduled job reads receipts and revokes tokens Expo reports as `DeviceNotRegistered`. Staging can then start serving under AU2's guard.

## Context
- D-W2-9 (decided by Firoz, 31 Oct 2026): X4a moves from W3 into W2, because AU2 refuses `PUSH_PROVIDER_MODE=test` outside local and I4a writes `PUSH_PROVIDER_MODE = "expo"` for staging and production; without X4a the first staging deploy (I6) can't serve.
- v14 X4a: send with `POST https://exp.host/--/api/v2/push/send` in batches of at most 100 messages; optional `EXPO_ACCESS_TOKEN` Worker secret sent as `Authorization: Bearer <token>` only when set; receipts from `POST https://exp.host/--/api/v2/push/getReceipts`; payloads carry routing only (`buildSafePushPayload`, `apps/api/src/lib/push-provider.ts:45`): no coaching details. Keep the test double for local.
- Expo tokens look like `ExponentPushToken[...]`. Expo forwards to APNs and FCM using credentials Firoz uploads to Expo (EAS); the Worker never holds APNs or FCM keys.
- Acceptance is not delivery: `notification_deliveries.provider_status = "accepted"` with `provider_message_id` = Expo ticket id (`apps/api/src/db/schema.ts:1424-1449`). Receipts don't change domain state. No migration: the existing columns are enough.
- `fcm` mode stays in the type for compatibility and still returns `fcm_not_configured`.
- Same lane: I5 is before (it owns `types.ts` first); OB2 is after (it adds logging to the files touched here). Device registration with real tokens is X4b (W3).
- `EXPO_ACCESS_TOKEN` is a secret: never in toml, logs, errors or tests (use a fake value).

## Gap list
- `apps/api/src/lib/push-provider.ts:5`: `PushProviderMode = "test" | "fcm"`; no `expo`. `:20-25`: `fcm` returns `fcm_not_configured`.
- `apps/api/src/types.ts:30`: `PUSH_PROVIDER_MODE?: "test" | "fcm"`; no `EXPO_ACCESS_TOKEN`.
- `apps/api/src/jobs/reminders.ts:29`, `:43`, `apps/api/src/routes/notifications.ts:654`, `:848`: map anything but `fcm` to `test`, so `expo` would silently use the test double.
- `apps/api/src/domain/reminders.ts:1653-1690`: sends one token at a time through `sendPushToDevice`; no batching, no access token, no receipt follow-up.
- No receipts job; `apps/api/src/index.ts:203-210` `scheduled()` doesn't call one.

## Acceptance criteria
- [ ] `PushProviderMode` and `Env.PUSH_PROVIDER_MODE` include `"expo"`; `Env` adds `EXPO_ACCESS_TOKEN?: string`. One helper resolves the mode (unknown → `test`), used at all four call sites.
- [ ] `apps/api/src/lib/expo-push.ts` sends up to 100 messages per request with `to`, `title`/`body` from the existing safe payload, `data` = routing payload, `sound: "default"`; maps each ticket to `ok` + ticket id or a failure category (`DeviceNotRegistered`, `MessageTooBig`, `InvalidCredentials`, `provider_error`). 10 s timeout; network errors become `provider_error`.
- [ ] A ticket error `DeviceNotRegistered` marks that `device_tokens` row `revoked` straight away.
- [ ] `apps/api/src/jobs/push-receipts.ts` reads accepted deliveries older than 15 minutes and younger than 24 hours, asks for receipts in chunks of at most 1,000 ids, revokes tokens on `DeviceNotRegistered`, and records receipt errors in `failure_category` without changing `provider_status`. Called once from `scheduled()`.
- [ ] `test` mode behaves exactly as today; local tests never call `exp.host`.
- [ ] No log or error contains the access token, the device token or the payload text.

## Out of scope
- Mobile token registration (X4b, W3). Reminder content and timing (X4c, W3). Deep links (X4d, W3). Logging fields (OB2). Uploading APNs/FCM credentials to Expo (Firoz, manual).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/lib/expo-push.test.ts` (new): mocked `fetch` checks URL, headers with and without the access token, chunking at 100, ticket mapping, timeout.
- `apps/api/src/jobs/push-receipts.test.ts` (new): receipts revoke `DeviceNotRegistered` tokens, ignore `ok`, chunk at 1,000, skip deliveries outside the window.
- `apps/api/src/lib/push-provider.test.ts` (new): mode resolution; `test` double unchanged.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W2.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
