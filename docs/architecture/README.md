# FitBud · reverse-engineered architecture

Generated 12 Nov 2026 from the repository at `main` (`8f2704c`). Implementation and config were treated as the source of truth; docs were used only to cross-check. Diagrams: [diagrams.md](diagrams.md) (34 Mermaid blocks, all parse-checked with mermaid-cli 11; not visually reviewed one by one).

Evidence classes: **Confirmed** = in code/config. **Inferred** = derived logically. **Unknown** = not determinable from the repo.

## 0. What was and was not available

| Requested source | Found? |
|---|---|
| BRD / FRD / HLD / LLD | **No such files.** Closest: `docs/spec/00–10*.md` (product rules, flows, API changes), 160+ task specs in `docs/specs/`, batch files `docs/specs/batches/W*.md` (decisions `D-Wn-x`), `docs/spec/{mobile,trainer-web}/*` screen specs. "Technical Architecture" and the guide are Confluence-only (referenced, not in repo). |
| API specification | Generated OpenAPI served at `/openapi.json` and `/docs` (Scalar); contracts in `packages/contracts` (zod). |
| DB schema | `apps/api/src/db/schema.ts` (Drizzle, 88 tables) + `apps/api/drizzle/42 files`. |
| Source code | Full monorepo (pnpm + turbo). |
| IaC (Terraform/CloudFormation) | **None.** Infra is `wrangler.toml` ×2 (API, trainer-web) plus dashboard-created resources (`docs/runbooks/staging-setup.md`). No Dockerfile/compose. |
| CI/CD | `.github/workflows/{ci,qa,design-review}.yml`; `apps/mobile/eas.json`; deploy runbooks. |
| AWS | **Not used.** No VPC, subnets, AZs or security groups exist. Diagram C1/C2 use Cloudflare bindings and trust boundaries instead; nothing was invented to fit AWS notation. |

## 1. Component and service inventory

Deployment location for every Worker is Cloudflare's network (placement not configured → **Inferred**: default global/smart placement by platform). Environments: `local`, `staging`, `production`.

| # | Component | Responsibility | Inputs → outputs | Dependencies | Protocol | Deployment | Security boundary | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | **Trainer Web SPA** (`apps/trainer-web/src`, React 19 + Vite 6) | Online-only trainer UI (triage, clients, plans, check-ins, templates, settings) | User input → REST calls, WS hints | `api-client`, `contracts`, `core`, `tokens`, `brand` | HTTPS `/api/*`, WSS `/api/realtime` | Static assets in Web Worker (`dist/`) | Browser; holds bearer token + HttpOnly session cookie | Confirmed |
| 2 | **Web Worker** `fitbud-web-<env>` (`apps/trainer-web/worker/index.ts`) | Serve SPA; proxy `/api/*` (prefix stripped) and `/i/*` to API; same-origin | Request → Response | `API` service binding, `ASSETS` | Service-binding fetch | `app-staging.` / `app.thefitbud.com` custom domains | Edge; no secrets, no auth logic | Confirmed |
| 3 | **API Worker** `fitbud-api-<env>` (`apps/api/src/index.ts`, Hono) | All authn/authz, domain rules, sync, jobs, OpenAPI | REST JSON (envelope `ok/fail`), queue batches, cron ticks → D1/R2/Queue/DO writes, external calls | D1, R2, Queue, DO, Firebase, Expo, ZeptoMail, WhatsApp, Sentry | HTTPS in; HTTPS out | `api-staging.` / `api.thefitbud.com`; `ENVIRONMENT` var | **The authorization boundary**; secrets as Worker secrets | Confirmed |
| 4 | **Mobile App** (`apps/mobile`, Expo ~52 (inferred from package versions), RN) | Role-aware trainer + trainee app: today/diet/workout/check-in, sync outbox, push, Live Activity (iOS widget target), steps (HealthKit / Health Connect) | Touch, push, health data → REST/sync/WS | `api-client`, `ui-mobile`, `core`, expo-notifications, expo-secure-store, expo-health-connect | HTTPS Bearer + `X-FitBud-Role`; WSS `?access_token` | App stores via EAS (TestFlight / Play closed testing) | Device; Bearer ID token | Confirmed |
| 5 | **D1 `DB`** (`fitbud`, `fitbud-staging`, `fitbud-prod`) | Authoritative state; only API touches it | SQL (Drizzle) | – | binding | Cloudflare D1 | Private binding | Confirmed |
| 6 | **R2 `MEDIA`** (`fitbud-media-preview`/`-nonprod`/`-prod`; staging key prefix `staging/`) | Photo/avatar bytes; ownership metadata is in D1 `media_assets` | put/get | – | binding | Cloudflare R2 | Private; access only via API with session or HMAC-signed `exp`/`sig` | Confirmed |
| 7 | **Queue `REMINDER_QUEUE`** (`fitbud-jobs-{dev,staging,prod}`, DLQ staging/prod) | Reminder delivery jobs `{notificationId, deliveryId}` | API producer → API consumer (batch ≤10, ≤3 retries) | – | binding | Cloudflare Queues | Private | Confirmed |
| 8 | **DO `RelationshipRealtimeRoom`** | Per-relationship WebSocket fan-out of change hints (hibernation API); stores no domain state | `POST /broadcast`, WS upgrade | – | `stub.fetch`, WSS | Durable Object, `new_sqlite_classes` migration `v1-realtime` | WS accepted only after API actor/ownership check | Confirmed |
| 9 | **Cron Trigger** `*/5 * * * *` | Runs `cron.reminders`, `replenishment` (rolling 7-day assignment horizon), `coach_ask` maintenance, `account_purge`, `push_receipts` in order | tick → jobs | D1, Expo | `scheduled()` | all envs | internal | Confirmed |
| 10 | **Firebase Auth** (projects `thefitbud-staging`, `thefitbud-prod`) | Token issuer: API mints **custom tokens**, exchanges server-side for ID+refresh tokens; verifies ID tokens; no client SDK | custom token → ID/refresh token | – | HTTPS (identitytoolkit, securetoken) | Google | External | Confirmed |
| 11 | **Expo Push Service** | Push send + receipts (APNs/FCM creds held in EAS) | tokens+payload (routing only) → tickets | – | HTTPS `exp.host` | Expo | External | Confirmed |
| 12 | **ZeptoMail (IN)** | OTP, invite, password-changed, admin alert emails (`EMAIL_PROVIDER`; `dev_sink` locally) | email → delivery | – | HTTPS | Zoho | External | Confirmed |
| 13 | **WhatsApp Cloud API (Meta)** | Template sends, status/STOP webhooks, budget ledger; **flags `wa_otp`/`wa_automation` off** | – | – | HTTPS Graph v21.0; inbound webhook | Meta | External; webhook signature `WA_APP_SECRET` | Confirmed (built); live usage Unknown |
| 14 | **Sentry** | Crash reporting; active only when `SENTRY_ENVIRONMENT` is staging/production and `SENTRY_DSN` set | errors | – | HTTPS | Sentry | External | Confirmed |
| 15 | **GitHub Actions** (`ci`, `qa`, `design-review`) | PR gate; nightly staging QA; screenshot-vs-frame report | – | Cloudflare token only for QA seeding | – | GitHub | CI secrets by name | Confirmed |
| 16 | **EAS Build/Submit** (`eas.json`: development / preview / production) | Mobile builds; submit manual | – | – | – | Expo | – | Confirmed |
| 17 | **Packages**: `contracts` (zod schemas, errors), `core` (pure rules: reminders, exceptions, dates), `api-client` (typed client), `ui-mobile`, `tokens`, `brand`, `config` (SLO constants) | Shared libs | – | – | build-time | – | – | Confirmed |

### API Worker route groups (Confirmed, `index.ts`)
`/health /config /dev(local) /auth /me /invitations /i /relationships /subscriptions /onboarding /configurations /plans /templates /libraries /clients /workouts /meals /checkins(+/form-templates) /exceptions(+/bulk) /strength /client-settings /steps /account /progress /history /workspaces /files /sync /notifications /realtime /coach-asks /activity /links /webhooks/whatsapp /openapi.json /docs`.

### Actors
Trainer (web + mobile), Trainee (mobile), Owner/Ops (Firoz; manual deploys, DNS, secrets, store consoles), planning/coding agents (repo-only, no remote commands), Meta webhook sender. Roles: `trainer`, `trainee` (`user_roles`); a user may hold both (`X-FitBud-Role` selects). No organization/team roles (by product rule).

### Authentication and authorization (Confirmed)
- Two credentials: cookie `fitbud_session` (trainer web; HttpOnly, Secure, SameSite=Lax; `web_sessions`) **or** `Authorization: Bearer <Firebase ID token>` (mobile, and web client also stores one).
- Sign-in: password (`/auth/login`, lockout after 10 failures for 15 min, generic `INVALID_CREDENTIALS`, IP rate limit → 429) or email OTP (`/auth/otp/*`, purpose proof `otpProof`) → API mints custom token → Firebase exchange → tokens; refresh via `/auth/refresh`.
- Actor resolved server-side per request (`loadActorBy…`); `requireRole`; relationship ownership checked per route; account states `active|disabled|archived` (archived → 403 `ACCOUNT_ARCHIVED` except 3 routes); ended relationships read-only (`RelationshipEndedError`).
- Test doubles (`AUTH_MODE=test`, `PUSH_PROVIDER_MODE=test`, `dev_sink`, fixed QA OTP) are refused outside local/staging by `runtimeGuardMiddleware`.

### Sync vs async communication (Confirmed)
- **Sync:** all REST; SPA→Web Worker→API (service binding); API→Firebase/ZeptoMail/Expo send.
- **Async:** Cron→jobs; API→Queue→API consumer→Expo; API→DO→WebSocket hints; mobile outbox→`/sync/push` (deferred by connectivity); Expo receipts polled 15 min–24 h later; WhatsApp webhook inbound.
- **Retry/failure:** queue retries ≤3 then DLQ; cron jobs isolated, first failure rethrown; realtime emit swallows errors; sync mutations idempotent via `sync_mutations` + idempotency records; OTP/login rate limits; token exchange distinguishes `invalid` (re-login) from `unavailable` (don't sign out); provider email errors → 502/503 static codes; all other errors → `INTERNAL_ERROR` with `requestId`.

## 2. Diagram guide (short explanation of each)

| ID | Diagram | What it shows |
|---|---|---|
| A1 | Lifecycle swimlane | Invite → accept → intake → review → configure → plan → execution → exceptions → end/reactivate; human vs automated lanes; rejection paths |
| A2 | Exception handling | Detection, dedupe, ended-period skip, acknowledge/resolve/undo; late log never auto-closes |
| A3 | State machines (10) | relationship, invitation, exception, plan version, configuration, assignment/execution, check-in, notification delivery, media asset, account |
| B1 | C4 Context | FitBud and external systems |
| B2 | C4 Container | Web Worker, API Worker, D1, R2, Queue, DO, Cron, SPA, Mobile + externals with protocols |
| B3 | Component (API) | Middleware chain, routes, domain, auth, lib, jobs, realtime |
| B4 | Service dependency | App/package/service dependency directions; sync vs async |
| B5 | External integrations | Endpoints, secrets and failure handling per provider |
| C1 | Cloud architecture | Per-environment Cloudflare resources and bindings (no AWS equivalent exists) |
| C2 | Trust/network boundaries | Untrusted clients → edge → API gate → private bindings → SaaS egress; secrets list |
| C3 | CI/CD | PR gate, review/merge rules, manual deploy order, EAS, nightly QA |
| D1–D7 | Sequences | web sign-in; invite/OTP accept; offline sync push/pull; reminder cron→queue→push→receipts; plan publish/assign; realtime; media upload |
| D8 | DFD level 1 | Processes, data stores, external entities |
| D9a–e | ER (Crow's Foot) | identity/relationship; onboarding/plans; execution/check-ins; exceptions/notifications/sync; library/WhatsApp |
| D10 | Event-driven | Sources, queue/DO/change_log, consumers, delivery semantics |

## 3. Architectural assumptions and unknowns

| # | Item | Class |
|---|---|---|
| A-1 | Placement/region of Workers, D1 and R2 is not configured; assumed platform default. | Inferred |
| A-2 | Which hosts, secrets and queues actually exist in production is not in the repo (dashboard-created; `staging-setup.md` statuses were last updated 31 Oct and some say "Check"). | Unknown |
| A-3 | Whether production is deployed yet (I6b) cannot be determined from the repo. | Unknown |
| A-4 | `bumpRateLimit(…, 15, 30)` window semantics (requests per window / window length) not inspected. | Unknown |
| A-5 | Order of steps inside plan publish/assign (D5) is inferred from route and table names. | Inferred |
| A-6 | Media bytes pass through the API Worker rather than R2 pre-signed URLs (D7). | Inferred |
| A-7 | Mobile token storage uses `expo-secure-store` (dependency present; call sites not traced). | Inferred |
| A-8 | Plan version `scheduled → effective` automatic promotion and `published → scheduled/effective` mapping are derived from enum values and `assign` route, not traced to a single function. Arrows marked `*` in A3. | Inferred |
| A-9 | Invitation `reissue` creating a new pending invitation vs resetting the old one (A3 arrow marked `*`). | Inferred |
| A-10 | Whether WhatsApp Cloud sends are live anywhere; flags default off. | Unknown |
| A-11 | Real traffic, scaling and cost versus the SLO guardrails in `wrangler.toml` comments. | Unknown |
| A-12 | Exact deletion/retention behaviour of `cron.account_purge` beyond `purgeAfter` (not traced). | Unknown |
| A-13 | Notification state `uncertain` and `deferred`: transitions drawn from enum + provider-status semantics; not each traced. | Inferred |

## 4. Discrepancies: documentation vs implementation

| # | Documentation says | Implementation shows | Severity |
|---|---|---|---|
| D-01 | `apps/api/wrangler.toml` header: "reminder cron ~every 15m". | `crons = ["*/5 * * * *"]` in all three envs; comment next to it also says every 5 minutes. | Low (stale comment) |
| D-02 | AGENTS.md "Offline (mobile): write to SQLite before enqueueing in the outbox". | `apps/mobile` has **no SQLite dependency**. The sync store is `createMemorySyncStore()`; the "durable" variant persists a snapshot to `localStorage` and is used only where `localStorage` exists (web). `engine.ts` calls the memory store "environments without native SQLite". On native iOS/Android the outbox appears to be **in-memory only** (lost on app kill) — unless another persistence path exists that I did not find. | **High** — contradicts the offline invariant and the "don't claim offline support until restart is tested" rule. Needs a decision. |
| D-03 | `docs/spec/07-code-map.md` points to `apps/api/src/domain/otp.ts`, `routes/notes.ts`, `domain/whatsapp-templates.seed.ts`. | None of the three files exist; OTP is in `routes/auth-login.ts` + `auth/*`; notes are `routes/checkins.ts` (`/notes`), `me-coach-notes.ts`, `domain/trainer-note-share.ts`. (The doc already warns it is stale.) | Low |
| D-03b | Same doc: "WhatsApp Cloud API built, flags off". | Matches. Listed for completeness. | – |
| D-04 | AGENTS.md architecture map lists `api-client, contracts, core, config, ui-mobile`. | Workspace also has `packages/brand` and `packages/tokens`, used by trainer-web and mobile. | Low |
| D-05 | AGENTS.md: "Durable Objects/WebSockets only for selected change notifications". | Matches (hints only). But realtime hints are consumed by trainer-web (`useHomeSections`, `AttentionViewPage`), mobile trainee (`TraineeShell`) and mobile trainer (`AttentionTab`); not by every screen. | Info |
| D-06 | `Env.PUSH_PROVIDER_MODE` documents `fcm` and `device_tokens.provider` allows `fcm`. | Only `expo` and `test` are implemented/configured ("kept for compatibility"). Dead option in schema/types. | Low |
| D-07 | `staging-setup.md` lists queues/DLQ and ZeptoMail as "Check/To do". | `wrangler.toml` already references all four queues + DLQs and `EMAIL_PROVIDER = "zeptomail"` for staging and production; the doc's statuses are dated 31 Oct. | Low (doc age) |
| D-08 | Local `wrangler.toml` queue consumer has no DLQ; staging/prod have. | Local differs by design; failure path in D4 applies to staging/production only. | Info |
| D-09 | `apps/trainer-web/wrangler.toml` comments: same origin, "first-party cookies". | Trainer web uses **both** a cookie session and a stored bearer token (`establishTrainerSession`), so the "cookie, first-party only" description in `trainer-web/wrangler.toml` comments is incomplete. | Low |
| D-10 | HLD/LLD/BRD/FRD requested. | None in repo; Confluence is reference-only by decision D-W2-10 and was not available. Anything only in Confluence is **Unknown**. | Info |

## 5. Cross-check performed
- Every route prefix in B3/D8 appears in `index.ts`; every table in D9 exists in `schema.ts` and every ER relationship was re-derived from `references()` calls (relationships without an FK are drawn as such or noted "no FK").
- Enums in A3/D9 are copied from `schema.ts`. Binding/queue/DO/cron names and domains in C1 are copied from the two `wrangler.toml` files and `docs/runbooks/trainer-web-deploy.md`.
- Mermaid syntax validated for all 34 blocks.
- Not done: no running of the app, no read of production state, no line-by-line trace of every domain function. Where order or semantics were inferred it is labelled.
