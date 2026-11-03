---
id: QT9
title: Show the real OTP verify error and block double taps on the code screen
batch: QA1
depends_on: []
lane: mobile-auth
files_owned:
  - apps/mobile/src/screens/AuthScreen.tsx  # verifyCode only (:84-108)
  - apps/mobile/src/screens/auth/verifyCodeError.ts  # new: error → copy mapping
  - apps/mobile/src/screens/auth/verifyCodeError.test.ts  # new
  - apps/mobile/src/screens/auth/authFlow.test.ts
frames: []  # D-QA1-13: no locked frame covers the code-entry error state
model: sonnet
size: S
---

## Outcome
On the "Use code instead" screen, a trainee or trainer who enters the right code is never told "That code didn't work" when the server accepted it: only `401 OTP_INVALID` shows that copy; any other failure shows a specific message; a failure after the code was accepted says so; and a second tap while a request is in flight does nothing.

## Context
- **Symptom** (Android dev build on staging, 2 Nov 2026): the code screen shows "That code didn't work. Check the latest message or tap Resend." after `/auth/otp/verify` returned **200**, and a double tap on "Verify and sign in" sends the already-consumed code again, which then really fails `401 OTP_INVALID` (codes are single use, `apps/api/src/routes/auth-login.ts:394-396`).
- **Cause:** `verifyCode` in `apps/mobile/src/screens/AuthScreen.tsx:84-108` wraps both `s1.verifyOtp(...)` and `finishAuth(result)` (`:40`) in one `try` with a bare `catch {}`, so any error — network, 429, 5xx, a token-exchange or `/me` failure inside `finishAuth` — becomes the "code didn't work" copy. `loading` is React state, so two taps in the same frame both pass the `code.length` check before the re-render; `PrimaryButton` gets `loading` (`apps/mobile/src/screens/auth/CodeSignInScreen.tsx:106-112`) but the second press is already queued.
- **Errors are typed:** `ApiClientError` carries `status` and `code` (`packages/api-client/src/index.ts:320-335`).
- **Is it already covered?** Checked 2 Nov 2026: AB2 (#146) changed only `Screen.tsx` and its test; no open PR touches `AuthScreen.tsx` (open PRs: #138 BT4 docs, #57 AC1b API, #50 AC1a API). W3's BT3b (#144, merged) owned `AuthScreen.tsx` for legal links and is done. **Not covered; this task owns it.**
- **Copy (decided, D-QA1-4; approved by Firoz, D-QA1-11)**, shown in the shared `ErrorBanner` as every auth screen already does (D-QA1-13 struck the frame-103 reference and the "inline error under the field" wording; 103 is the password screen and no locked frame covers this one):
  - `401 OTP_INVALID` → keep "That code didn't work. Check the latest message or tap Resend."
  - `429` → "Too many tries. Wait a minute, then tap Resend."
  - network / timeout (no status) → "Couldn't reach FitBud. Check your connection and try again."
  - any other status → "Something went wrong (code <status>). Try again." where `<status>` is the HTTP status only, never the server message.
  - verify succeeded but `finishAuth` threw → "Your code worked, but we couldn't finish signing you in. Try again." and the screen **must not** re-send the same code on retry: the retry button calls `finishAuth` with the kept result if it is still in memory, otherwise asks for a new code.
- In-flight guard: a `useRef` boolean set before the request and cleared in `finally`; the button is disabled (not only spinning) while it is set.
- Written against `main` at b646ffc. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Gap list
- `apps/mobile/src/screens/AuthScreen.tsx:99-107`: bare `catch` maps every error to the invalid-code copy, including errors from `finishAuth`.
- `apps/mobile/src/screens/AuthScreen.tsx:84-92`: no synchronous in-flight guard; double tap resends a consumed code.

## Acceptance criteria
- [ ] `verifyCodeError(err)` in `verifyCodeError.ts` maps errors to the copy above; unit-tested for 401 OTP_INVALID, 401 with another code, 429, 500, 503, network `TypeError`, timeout `AbortError`, and a non-`ApiClientError`.
- [ ] `finishAuth` failures are caught separately and show the "Your code worked…" copy; a retry does **not** call `/auth/otp/verify` again (asserted).
- [ ] Two taps on "Verify and sign in" within one tick send exactly one `verifyOtp` request (asserted in `authFlow.test.ts`).
- [ ] The resend and send-code paths (`:69-81`) are unchanged.
- [ ] No percentages, streaks or new banned strings (`docs/spec/banned-strings.json`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] **Device check (Firoz or the UI bot via QT3):** on staging, a correct code signs in once; airplane mode shows the network copy.

## Out of scope
- Server changes. Password sign-in errors. Reset and invite OTP flows. Rate-limit copy on start (`:76-78`).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/screens/auth/verifyCodeError.test.ts` (mapping table).
- `apps/mobile/src/screens/auth/authFlow.test.ts`: double-tap sends one request; `finishAuth` failure keeps the result and does not re-verify.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- **No frame comparison (D-QA1-13).** There is no locked frame for the code-entry error state, so the visual check is the D-QA1-4 copy rendered in the standard `ErrorBanner`, not a match against frame 103.
- Capture the Expo web render of each message at 393x852 to `docs/qa/QT9/`, attach them to the PR, and state in `docs/qa/QT9/README.md` how each shot was produced — a stubbed response must be labelled as one.

## Stop conditions
- `PrimaryButton` cannot be disabled without changing `packages/ui-mobile/**`.
- `finishAuth` cannot be retried without the verify result being re-fetched (would need an API change).
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `eas build`, `eas submit`), a secret value, production data or a deploy.
