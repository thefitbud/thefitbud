# FitBud · beta task list (v14)

Updated Sat 31 Oct 2026 (rev 2: Firoz's answers of 31 Oct; Live Activity in beta; no mid-task approvals; Firebase setup; production deploy). Written by Claude Code from task list v13, the code on `main` (50556c8), Cloudflare account state (checked 30 Oct), and Firoz's answers of 30 Oct.

**What this file is.** This is the working list for the **closed beta only**: every task needed for beta, with enough detail for the bots to write self-contained specs. It replaces v13's Beta cut section and the beta tasks' details.
**What it is not.** v13 stays the master list for everything post-beta: redesign phases, seed polish, gap buckets, Phase 10. Don't schedule those until the beta ships.

**Beta target:** Sun 15 Nov 2026 (worst case Mon 30 Nov). Closed: TestFlight (internal + external testers) and a Google Play **closed** testing track only.

---

## 1. Changes from v13, and why

| # | Change | Why |
|---|---|---|
| C1 | **Three dependencies removed:** I4a no longer waits for I2d, X2 no longer waits for F4d, I2c no longer waits for I2e. I2e moves to post-beta. | These were ordering habits, not real code dependencies (see §2). Keeping them pushes the beta past 15 Nov. |
| C2 | **New tasks AU1b and AU1c** (Firebase token exchange and client refresh). | On `main`, login returns a Firebase *custom* token when `AUTH_MODE=firebase` (`apps/api/src/auth/custom-token.ts`), and both clients send it back as the bearer token (`apps/trainer-web/src/auth/*`, `apps/mobile/src/auth/AuthProvider.tsx`). AU1 verifies *ID* tokens, so after AU1 alone every request would get 401 and nobody could sign in. |
| C3 | **X4 split into X4a–X4d; provider is Expo Push Service.** | The `fcm` sender is a stub returning `fcm_not_configured` (`apps/api/src/lib/push-provider.ts`). Mobile registers a synthetic token (`apps/mobile/src/notifications/register.ts`), and trainees never register a device (`AuthProvider.tsx` skips them because the route returned 403). `expo-notifications` is already installed, and Expo's service delivers to both APNs and FCM with credentials kept in EAS, so the Worker needs no Google service-account signing for push. One M task was really four. |
| C4 | **Email OTP only for beta** (Firoz, 30 Oct). The WhatsApp OTP channel is off outside local until post-beta. | WhatsApp OTP needs the Cloud API, an approved template and the `WA_*` secrets, none of which is beta-critical. |
| C5 | **Email provider: ZeptoMail** (Firoz, 30 Oct). I5 is rewritten for it. | On `main`, `EMAIL_PROVIDER` allows only `dev_sink | disabled | resend | ses` (`apps/api/src/types.ts`), and `lib/email.ts` throws for anything but `dev_sink`/`disabled`. No ZeptoMail code exists on `main`. |
| C6 | **New task WD1: trainer-web hosting + custom domains.** | v13 deploys only the API (I6). The trainers' main tool (trainer web), the legal pages (BT3) and every link in emails (`APP_HOST`) need a hosted web app on the real domain. |
| C7 | **New task BT5: beta dress rehearsal** on staging with real phones. | Nothing in v13 checks the whole path end to end: sign up → invite → install from TestFlight/Play → accept → log → reminder push → email OTP. |
| C8 | **New Firoz-only setup task CF2** (Cloudflare, DNS, Firebase, Expo, Apple and Google console steps), replacing the scattered CF1 notes. | The Cloudflare state is now known (see §6). The remaining manual steps need one checklist. |
| C9 | **No mid-task human approval** (Firoz, 31 Oct). Agents.md's "Human approval required" section is replaced by "Decisions and stop rules". | Firoz reviews the finished batch only. Decisions are written into specs and batch files before launch. There is no sign-off step on specs or batch files either (Firoz, 30 Oct): Firoz reads them and launching the batch is the go. Agents still stop when a spec leaves a decision open, or when work would need remote access or production data, which agents never have. |
| C10 | **Stale references fixed.** | Working rule 3 now points to `docs/design/mockups/png/` (the design branch is deleted). `/workspace/qa/...` paths become `docs/qa/...`. The "ZeptoMail email provider" heading is fixed. |
| C11 | **Working rule 2 clarified:** several states of the **same screen and file** may be one task (one commit per frame). Different screens stay separate tasks. | Otherwise bots split one file into many tiny tasks that all collide. |
| C12 | **Each beta task has a batch, lane, model and file area.** | Bots can then write specs and batch files directly from this list. |
| C13 | **Live Activity is in the beta** (Firoz, 31 Oct) as lane LA1–LA3: local updates only, with a cut-line. | Much is already written: the iOS widget UI (`apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift`, 253 lines), the Android notification (`targets/android/WorkoutSetNotification.kt`), the JS state model (`src/notifications/liveActivity.ts`) and the config plugin (`plugins/withLiveActivity.js`). Missing: the build target (`@bacons/apple-targets` isn't installed), a native bridge to start/update/end the activity from the app, and draining the buttons' App Group outbox into the sync outbox. |
| C14 | **New I6b: production deploy** (owner F), after the staging rehearsal. | Beta trainers use real data, so the beta runs on **production**, not staging. v13 had only the staging deploy. |
| C15 | **Firebase setup, app variants and domains specified** (§6). | No Firebase projects exist yet (Firoz, 31 Oct). The domain is `thefitbud.com`, and its mail is on Zoho Mail, which affects SPF. |

## 2. What "false dependency" means (C1)

A dependency is *real* when task B needs code or data that task A creates. It is *false* when B is only listed after A out of habit or tidiness: B could be built, tested and merged without A. False dependencies don't make anything safer; they just make B wait.

- **I4a (wrangler envs) ← I2d (library seed script).** I4a edits `wrangler.toml` to add staging and prod environments. I2d changes how the food/exercise library is uploaded. Neither uses the other's code. The real constraint is that **I7 and I4a both edit `wrangler.toml`**, so they run one after the other in the same lane. Removing this saves the whole library chain (I2b → I2f → I2e → I2c → I2d) from the critical path of staging.
- **X2 (phone build bugs) ← F4d (diet log buttons).** X2 fixes build config: the API URL inlining, the predev script and the react-native-svg pin. F4d is a diet-screen UI bug fix, which is post-beta. Phone builds don't need it.
- **I2c (exercise emitter) ← I2e (demo-seed food remap).** I2c generates the exercise library file. I2e renames *food* slugs in the *demo* seed. v13 itself noted that I2e is only must-have because of this link. The real requirement is that I2c's tests pass on the current demo seed; I2c's spec must say so.

## 3. Decisions

**Locked.** Each decision says who made it. Under C9, Firoz may still override any of them when he reviews a batch.
| ID | Decision | Source |
|---|---|---|
| D-B1 | Beta is closed: TestFlight + Play closed testing only. Must-haves: push + reminders, transactional email, store builds, staging deploy, real sign-in, basic crash reporting, privacy + terms (account deletion by email request for beta), D1 Time Travel + a documented restore. Post-beta: in-app account deletion (BP1), automated backups (BP2). | Firoz, 30 Oct |
| D-B2 | OTP channel for beta: **email only**. | Firoz, 30 Oct |
| D-B3 | Email provider: **ZeptoMail** (India region API `api.zeptomail.in`). | Firoz, 30 Oct |
| D-B4 | I9 dropped (fixed 18 Oct, b5e4278). Payments are tracking only (post-beta tasks; Agents.md updated by #69). | Firoz, 30 Oct |
| D-B5 | Remove the false dependencies (§2). | Firoz, 30 Oct |
| D-B6 | **Server-side token exchange** (AU1b). The API calls Identity Toolkit `accounts:signInWithCustomToken` and returns `idToken`, `refreshToken` and `expiresIn`; a new `POST /auth/refresh` calls the Secure Token API. Clients get no Firebase SDK. | Claude's recommendation, adopted 31 Oct |
| D-B7 | Push via **Expo Push Service**. **Live Activity in the beta**: local updates only, no push-driven updates (LA1–LA3). **Cut-line:** if LA1 doesn't work on Firoz's iPhone by Thu 12 Nov, the beta ships without Live Activity and it arrives in a later TestFlight/Play update. LA never blocks BT1. | Firoz, 31 Oct (Live Activity); Claude (provider) |
| D-B8 | Crash reporting: **Sentry** (`@sentry/react-native` with the Expo plugin; `@sentry/cloudflare` for the Worker), with PII scrubbing. | Claude's recommendation, adopted 31 Oct |
| D-B9 | **No mid-task human approval** (C9). Specs decide auth changes (AU1, AU1b, AU1c, AU2), letting trainees register devices (X4b), and the providers (ZeptoMail, Expo Push, Sentry). | Firoz, 31 Oct |
| D-B10 | Web hosting: a web Worker with static assets at `app.thefitbud.com` that forwards `/api/*` to the API Worker (same origin, like the local Vite proxy, so no CORS and first-party cookies). Mobile calls `api.thefitbud.com` directly. Staging uses `app-staging.thefitbud.com` and `api-staging.thefitbud.com`. | Firoz, 31 Oct |
| D-B11 | Domain **thefitbud.com**. Mail is on **Zoho Mail** (`tech@thefitbud.com`). | Firoz, 31 Oct |
| D-B12 | **Two Firebase projects** (staging, prod) and **two app variants**: production `com.thefitbud.mobile` for the beta, staging `com.thefitbud.mobile.staging` for internal testing, so both can be installed side by side (§6 step 2). | Claude's recommendation, 31 Oct |
| D-B13 | Privacy Policy and Terms are written by **counsel**. Agents build the pages and links only. | Firoz, 31 Oct |

**Open items**
- Firebase project IDs and Web API keys go into W1.md D-W1-3 once Firoz creates the projects (in progress, 31 Oct).
- **Schedule risk:** the counsel's text is needed by **Mon 9 Nov**. BT3 must be live before BT1, because both stores require a privacy-policy URL for testing tracks. If the text is late, publish a short interim policy that counsel signs off, and replace it later.

## 4. Beta task list

**Model:** opus = Opus; plan = opusplan (Opus plans, Sonnet edits); son = Sonnet. **Owner F** = Firoz (manual, not an agent).

| ID | Task | Batch | Lane | Depends on (real only) | Size | Model |
|---|---|---|---|---|---|---|
| CF2 | Cloudflare, DNS, Firebase, Expo, Apple, Google setup (owner F) | W1–W3 | human | — | — | F |
| AU1 | Real Firebase ID token verification | W1 | auth | — | S | opus |
| AU1b | Server-side token exchange + `POST /auth/refresh` (new) | W1 | auth | AU1 | S | opus |
| AU2 | Refuse test modes outside local; email-only OTP outside local | W1 | auth | AU1b | S | opus |
| I7 | Durable Object class to SQLite (`new_sqlite_classes`) | W1 | infra | — | S | son |
| I4a | `wrangler.toml` env.staging / env.production | W1 | infra | I7 | S | son |
| I4b | `MEDIA_PREFIX` + mediaKey helper | W1 | infra | I4a | S | son |
| I4c | Deploy / migrate / seed scripts per env | W1 | infra | I4b | S | son |
| X2 | Phone build bugs (API URL, predev, svg pin) | W1 | mobile | — | S | son |
| X6 | Physical-device guide + `eas.json` / `app.json` profiles | W1 | mobile | X2 | S | son |
| I2b | Locked foods 2026.10.9 library seed | W1 | library | — | M | plan |
| I2f | Library tag fix: dal-lentil-curry-generic not Jain | W1 | library | I2b | S | son |
| I2c | Exercise base emitter (03b) with storage keys | W1→W2 | library | I2f | M | plan |
| I2d | library-seed `--remote` guarded by `--yes`, chunking | W2 | library | I2c | S | son |
| I1b | Query fixes: attention batching, no whole-table reads, user_roles memo | W1→W2 | api-perf | — | M | plan |
| I8 | D1 query budget per invocation + cron query-count test | W2 | api-perf | I1b | S | plan |
| AU1c | Clients store the refresh token and refresh the ID token (new) | W2 | web+mobile auth | AU1b | S | opus |
| I5 | ZeptoMail transactional email | W2 | email | I4c, AU2 | S | son |
| WD1 | Trainer-web hosting (same-origin `/api` proxy) + custom domains + `APP_HOST` per env (new) | W2 | infra | I4c | S | son |
| OB1 | Workers Logs per env | W2 | infra | I4a | S | son |
| OB2 | Logging in scheduled/queue handlers; replace silent `catch {}` | W2 | api-ops | OB1 | S | son |
| X3 | EAS dev build on physical phones (owner F, with the X6 guide) | W2 | human | X6, CF2 | M | F |
| I6 | First staging deploy (owner F) | W2→W3 | human | AU2, I4c, I2d, I5, WD1, CF2 | S | F |
| X4a | Push sender: Expo Push Service + receipts | W3 | push-api | I4a | S | opus |
| X4b | Device registration for trainees and trainers with real Expo tokens | W3 | push-mobile + push-api | X4a, X3 | S | opus |
| X4c | Reminder pushes end to end (meal, workout, check-in) | W3 | push-api | X4a | S | plan |
| X4d | Notification tap → deep link to the right screen | W3 | push-mobile | X4b | S | son |
| BT4 | D1 Time Travel check + restore runbook | W3 | ops-docs | I4a | S | son |
| DS5 | Legal page frame (Privacy, Terms, Credits and licences) (design, human) | W2 | human | — | S | F |
| BT3 | Privacy + Terms pages, in-app links, store URLs | W3 | web | DS5, WD1, legal text (Q3) | S | son |
| BT2 | Basic crash reporting (Sentry, Expo + Worker) | W4 | mobile + api-ops | X3, I4a | S | son |
| LA1 | iOS Live Activity: build target + native bridge (start/update/end, local only) | W2→W3 | mobile-native | X6 | M | opus |
| LA2 | Live Activity buttons → App Group outbox → sync outbox | W3 | mobile-native | LA1 | S | opus |
| LA3 | Android ongoing workout notification (frame 27 Android) via the same outbox path | W3 | mobile-native | LA2 | S | opus |
| BT1 | TestFlight + Play closed-track builds (EAS build + submit) | W4 | mobile + F | X3, X6, BT3 | M | son + F |
| BT5 | Beta dress rehearsal on staging with real phones (new) | W4 | human + QA agent | I6, X4c, X4d | S | F |
| I6b | Production deploy + production library seed (owner F, new) | W4 | human | BT5 passed, CF2 prod secrets | S | F |

Post-beta, before public release: **BP1** in-app account deletion, **BP2** automated D1 backups (v13 details unchanged).
Post-beta: everything else in v13, including I2e (C1), WhatsApp OTP (C4), the open draft PRs #50 AC1a and #57 AC1b, and OB3/OB4. Live Activity is in the beta (C13, LA1–LA3); only APNs push-to-start and push updates are post-beta.

## 5. Task details (for spec writers)

Each spec must paste the relevant bullets below into its **Context** section. Read the named code to fill the Gap list with `file:line`.

### Auth

**AU1 · Real Firebase ID token verification**
- Today `verifyFirebaseIdToken` (`apps/api/src/auth/firebase.ts`) returns `null` when `AUTH_MODE=firebase`.
- Verify RS256 with `jose` `createRemoteJWKSet` against `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`.
- Check: `iss` = `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`; `aud` = project id; `exp`/`iat` valid; `sub` non-empty; `auth_time` ≤ now.
- Used by `routes/auth.ts` and `routes/realtime.ts`. Tests use a local JWKS (no network). `AUTH_MODE=test` is unchanged.

**AU1b · Server-side token exchange + refresh (new)**
- Today `mintAuthToken` (`apps/api/src/auth/custom-token.ts`) returns `{ token, tokenKind: "firebase_custom_token" }` from `/auth/login`, the OTP verify, reset-password and set-password routes (`routes/auth-login.ts`). Clients use it directly as the bearer token.
- In firebase mode, exchange it server-side: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<FIREBASE_WEB_API_KEY>` with `{ token, returnSecureToken: true }`. Return `{ token: idToken, tokenKind: "firebase_id_token", refreshToken, expiresIn }`.
- New `POST /auth/refresh` `{ refreshToken }` calls `POST https://securetoken.googleapis.com/v1/token?key=<FIREBASE_WEB_API_KEY>` (`grant_type=refresh_token`) and returns the new id token, refresh token and expiry. Rate-limit it like login.
- `FIREBASE_WEB_API_KEY` is a var, not a secret (it is a public identifier). Add it to `wrangler.toml` `[vars]` per env in I4a, or here if I4a has merged.
- Contracts: update `packages/contracts/src/auth.ts` (new `tokenKind`, optional `refreshToken` and `expiresIn`). Test mode is unchanged.
- Tests: mocked `fetch` for both Google endpoints, covering success, Google error → 401 with a stable error code, and refresh rotation. Never log tokens.

**AU2 · Refuse test modes outside local; email-only OTP**
- Add `"staging"` to `ENVIRONMENT` in `apps/api/src/types.ts` (today `"local" | "production" | "preview"`).
- When `ENVIRONMENT` is staging or production and any of `AUTH_MODE=test`, `PUSH_PROVIDER_MODE=test` or `EMAIL_PROVIDER=dev_sink` is set, every request returns 500 with error code `RUNTIME_MISCONFIGURED`, and the reason is logged once.
- Part of this already exists: `assertAuthRuntimeReady` in `routes/auth-login.ts` and `DEV_SINK_REFUSED` in `lib/email.ts`. Centralise the check in middleware.
- OTP (D-B2): outside local, `/auth/otp/start` offers only the `email` channel; WhatsApp stays available in local.

**AU1c · Clients store and refresh the token (new, W2)**
- Trainer web (`apps/trainer-web/src/auth/*`, `lib/api.ts`) and mobile (`apps/mobile/src/auth/AuthProvider.tsx`, `lib/api.ts`):
  - store `refreshToken` the same way each app stores its token today (read the code; don't invent new storage);
  - refresh before `expiresIn` runs out, and once on a 401, then retry the request once;
  - on refresh failure, sign out cleanly.
- UI-free except the existing sign-out path.

### Infra and platform

**I7 · Durable Object to SQLite**
- In `apps/api/wrangler.toml`, `[[migrations]] tag "v1-realtime"` uses `new_classes = ["RelationshipRealtimeRoom"]`. Change it to `new_sqlite_classes` before the first remote deploy. Nothing is deployed yet (no Workers exist in the account, checked 30 Oct), so no data migration is needed.

**I4a · Wrangler environments**
- Add `[env.staging]` and `[env.production]` and repeat every binding (Wrangler doesn't inherit them): D1, R2, queue producer and consumer (plus a DLQ), the DO binding, crons, `[vars]`.
- Real resource names (Cloudflare, 30 Oct):
  - D1 `fitbud-staging` (id `1a82ab03-98e8-42e2-863a-11b0c159a468`) and `fitbud-prod` (id `4fba80cf-18bd-48a0-aaaf-40c2bd9c6147`);
  - R2 `fitbud-media-nonprod` (staging) and `fitbud-media-prod` (prod).
- Queues `fitbud-jobs-staging` and `fitbud-jobs-prod`, plus DLQs, are created by Firoz in CF2.
- Per-env vars:
  - `ENVIRONMENT=staging|production`, `AUTH_MODE=firebase`, `PUSH_PROVIDER_MODE=expo`, `EMAIL_PROVIDER=zeptomail`;
  - `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` (from Firoz, CF2);
  - `APP_HOST` (`app-staging.thefitbud.com` / `app.thefitbud.com`);
  - `SYSTEM_EMAIL_FROM`, `SUPPORT_EMAIL`.
- No secrets in toml. The local/default env stays exactly as it is today.

**I4b · MEDIA_PREFIX + mediaKey helper**
- Every MEDIA `put`/`get`/`head`/`delete` goes through `mediaKey()`. Staging uses prefix `staging/` inside `fitbud-media-nonprod`, prod uses none, and keys stored in D1 are env-agnostic.

**I4c · Deploy / migrate / seed scripts**
- Add `deploy:staging|production`, `db:migrate:staging|production` and `seed:library --env <env> --remote --yes` scripts in `apps/api/package.json`.
- Agents add and test the scripts (with `--dry-run` where Wrangler supports it). Only Firoz runs them for real. There is no demo seed for remote envs.

**WD1 · Trainer-web hosting + domains (new)**
- Trainer web calls the API at the relative path `/api` (`apps/trainer-web/src/lib/api.ts`). Locally, Vite proxies `/api/*` to the API and strips the prefix. The API has **no CORS** handling and uses a session cookie (`SESSION_COOKIE_NAME`, `middleware/auth.ts`). So keep production **same-origin**:
  - A web Worker `fitbud-web-<env>` serves the built SPA as static assets, with fallback to `index.html`.
  - It forwards `/api/*` to the API Worker through a **service binding**, stripping `/api` exactly like the Vite proxy.
  - Result: no CORS, and the cookies stay first-party.
- Domains:
  - web on `app-staging.thefitbud.com` and `app.thefitbud.com`;
  - API also on `api-staging.thefitbud.com` and `api.thefitbud.com`, for the mobile app, which is native and doesn't need CORS.
- Set `APP_HOST` per env (links in emails). Add the deploy script for web; Firoz runs it, agents never deploy.
- If the spec writer finds a reason this can't work, stop and add a decision. Don't add CORS on a whim.

**OB1 · Workers Logs**
- `[env.staging.observability]` enabled at 100%; `[env.production.observability]` `head_sampling_rate = 0.2`. Local is unaffected.

**OB2 · Logging in scheduled/queue handlers**
- Structured logs at start, end and error of `scheduled()` and `queue()`.
- Replace the bare `catch {}` blocks in `domain/reminders.ts` and `jobs/reminders.ts`. v13 listed lines 231, 243, 795, 816, 844, 860, 880 and 54; re-check on `main`.
- `app.onError` logs route, method, request id and user id. Never tokens, names, notes or health data.

**I1b / I8 · Query fixes and query budget**
- I1b: `inArray` batches ≤ 90 params; filter by the trainer's clients instead of whole-table reads; per-request `user_roles` memo (in `apps/api/src/auth/identity.ts`). Add query-count tests.
- I8: a query-count test for the cron path at demo-seed scale, plus `db.batch` where loops issue per-relationship queries. Workers Paid (1,000 queries per invocation, 30 s CPU) removed the immediate blocker, so I1b/I8 may slip to just after the beta without blocking it.

### Library

**I2b, I2f, I2c, I2d**: unchanged from v13, apart from these points.
- **I2b:** 1,243 foods, one default serving each; D6 value sets (4 food types incl. beverage; cooking states raw / cooked / ready_to_eat / as_purchased); replace files 01–06 + manifest with sha256 checked; 08_post_seed / 02b extras.
- **I2f:** remove the Jain tag from dal-lentil-curry-generic as a post-seed correction in 08_post_seed (D18). The locked 01–06 files and their sha256 stay unchanged.
- **I2c:** `emit-exercise-base.ts` → `03b_exercise_base.sql`; keys `exercises/<slug>/<n>.<ext>`; 1,362 exercises; `foreign_key_check` empty. **Its tests must pass on the current demo seed without I2e** (C1).
- **I2d:** file list 01, 02, 02b, 03, 03b, 04, 05, 06, 08; remote skips 00/07; split files > 5 MB; `--remote` requires `--yes`. The agent never runs remote.

### Email

**I5 · ZeptoMail**
- Add `"zeptomail"` to `EMAIL_PROVIDER`.
- Send with `POST https://api.zeptomail.in/v1.1/email`, header `Authorization: Zoho-enczapikey <token>`, from `SYSTEM_EMAIL_FROM`.
- The token is the secret `ZEPTOMAIL_TOKEN`, set by Firoz (CF2), and is never logged.
- Map provider errors to a stable error; keep the dev sink for local. Tests use a mocked `fetch`.
- Covers every template `lib/email.ts` sends today (OTP codes, invites, password reset, system alerts). List them in the spec from the code.

### Mobile and push

**X2 · Phone build bugs**: from v13.
- Read `process.env.EXPO_PUBLIC_API_BASE_URL` literally so Expo inlines it (`apps/mobile/src/lib/api.ts`).
- `predev` and `predb:reset` filters: `pnpm --filter thefitbud build:packages` → `pnpm -w run build:packages`. CI shows "No projects matched the filters".
- Pin `react-native-svg` to the SDK 52 version (`npx expo install react-native-svg`, 15.8.0).

**X6 · Device guide + EAS profiles**
- Create `apps/mobile/eas.json` (none exists) with `development` (dev client), `preview` (staging API) and `production` profiles, each with its own `EXPO_PUBLIC_API_BASE_URL`.
- Two app variants (D-B12), via `app.config.js` reading the EAS profile:
  - production `com.thefitbud.mobile`, display name "FitBud", API `https://api.thefitbud.com`;
  - staging `com.thefitbud.mobile.staging`, display name "FitBud Staging", API `https://api-staging.thefitbud.com`;
  - development: dev client, local or staging API.
- Keep the Live Activity App Group per variant (`group.com.thefitbud.mobile[.staging]`).
- `google-services.json` per variant comes from Firebase (§6 step 2). Load it through an EAS file env var, not a committed file.
- Write `docs/runbooks/physical-device.md`. Expo Go can't run this app (SDK 52 with native targets); use a dev build.

**X3 · Dev build on phones (Firoz)**: follow the X6 guide; never paste credentials in chat.

**X4a · Expo push sender**
- Add `PUSH_PROVIDER_MODE=expo`.
- Send with `POST https://exp.host/--/api/v2/push/send` in batches ≤ 100, optional `EXPO_ACCESS_TOKEN` secret.
- Record provider acceptance (ticket ids) separately from delivery. A later job fetches receipts (`/--/api/v2/push/getReceipts`) and marks `DeviceNotRegistered` tokens inactive.
- Payloads carry routing only (`buildSafePushPayload`): no coaching details.
- Keep the test double for local.

**X4b · Real device registration, trainees included**
- Mobile: request permission, get `Notifications.getExpoPushTokenAsync({ projectId })`, and register for **both** roles.
- Today trainees are skipped (`AuthProvider.tsx` ~L148) because `/notifications/device-tokens` returns 403 for them. Allow trainees to register their own device, an authorization change decided in D-B9.
- Re-register on token change; unregister on sign-out.
- Backend and mobile parts may be two PRs (backend first).

**X4c · Reminder pushes end to end**
- The existing cron and queue reminders (meal, workout, check-in) send through X4a for both trainee and trainer notification types.
- Respect quiet hours, dedupe, and notifications-off.
- Tests for one reminder of each type, from schedule to provider call (mocked).

**X4d · Tap → deep link**: use `deepLinkFromNotificationPayload` (`apps/mobile/src/notifications/routing.ts`). Opening a notification navigates to the right screen, then refetches state.

### Live Activity (C13, D-B7)

These tasks need a **dev build on a real device**. Agents can't compile Swift or run iOS in the cloud (Linux), so each spec includes a device test checklist that Firoz runs on his EAS dev build (X3) and reports back. Frames: `27-*`, `27b-*`, `27c-*` (iOS), `27-*android*` in `docs/design/mockups/png/`. Use exact file names. There is no rest timer (per the existing code and plugin comments).

**LA1 · iOS Live Activity: target + bridge**
- Add `@bacons/apple-targets`, at a version compatible with Expo SDK 52, to the plugins. The `targets/FitBudLiveActivity` widget (deployment target 17.0, App Group) must build in EAS.
- Add a small native module (Expo Modules API, Swift) exposing `start(state)`, `update(state)` and `end()` for `FitBudWorkoutAttributes`, with a JS wrapper next to `src/notifications/liveActivity.ts`.
- When the trainee starts a workout, the app starts the activity. Each set logged in the app updates it; finishing or skipping ends it.
- **Local updates only.** No APNs push-to-start or push updates; that is post-beta.
- No-op on Android, web and older iOS. JS tests cover the wrapper calls.

**LA2 · Buttons → sync outbox**
- The widget's `LiveActivityIntent` buttons already append `workout.log_set` rows to the App Group (`LiveActivityOutbox` in the Swift file).
- When the app becomes active, drain those rows into the SQLite sync outbox, each with one stable mutation UUID and idempotency key (Agents.md offline rules). Clear only what was drained, and skip duplicates.
- Tests: drain logic, idempotency, and a duplicate tap that doesn't double-log.

**LA3 · Android ongoing notification**
- Wire `targets/android/WorkoutSetNotification.kt` through a config plugin/module: an ongoing notification with −/+ weight, −/+ reps and Log set actions, matching frame 27 Android, through the same outbox path as LA2.
- Notification channel; it respects notifications-off.

### Ops, legal and release

**BT4 · D1 Time Travel + restore runbook**
- All three D1 databases are on the current storage backend (version "production"), which supports Time Travel.
- Write `docs/runbooks/d1-restore.md`: `wrangler d1 time-travel info`, choosing a bookmark or timestamp, `wrangler d1 time-travel restore`, verifying, redeploying.
- Firoz rehearses it once on staging.

**DS5 · Legal page frame (human)**: Privacy, Terms, and "Credits and licences" (per CC BY-SA image: title, author, source, licence). Web and mobile frames go into `docs/design/mockups/png/`.

**BT3 · Privacy + Terms pages**
- Public trainer-web routes `/privacy` and `/terms`, plus the D7 credits section.
- Links from sign-in, Settings and More (both mobile modes) and trainer web.
- The text comes from Firoz or counsel (Q3). The privacy text states that account deletion is by email request to `SUPPORT_EMAIL` during the beta.
- Gives stable URLs for the store listings.

**BT2 · Crash reporting (Sentry)**
- Mobile: `@sentry/react-native` with the Expo config plugin. Worker: `@sentry/cloudflare`.
- Release and environment tags; staging and prod only.
- `beforeSend` scrubs names, emails, notes and health data.
- The DSN goes in config; `SENTRY_AUTH_TOKEN` (source maps) is an EAS/CI secret set by Firoz.

**BT1 · Store builds**
- EAS production builds; `eas submit` to TestFlight (internal + external groups) and a Play closed track.
- Store records: privacy questionnaire / Data safety, privacy URL (BT3), HealthKit/Health Connect declarations only if steps ship (they don't in the beta cut).
- Agents prepare config and a checklist. Firoz runs submit and the consoles.

**BT5 · Dress rehearsal (new)**
- On **staging**, with the **staging app variant** on 2 phones (1 iOS, 1 Android; EAS internal distribution) and `app-staging.thefitbud.com`:
  1. A trainer signs up with email OTP (ZeptoMail arrives).
  2. The trainer invites a trainee; the trainee installs, accepts and completes intake.
  3. The trainer reviews and publishes a plan.
  4. The trainee logs a meal and a workout.
  5. A reminder push arrives and opens the right screen.
  6. The trainer sees the exception on Home.
  7. A crash test event shows up in Sentry.
  8. If LA1–LA3 made the cut-line: starting a workout shows the Live Activity / ongoing notification, and Log set from it syncs.
- A QA agent writes the checklist and report (`docs/qa/QA-BT5.md`). Firoz runs it.
- Any failure becomes a beta-blocker task. Once BT5 passes, Firoz runs **I6b** (production deploy + production library seed + production secrets). The beta builds (BT1) use the production variant.

## 6. Firoz-only setup (CF2)

**Already in place** (Cloudflare checked 30 Oct by Claude):
- Workers Paid and the budget alert.
- D1 `fitbud-dev`, `fitbud-staging`, `fitbud-prod` (all empty).
- R2 `fitbud-media-nonprod`, `fitbud-media-prod`.
- Domain and mailbox on the custom domain; Apple and Google developer accounts.
- No Workers deployed yet. No KV (none needed).

**To do**, in this order (each step says which task needs it):
1. **Queues** `fitbud-jobs-staging`, `fitbud-jobs-prod` plus DLQs `fitbud-jobs-staging-dlq`, `fitbud-jobs-prod-dlq` (dashboard → Queues). Needed by I4a and I6.
2. **Firebase: two projects** (D-B12). Local dev needs none (`AUTH_MODE=test`).

   | Display name | Project ID (request) | Used by |
   |---|---|---|
   | FitBud Staging | `thefitbud-staging` | API staging, app variant `com.thefitbud.mobile.staging` |
   | FitBud | `thefitbud-prod` | API production, app variant `com.thefitbud.mobile` (beta) |

   - If an ID is taken, Firebase suggests a suffix. **Use whatever it gives and paste the real IDs into W1.md D-W1-3.**
   - Turn **off** Google Analytics. The free Spark plan is enough.
   - **Authentication → Get started** in each project. No sign-in providers need enabling: the API checks passwords and email OTP itself and only uses custom tokens.
   - **Web API key:** Project settings → General. If none shows, add a Web app (no hosting). It goes into I4a as `FIREBASE_WEB_API_KEY`; it is a public identifier.
   - **Service-account key:** Project settings → Service accounts → Generate new private key. This becomes the Worker secret `FIREBASE_SERVICE_ACCOUNT_JSON` for that env. Keep it in your vault; never in chat or the repo.
   - **Android app** in each project with the variant's package name; download `google-services.json` (used by X6 through an EAS file env var).
   - Upload an **FCM V1 service-account key** for each project to EAS (step 3), so Expo can deliver Android push.
   - No iOS app is needed in Firebase: Expo sends iOS push through APNs.
3. **Expo/EAS:** create the project, link the bundle ids, upload the APNs key (EAS can create it with the Apple account) and the FCM V1 service-account key. Optional: an access token for push (`EXPO_ACCESS_TOKEN`). Needed by X3, X4, BT1.
4. **App Store Connect:** app record, bundle id, TestFlight internal and external groups. **Play Console:** app record, closed testing track, testers list. Needed by BT1.
5. **ZeptoMail:** add the sending domain and a mail agent, and get the send token (`ZEPTOMAIL_TOKEN`). Needed by I5.
6. **DNS** (Cloudflare):
   - ZeptoMail's DKIM TXT and bounce CNAME.
   - **Merge** ZeptoMail into the existing Zoho SPF TXT record. A domain may have only one SPF record. Keep Zoho's `include:` (e.g. `zoho.in` or `zoho.com`, whichever is there now) and add the include value ZeptoMail shows on its domain page, giving `v=spf1 include:<zoho> include:<zeptomail> ~all`. Don't create a second `v=spf1` record. Zoho's and ZeptoMail's DKIM records use different selectors, so they coexist.
   - Send system mail from an address like `no-reply@thefitbud.com`, with replies going to `tech@thefitbud.com`. Set it in `SYSTEM_EMAIL_FROM` (I4a).
   - Custom domains `api.thefitbud.com`, `api-staging.thefitbud.com`, `app.thefitbud.com`, `app-staging.thefitbud.com`, attached during the I6/I6b deploys (WD1).
7. **Sentry:** an org and two projects (mobile, api); DSNs and an auth token. Needed by BT2.
8. **Worker secrets per env**, at the staging deploy (I6) and again for production (I6b): `FIREBASE_SERVICE_ACCOUNT_JSON`, `MEDIA_SIGNING_SECRET`, `ZEPTOMAIL_TOKEN`, `EXPO_ACCESS_TOKEN` (optional), `SENTRY_DSN`. `WA_*` aren't needed for beta (C4).
9. **Rotate the Confluence credentials** (open item from CF1).

## 7. Batches

**At most 3 agent tasks run at once** (one Max seat). Owner-F items run in parallel with agents.

| Batch | Lanes (in order) | Firoz in parallel | Target |
|---|---|---|---|
| **W1** | auth: AU1 → AU1b → AU2 · infra: I7 → I4a → I4b → I4c · mobile: X2 → X6 · library: I2b → I2f (→ I2c) · api-perf: I1b if a slot is free | CF2 steps 1–5; DS5; legal text (Q3) | merged by Wed 4 Nov |
| **W2** | web+mobile auth: AU1c · email: I5 · infra: WD1 → OB1 · api-ops: OB2 · library: I2c → I2d · api-perf: I8 · mobile-native: LA1 (starts once X6 is merged) | X3 dev build; CF2 steps 6–8; **I6 first staging deploy** | staging up by Sat 7 Nov |
| **W3** | push-api: X4a → X4c · push-mobile: X4b → X4d · web: BT3 · ops-docs: BT4 · mobile-native: LA2 → LA3 (LA cut-line Thu 12 Nov) | Time Travel rehearsal; push on devices | push on devices by Tue 10 Nov |
| **W4** | mobile/api: BT2 · release: BT1 (agents prepare, Firoz submits) · QA: BT5 checklist | BT5 rehearsal on staging (Thu 12 Nov) → **I6b production deploy** → TestFlight external review (~1–2 days) + Play closed track | invites out Sun 15 Nov |

`docs/specs/batches/W1.md` is the draft for W1. The bots update it from this section, then draft W2–W4. Specs for a batch are written once the previous batch's decisions are made.

## 8. Rules (updated)

- **Working rule 2 (clarified, C11):** one task is one bug, one migration, or one screen. Several states of the **same screen and file** may be one task with one commit per frame. Size S, M only if unavoidable, never L.
- **Working rule 3 (fixed, C10):** every brief names its frames from `docs/design/mockups/png/` by file name.
- **QA reports** live in `docs/qa/`. Any `/workspace/qa/...` path in v13 means `docs/qa/...` once W0b lands.
- All other v13 working rules (1, 4–9) and product rules are unchanged. They are also in `CLAUDE.md`.
