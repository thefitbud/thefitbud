---
id: X4k
title: Registering a push token held by another user reassigns it to the caller (D-W3-9)
batch: W3
depends_on: [X4h]
lane: reminders
files_owned:
  - apps/api/src/routes/notifications.ts  # device-token routes only
  - apps/api/src/routes/notifications.device-tokens.test.ts
frames: []
model: opus
size: S
---

## Outcome
When a trainer and a trainee use the same phone one after the other, the person who signs in last registers the phone's Expo push token and gets the pushes. The previous user stops getting pushes on that phone. Nobody gets a 403.

## Context
- D-W3-9 (decided by Firoz, 2 Nov 2026): the API **always** reassigns a token that belongs to another user to the authenticated caller, whether the other user's row is `active` or `revoked`. A new sign-in that registers the token means the previous user is treated as signed out on that device: their row is released or revoked and they get no more pushes there. There is **no** 403 for a foreign token. This includes the constant token used in `AUTH_MODE=test`. The option "refuse only an active foreign row" was **not** chosen.
- An Expo push token belongs to an installation, not a user, so every FitBud user of one phone reports the same token. In `AUTH_MODE=test` the installation id is the constant `fitbud-mobile-local-install` (`apps/mobile/src/notifications/routing.ts:183-184`), and the token is the same for every user too.
- X4b (merged, #117) added re-registration per installation. To free a unique key it revokes the superseded row and parks it on a sentinel installation id, because `notification_deliveries` references `device_tokens` with no `ON DELETE` (`apps/api/src/routes/notifications.ts:222-235`). Use the same approach here. Never hard-delete a `device_tokens` row.
- `domain/reminders.ts` and the trainer push path send only to rows with `status: "active"`, so a revoked row gets no pushes.

## Gap list
- `apps/api/src/routes/notifications.ts:183-190`: any row with this token whose `userId` differs from the caller returns 403 `DEVICE_TOKEN_OWNED`, whatever its `status`.
- `apps/api/src/routes/notifications.ts:340`: `DELETE` only sets `status: "revoked"` and keeps the token, so `device_tokens_token_uidx` (`apps/api/drizzle/0010_notifications.sql:15`) stays held by the signed-out user.
- `apps/api/src/routes/notifications.device-tokens.test.ts:492`: pins the 403 that D-W3-9 removes.
- Written against `main` at 8f3d340. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] `POST /notifications/device-tokens` with a token held by another user's **revoked** row returns 200, and the caller now has an `active` row with that token.
- [ ] The same with the other user's row **active**: 200 (never 403). The caller has an `active` row with the token, and the other user's row is `revoked` and no longer holds the token (released onto a sentinel, like X4b's `revoked:<id>`), so it can never be sent to again.
- [ ] The other user's old row is kept, not deleted, so its `notification_deliveries` history stays attributed to them. The caller's row is the only `active` row holding the token.
- [ ] After reassignment, a push to the old user does not reach that token, and a push to the new user does.
- [ ] The constant `AUTH_MODE=test` token and installation id are reassigned the same way when a second user registers them.
- [ ] `DEVICE_TOKEN_OWNED` is never returned by this route. Same-user re-registration (X4b) behaves as before.
- [ ] No migration. No token value in logs, error details or the response for another user.

## Out of scope
- Mobile changes. The `DEVICE_TOKEN_OWNED` branch in `apps/mobile/src/notifications/register.ts:148` becomes unreachable but harmless; removing it is a follow-up in the push-mobile lane, not this task.
- Scoping tokens per user (needs a migration; not chosen). Making the test-mode constant per user.
- Sending (X4a, X4i), reminder logic (X4c), trainer pushes (X4f).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/src/routes/notifications.device-tokens.test.ts`, replacing the 403 test at `:492`:
  - (a) user A registers, A deletes (row revoked), user B registers the same token → 200; B has an `active` row with the token; A's row stays `revoked` and no longer holds the token.
  - (b) user A registers (row active), user B registers the same token with no delete in between → 200, not 403; B's row is `active`; A's row is `revoked` or released and does not hold the token; A's row still exists (seed a `notification_deliveries` row on it first, so a hard delete would fail the test).
  - (c) after (b), send a push to A and one to B through the same path reminders use (stub the Expo sender): A's send reaches no device (no row selected, no provider call for the token); B's send goes to the token once.
  - (d) test mode: two users register the constant `AUTH_MODE=test` token and installation id one after the other → both 200, the second user owns the only `active` row.
  - B then A again (the phone handed back) → 200, A active, B revoked.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot. The PR lists the test names that cover each criterion.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- Reassignment cannot be done without a migration or a hard delete of a `device_tokens` row.
- Any path would still answer 403 `DEVICE_TOKEN_OWNED` for a foreign token, or would leave the old user's row `active` with the token.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
