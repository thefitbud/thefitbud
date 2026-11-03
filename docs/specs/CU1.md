---
id: CU1
title: Password reset screen: honest errors on startOtp, verifyOtp and resetPassword
batch: W3b
depends_on: []
lane: mobile
files_owned:
  - apps/mobile/src/trainee/settings/PasswordScreen.tsx
  - apps/mobile/src/trainee/settings/passwordResetErrors.ts  # new: pure error -> copy mapping
  - apps/mobile/src/trainee/settings/passwordResetErrors.test.ts  # new
frames: []
model: sonnet
size: S
---

## Outcome
A trainee changing their password with an email code sees a message that names what actually went wrong (wrong or expired code, too many tries, offline, or a short error code), never "That code didn't work." for a failure the app did not check. **P0 in W3b.**

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- Rule: AGENTS.md "No misleading catch (D-W3-12, D-W3-18)" — fixed text only after checking the API code that proves it (`OTP_INVALID`, `OTP_EXPIRED`, `429`, ...); everything else shows a short error code from `apps/mobile/src/lib/authErrors.ts` (`AUTH-NET`, `AUTH-PARSE`, ...) and goes through `reportError`. A ZodError is never the user's mistake. The only verbatim text is an `ApiClientError` message.
- Same pattern AB4 (#164) and QT9 fixed on the login screens: reuse `authErrors.ts` and `reportError` (read only; both are merged and nobody in W3b owns them, but CU5 owns `reportError.ts`, so do not edit it). Look at `apps/mobile/src/screens/auth/verifyCodeError.ts` for the shape.
- `requestCode` (`startOtp`, purpose `reset`): the success-looking "If an account exists, we've sent a code." is the intended non-enumeration copy for a 2xx and for the API's own not-found-style answer only; a network error, 5xx or ZodError must not show it.

## Gap list
- `apps/mobile/src/trainee/settings/PasswordScreen.tsx:38`: bare `catch` on `startOtp` shows "If an account exists, we've sent a code." for every failure, including offline.
- `apps/mobile/src/trainee/settings/PasswordScreen.tsx:60`: bare `catch` on `verifyOtp` shows "That code didn't work." for every failure (the 3 Nov incident wording).
- `apps/mobile/src/trainee/settings/PasswordScreen.tsx:78`: bare `catch` on `resetPassword` shows "Could not update password." with no code and no `reportError`.
- `apps/mobile/src/trainee/settings/PasswordScreen.tsx:55`: `result.purpose !== "reset"` also shows "That code didn't work."; that is a client/server disagreement, not a wrong code.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] No bare `catch` remains in `PasswordScreen.tsx`; each catch maps through `passwordResetErrors.ts`.
- [ ] "That code didn't work." (or the AB4 equivalent) appears only for `OTP_INVALID`/`OTP_EXPIRED`; `429` gets the too-many-tries copy; network failures get the `AUTH-NET` copy; ZodError and the purpose mismatch get `AUTH-PARSE`; anything else gets a short code.
- [ ] Every non-user-error branch calls `reportError` with no code, password, token or email in the payload.
- [ ] An `ApiClientError` message may be shown verbatim; no other `error.message` is shown.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- The login screens (AB4/QT9, merged), `authErrors.ts` copy changes, `reportError.ts` (CU5).
- API changes.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `passwordResetErrors.test.ts`: one case per branch above for each of the three calls, including a ZodError, a `TypeError` network failure, `429`, `OTP_INVALID`, `OTP_EXPIRED`, an unknown `ApiClientError`, and asserts no secret value reaches `reportError`.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (copy only; no layout change).

## Stop conditions
- `authErrors.ts` lacks a code the mapping needs and adding it would change an AB4/QT9 string.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
