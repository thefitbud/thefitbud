---
id: AB3
title: Keep the mobile session across app kill, restart and Android back (SecureStore on native)
batch: W3
depends_on: [AB2]
lane: build
files_owned:
  - apps/mobile/src/lib/sessionStorage.ts  # native branch added; web branch unchanged
  - apps/mobile/src/lib/sessionStorage.test.ts  # new
  - apps/mobile/src/lib/secureSessionStore.ts  # new: thin expo-secure-store wrapper (mockable)
  - apps/mobile/src/auth/AuthProvider.tsx  # startup restore, refresh-first, failure handling
  - apps/mobile/src/auth/sessionRestore.ts  # new: pure restore state machine
  - apps/mobile/src/auth/sessionRestore.test.ts  # new
  - apps/mobile/package.json  # adds expo-secure-store (the only new dependency)
  - pnpm-lock.yaml
  - apps/mobile/app.json  # "expo-secure-store" in plugins
  - apps/mobile/.maestro/session-persists.yaml  # new QA1 flow
frames: []
model: sonnet
size: M
---

## Outcome
A trainee or trainer who signed in on Android (or iOS) stays signed in after swiping the app away from recents, after a phone restart, and after pressing Android back on the root screen. They are only signed out when they tap Sign out, when the server refuses the session (expired or revoked), or when the account is deleted. A network problem at startup never signs them out.

## Context
- **Symptom** (Firoz, Android dev client, staging, 3 Nov 2026): after a successful sign-in, swiping FitBud away from recents, or pressing the Android back button on the root screen, then reopening the app shows the sign-in screen again.
- **Decision.** D-W3-11 (decided by Firoz, 3 Nov 2026) supersedes D-W2-13: on native the refresh token is persisted in the OS keychain/keystore via `expo-secure-store`. AU1d's "Do not add secure storage" line no longer applies.
- **Root cause on `main` @ 02bd088.**
  - `apps/mobile/src/lib/sessionStorage.ts:12-20` `webStorage()` returns `null` unless `Platform.OS === "web"`. So `loadPersistedSession` (`:26-45`) returns all nulls on native, and `persistRefreshState` (`:51-64`), `persistSession` (`:66-82`) and `persistTokenState` (`:88-96`) are no-ops on native. The tokens live only in the JS heap.
  - `apps/mobile/src/auth/AuthProvider.tsx:89` reads `loadPersistedSession()` once at mount; `:122-143` seeds `createTokenSession` with that (null on native); `:270-273` only calls `refreshSession()` when `persisted.accessToken` is set, which it never is on native. So every cold JS start shows sign-in.
  - **Android back is the same bug, not a separate sign-out.** No `BackHandler` exists anywhere in `apps/mobile/src` and there is no navigation library (`rg BackHandler` returns nothing). On the root screen React Native's default back handler finishes the Activity; reopening re-mounts the JS root, the in-memory session is gone, and the user lands on sign-in. Nothing calls `signOut()` on back (the only callers are `apps/mobile/src/trainee/MoreScreen.tsx:263`, `:635` and the dev-only `apps/mobile/src/dev/CaptureBridgeActivator.tsx:23`, `:29`). Once the session persists, the default back behaviour (background/finish the Activity) is correct and must stay.
- **Refresh flow already exists, reuse it.** In firebase mode (staging and prod) sign-in responses carry `token` (Firebase ID token, about 1 KB, 1 hour), `tokenKind: "firebase_id_token"`, `refreshToken` and `expiresIn` (seconds). `apps/mobile/src/lib/api.ts:143` `pickSessionRefresh` extracts them; `createTokenSession` (`apps/mobile/src/lib/api.ts:181`) holds them and `signIn` is at `:274`. `POST /auth/refresh` (`apps/api/src/routes/auth-login.ts:640`) exchanges a refresh token for a new ID token server-side; it answers `401 AUTH_REFRESH_FAILED` when Google refuses the token (`:692`), `429 RATE_LIMITED` (`:677`), and `400 INVALID_REQUEST`. The client call is `refreshAuth` (`packages/api-client/src/index.ts:419`), which never echoes the token in errors. In `AUTH_MODE=test` (local) there is no refresh token: the test token itself does not expire.
- **What to store (native).** `expo-secure-store` warns above about 2048 bytes per value on some Android versions, so store small values under separate keys and never the 1 KB ID token:
  - `fitbud.refreshToken` (Firebase refresh tokens are a few hundred bytes),
  - `fitbud.session` JSON: `{ v: 1, userId, tokenKind, selectedRole, savedAt }` (well under 1 KB),
  - test mode only (no refresh token): `fitbud.testToken` (the short test token) so local dev also survives a restart.
  - If any value ever exceeds 2000 bytes, do not write it; log a dev warning (no value) and treat the session as memory-only. Do not chunk.
  - Use `keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK` so background restarts can read it.
- **Startup restore (native).**
  1. While reading storage and refreshing, show the existing bootstrapping/splash state, never the sign-in screen (`sessionHydrated` false until resolved).
  2. If a refresh token is stored: call `refreshAuth` → `tokens.signIn(newToken, {refreshToken, expiresIn})` (store the new refresh token; Firebase may rotate it) → `api.me()` → `applyMe` with the stored `selectedRole` if still permitted.
  3. **Definitive auth failure** (`ApiClientError` 400/401/403 from `/auth/refresh`, or 401 from `/me` after refresh): clear SecureStore and memory, show sign-in with "You've been signed out. Please sign in again." (no "code" wording).
  4. **Network error, timeout, 429 or 5xx**: keep SecureStore untouched, keep the user on a "Can't reach FitBud. Check your connection." screen with a Retry button (reuse the provider's `errorMessage` path); never clear the session.
- **Sign out and account deletion.** `signOut` (`apps/mobile/src/auth/AuthProvider.tsx:344`, clears at `:378`) must also delete the three SecureStore keys. There is no account-deletion flow in mobile today; whichever task adds it must call the same `clearPersistedSession()`. Note that here; do not build deletion.
- **Web is unchanged:** localStorage keys and behaviour stay exactly as they are.
- **New native module → new dev build.** `expo-secure-store` is not in `apps/mobile/package.json` today, and Expo SDK 52 dev clients only include modules present at build time. After merge Firoz must run `eas build --profile development --platform android` again; Metro alone will crash with "Cannot find native module 'ExpoSecureStore'". This is W3's one allowed dependency exception (D-W3-11).
- **Security.** Tokens go to SecureStore only, never AsyncStorage, MMKV or files. Never log a token, refresh token or the `fitbud.session` value; log key names and outcomes only.

## Gap list
- `apps/mobile/src/lib/sessionStorage.ts:12-20`: native has no storage, so nothing survives a JS restart.
- `apps/mobile/src/auth/AuthProvider.tsx:89`, `:122-143`, `:270-273`: startup restore only exists for web and only tries `/me` with a stored access token, not a refresh.
- `apps/mobile/src/auth/AuthProvider.tsx:237-268` `refreshSession`: on a non-401 error it sets `errorMessage` but has no retry path; on 401 it clears everything (correct, keep).
- No Maestro flow covers kill and relaunch.
- Written against `main` at 02bd088. The implementer re-checks each item against the latest `main` (QT9, PR #154, touches only `AuthScreen.tsx` and `screens/auth/*`; no overlap).

## Acceptance criteria
- [ ] On Android dev build (staging): sign in, swipe away from recents, reopen → lands on the signed-in home with no sign-in screen flash. Same after Android back on the root screen, and after a phone reboot.
- [ ] Android back on the root screen backgrounds/finishes the app as React Native does by default; no `BackHandler` sign-out is added.
- [ ] Startup with a stored refresh token calls `/auth/refresh` then `/me` exactly once each; the rotated refresh token is written back.
- [ ] `/auth/refresh` 400/401/403 → SecureStore keys deleted, sign-in shown with the signed-out message.
- [ ] Network error / timeout / 429 / 5xx at startup → keys kept, retry screen shown, Retry succeeds once online.
- [ ] Sign out deletes all three keys (asserted in test).
- [ ] No value written to SecureStore is longer than 2000 bytes; the ID token is never written on native.
- [ ] Web behaviour and localStorage keys unchanged (existing tests pass untouched).
- [ ] No token value appears in any `console.*` call (grep in PR).
- [ ] PR description states that a new EAS development build is required.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Account deletion UI or API. Biometric unlock. Multi-account. iOS builds (on hold; the code must still be platform-neutral). Changing `/auth/refresh` or any API code. Error copy on the code screen (QT9) and other auth catches (AB4).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception; no auto-send; no percentages or streaks; payments are tracking only; ended clients are read-only.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/AB3-<slug>`, one PR `AB3: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/sessionStorage.test.ts` (mock `secureSessionStore` with an in-memory map; `vi.mock("react-native", () => ({ Platform: { OS: "android" } }))`):
  - persist then load round trip returns `{ refreshToken, userId, tokenKind, selectedRole }`;
  - the ID token is never written; oversized value (2100 bytes) is not written;
  - `clearPersistedSession()` deletes all keys;
  - with `Platform.OS = "web"` the localStorage path is used and SecureStore is untouched.
- `apps/mobile/src/auth/sessionRestore.test.ts` (pure state machine, mocked `refreshAuth` and `me`):
  - stored refresh token → refresh → me → `signedIn`, and the rotated refresh token is persisted;
  - refresh 401 `AUTH_REFRESH_FAILED` → `signedOut` with keys cleared;
  - refresh network `TypeError("Network request failed")` → `offline`, keys kept;
  - refresh 503 and 429 → `offline`, keys kept;
  - nothing stored → `signedOut` without any request;
  - sign out after restore clears keys.
- `apps/mobile/.maestro/session-persists.yaml` (QA1, staging qa+ account via QT1 test-mode OTP): sign in → assert home → `stopApp` → `launchApp` (no `clearState`) → assert home within 10 s and sign-in not visible → `pressKey: back` → `launchApp` → assert home → `runFlow: common/assert-no-crash.yaml`.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (no new UI beyond the existing bootstrapping state and the existing error/retry text). Attach a short screen recording of the kill-and-relaunch check to the PR if the implementer has a device; otherwise Firoz does it.

## Stop conditions
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change (for example `packages/api-client` or any API route).
- `expo-secure-store` cannot be added at an SDK 52-compatible version (`npx expo install expo-secure-store` picks it).
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
