---
id: AB4
title: Honest auth error messages and no stale package builds in the mobile dev loop
batch: W3
depends_on: [AB3, QT9]
lane: build
files_owned:
  - apps/mobile/src/lib/authErrors.ts  # new: error → { code, copy } mapping for non-OTP auth paths
  - apps/mobile/src/lib/authErrors.test.ts  # new
  - apps/mobile/src/lib/reportError.ts  # new: dev console / prod error-reporting seam
  - apps/mobile/src/lib/reportError.test.ts  # new
  - apps/mobile/src/screens/AuthScreen.tsx  # every catch EXCEPT verifyCode (QT9 owns that one)
  - apps/mobile/src/screens/AcceptInviteScreen.tsx  # its catches
  - apps/mobile/src/auth/AuthProvider.tsx  # messageFromError only
  - apps/mobile/metro.config.js  # dev resolves workspace package source
  - apps/mobile/package.json  # "start" script rebuilds packages
  - apps/mobile/app.config.js  # extra.bundleCommit
  - apps/mobile/src/dev/BundleCommitBadge.tsx  # new, dev-only
  - docs/LOCAL_TESTING.md  # stale dist note
  - AGENTS.md  # "no misleading catch" rule
frames: []
model: sonnet
size: M
---

## Outcome
Every auth failure on mobile tells the user what actually happened: "That code didn't work" appears only for a rejected or expired code, and any other failure shows a distinct message with a short error code that a developer can match to the console. A developer running the app locally can no longer bundle out-of-date shared packages, and a dev build shows which commit its JS came from.

## Context
- **Resolved incident (3 Nov 2026), why this task exists.**
  - *Symptom:* on Firoz's Android dev client (staging), a correct email code showed "That code didn't work. Check the latest message or tap Resend." Staging Worker logs showed `POST /auth/otp/verify` **200** (2 Nov 22:44 and 22:45 IST, 3 Nov 08:55 and 08:57 IST) with no `GET /me` after it, so the app failed on the client after a successful verify.
  - *Root cause:* `apps/mobile/metro.config.js:23-29` maps `@fitbud/contracts` and `@fitbud/api-client` to `packages/*/dist/index.js`, which is gitignored build output. Firoz's local `packages/contracts/dist` predated AU1b (acf8d88, 31 Oct), whose `tokenKind` enum allowed only `test_id_token` and `firebase_custom_token`. Staging (firebase mode) replies with `firebase_id_token`, so `schema.parse(envelope.data)` (`packages/api-client/src/index.ts:2447`) threw a ZodError, and the bare `catch` in `apps/mobile/src/screens/AuthScreen.tsx:102` showed the generic code message. `git pull` and `npx expo start -c` do not rebuild `dist`; only `pnpm dev` does, because `apps/mobile/package.json:7` runs `predev: pnpm -w run build:packages`.
  - *Fix that worked (confirmed by Firoz, 3 Nov 2026):* `pnpm -w run build:packages` from the repo root, then `npx expo start --dev-client -c` in `apps/mobile`. Going forward, start with `pnpm dev` (or `pnpm mobile` from the root).
  - *Cost:* the misleading message sent two agents and Firoz looking at the server, OTP rate limits and Firebase for several hours.
- **Decision D-W3-12** (decided by Firoz, 3 Nov 2026): no `catch` may show a generic message that names a cause it did not check. Auth copy: "That code didn't work" only for `OTP_INVALID`/`OTP_EXPIRED`; everything else gets a distinct message with an error code.
- **Overlap with QT9 (QA1, PR #154).** QT9 owns the `verifyCode` catch in `AuthScreen.tsx` (`:84-108` on `main`) and its copy (D-QA1-4, approved as written in D-QA1-11). **AB4 does not change QT9's wording or `verifyCode`;** it starts after QT9 merges and covers the other catches: `signInPassword` (`apps/mobile/src/screens/AuthScreen.tsx:59`), `sendCode` (`:77`), `requestReset` (`:116`), reset verify (`:137`), reset set-password (`:158`), and `apps/mobile/src/screens/AcceptInviteScreen.tsx:44`, `:190`, `:218` (bare) and `:159`, `:250`, `:299`. Reuse QT9's `verifyCodeError.ts` network/timeout/5xx copy where it applies, so the app says the same thing for the same failure.
- **Error codes (shown in copy, short and stable):** `AUTH-NET` (network/timeout), `AUTH-RATE` (429), `AUTH-SRV` (5xx), `AUTH-PARSE` (ZodError: client and server disagree on a response), `AUTH-SESSION` (`finishAuth` / `signInWithToken` threw), `AUTH-UNK` (anything else). Template: "Couldn't finish signing in (AUTH-PARSE). Try again." Wrong password stays "That mobile number or email and password don't match." but only for `401 INVALID_CREDENTIALS` (check the code the API sends in `apps/api/src/routes/auth-login.ts`); "Too many codes requested..." only for `429`.
- **Reporting.** `reportError(where, err)`: in `__DEV__` it logs `console.warn("[auth]", where, err.name, err.message, zodIssues?)` where `zodIssues` is `err.issues` mapped to `{path, code, message}` (never `received` values, never tokens or request bodies). In release builds it forwards to the error reporter if one is installed (mobile has no Sentry today; Sentry is errors-only when added); until then it is a no-op. Do not add a dependency.
- **Stale `dist` prevention (pick both):**
  1. `metro.config.js`: when `process.env.NODE_ENV !== "production"` (Metro dev server), resolve `@fitbud/contracts` and `@fitbud/api-client` (and the other three mapped packages if they build cleanly from source) to `packages/<name>/src/index.ts`; keep `dist` for EAS release bundles. If a package's source cannot be bundled by Metro (for example `.js` suffix imports), keep `dist` for that one and rely on 2.
  2. `apps/mobile/package.json`: add `"prestart": "pnpm -w run build:packages"` next to the existing `predev`, so `pnpm start` also rebuilds. `npx expo start` bypasses npm scripts, so docs must say to use `pnpm dev`.
- **Bundle commit in dev.** `app.config.js` sets `extra.bundleCommit` from `git rev-parse --short HEAD` (wrapped in try/catch; `"unknown"` if git is unavailable, never fails the build). `BundleCommitBadge` shows `JS <sha>` in small text on the sign-in screen and in the More screen footer **only when `__DEV__`**. If `packages/contracts/dist` is older than its `src` (mtime check in `metro.config.js`), print a one-line warning in the Metro terminal.
- **Rule for AGENTS.md** (add under the coding rules): "A `catch` must not show a message that blames a cause it did not check. Map known error codes to specific copy; show a short error code for everything else; log name, message and zod issue paths in dev. No tokens in logs."

## Gap list
- `apps/mobile/src/screens/AuthScreen.tsx:59`, `:77`, `:116`, `:137`, `:158`: bare `catch {}` blocks each show one fixed cause ("don't match", "Too many codes", "If an account exists...", "didn't work") for every error, including network and parse errors.
- `apps/mobile/src/screens/AcceptInviteScreen.tsx:44`, `:190`, `:218`: same pattern.
- `apps/mobile/src/auth/AuthProvider.tsx:75-85` `messageFromError`: shows raw `error.message` (for a ZodError, a JSON blob) to users.
- `apps/mobile/metro.config.js:23-29`: Metro always bundles `dist`, which `git pull` does not update.
- `docs/LOCAL_TESTING.md:11` tells people to run `expo start`, which skips the package build.
- No way to see which commit a dev bundle came from.
- Written against `main` at 02bd088. Re-check after QT9 (#154) and AB3 merge; line numbers in `AuthScreen.tsx` and `AuthProvider.tsx` will move.

## Acceptance criteria
- [ ] No `catch {` without a binding remains in `AuthScreen.tsx` or `AcceptInviteScreen.tsx`; every catch goes through `authErrors.ts` (or QT9's mapper) and `reportError`.
- [ ] "That code didn't work" appears only for `OTP_INVALID`/`OTP_EXPIRED` (QT9's copy unchanged); "don't match" only for the wrong-credentials code; "Too many..." only for 429.
- [ ] A ZodError on any auth path shows "Couldn't finish signing in (AUTH-PARSE). Try again." and, in dev, logs the issue paths (for the incident: `["tokenKind"]`).
- [ ] No token, refresh token, code or password appears in any log line (test asserts on the `console.warn` arguments).
- [ ] With an out-of-date `packages/contracts/dist`, `pnpm dev` and `pnpm start` both rebuild it, and the Metro dev server bundles package source (or prints the stale-dist warning).
- [ ] Dev builds show `JS <short sha>` on sign-in; release builds do not.
- [ ] `docs/LOCAL_TESTING.md` has a "Stale shared packages" note with the incident, the fix and "start with `pnpm dev`".
- [ ] `AGENTS.md` has the catch rule.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; an EAS release bundle still resolves `dist`.

## Out of scope
- QT9's `verifyCode` catch and its copy. Session persistence (AB3). Adding Sentry or any dependency. API error codes or routes. Trainer web.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception; no auto-send; no percentages or streaks; payments are tracking only; ended clients are read-only.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/AB4-<slug>`, one PR `AB4: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/authErrors.test.ts`: `ApiClientError` 401 `OTP_INVALID` → code copy; 401 wrong-credentials → "don't match"; 429 → `AUTH-RATE`; 500/503 → `AUTH-SRV`; `TypeError("Network request failed")` and `AbortError` → `AUTH-NET`; a real `ZodError` from `authOtpVerifyResponseSchema.parse({...tokenKind:"firebase_id_token_x"})` → `AUTH-PARSE`; plain `Error` → `AUTH-UNK`.
- **Incident regression test** in the same file: build the staging-shaped verify reply (`purpose: "login"`, 1100-char token, `tokenKind: "firebase_id_token"`, refresh token, numeric `expiresIn`, UUID `userId`) and run it through the real `FitBudApiClient.verifyOtp` with a mocked `fetch`; assert it parses. Then parse it with the pre-AU1b enum (`z.enum(["test_id_token","firebase_custom_token"])`) and assert the mapper returns `AUTH-PARSE`, not the code copy.
- `apps/mobile/src/lib/reportError.test.ts`: dev logs name, message and issue paths; never logs `received` values or any field named `token`, `refreshToken`, `code`, `password`; release is a no-op.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a for frames (copy only). Attach screenshots of the `AUTH-NET` and `AUTH-PARSE` messages and the dev `JS <sha>` badge to `docs/qa/AB4/` and the PR.

## Stop conditions
- QT9 (#154) is not merged yet: wait; do not edit `verifyCode`.
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change.
- Metro cannot bundle package source and `prestart` alone cannot make stale `dist` impossible: report, do not invent a third mechanism.
- The task would need a remote command, a secret or a deploy.
