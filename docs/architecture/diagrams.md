# FitBud · architecture diagrams (reverse-engineered)

All diagrams are Mermaid source (GitHub renders them; paste into mermaid.live to edit). Every node name is the name used in the code or config. Evidence tags: **[C]** confirmed in code/config, **[I]** inferred, **[U]** unknown. Component inventory, assumptions and discrepancies are in [README.md](README.md).

Naming used throughout: **Trainer Web SPA** (`apps/trainer-web/src`), **Web Worker** (`fitbud-web-<env>`, `apps/trainer-web/worker`), **API Worker** (`fitbud-api-<env>`, `apps/api/src/index.ts`), **Mobile App** (`apps/mobile`, role-aware Expo app), **D1 `DB`**, **R2 `MEDIA`**, **Queue `REMINDER_QUEUE`**, **DO `RelationshipRealtimeRoom`**, **Cron Trigger** (`*/5 * * * *`).

Contents: A1 lifecycle · A2 exception swimlane · A3 state machines · B1 C4 context · B2 C4 container · B3 API components · B4 service dependencies · B5 external integrations · C1 cloud architecture · C2 trust and network boundaries · C3 CI/CD · D1–D7 sequences · D8 data flow · D9 ER diagrams · D10 event-driven view.

---

## A1 · End-to-end application lifecycle (BPMN-style, swimlanes)

Human steps are rectangles in the Trainer and Trainee lanes; automated steps are in the System lane. Dashed = asynchronous. Sources: `routes/invitations.ts`, `onboarding.ts`, `configurations.ts`, `plans.ts`, `workouts.ts`, `meals.ts`, `checkins.ts`, `exceptions.ts`, `relationships.ts`, `jobs/*`. **[C]**

```mermaid
flowchart TB
  subgraph TR["Trainer (human) — Trainer Web SPA / Mobile App"]
    T1["Create invitation<br/>POST /invitations"]
    T2["Review onboarding submission<br/>POST /onboarding/relationships/:id/review"]
    T3["Draft + activate coaching configuration<br/>PUT draft, POST activate"]
    T4["Build plan version, preview, publish, assign<br/>(today_onward or today_only)"]
    T9["Review exceptions: acknowledge / resolve / undo"]
    T10["Review check-in<br/>POST /checkins/:id/review"]
    T11["End relationship<br/>POST /relationships/:id/end"]
  end
  subgraph TE["Trainee (human) — Mobile App"]
    E1["Open invite link, verify OTP, accept<br/>POST /invitations/accept"]
    E2["Fill + submit intake form<br/>PUT draft, POST submit"]
    E3["Execute workouts, log meals,<br/>steps, submit check-ins<br/>(offline-capable via sync outbox)"]
    E4["Request reactivation of ended coaching"]
  end
  subgraph SY["System (automated) — API Worker, Queue, Cron"]
    S1{"Invitation valid?<br/>pending, not expired/revoked,<br/>otpProof matches"}
    S2["Create trainee user + active<br/>coaching_relationship; invitation=accepted"]
    S3["Pin onboarding form version<br/>(never retargeted)"]
    S4["Relationship becomes coaching-ready<br/>onboarding_reviews.outcome=coaching_ready"]
    S5["Generate workout / meal assignments<br/>from effective plan version"]
    S6["Push notification: plan_published"]
    S7["Cron */5: evaluate reminders<br/>-> dedupe -> enqueue"]
    S8["Cron/route: detect exceptions<br/>from persisted expectations vs observations"]
    S9["Relationship status=ended;<br/>data frozen read-only"]
  end

  T1 --> S1
  E1 --> S1
  S1 -- "yes" --> S2 --> E2
  S1 -- "no: 404 / 410 revoked / 409 expired" --> X1(["Invitation rejected<br/>trainer may reissue/revoke"])
  E2 --> S3 --> T2
  T2 --> S4 --> T3 --> T4 --> S5
  S5 -.-> S6 -.-> E3
  S7 -.-> E3
  E3 --> S8
  S8 -- "exception detected (status=detected→active)" --> T9
  T9 -- "trainer resolves (never auto-resolved;<br/>late log = meal_logged_later)" --> S8
  E3 --> T10
  T10 --> E3
  T4 -. "adjustment = new immutable version" .-> S5
  T11 --> S9 --> E4
  E4 -- "trainer confirms reactivate" --> S2
```

---

## A2 · Exception handling (swimlane with decision and failure paths)

States and rules from `domain/exceptions.ts`, `routes/exceptions*.ts`, `packages/core`. Exception `type` ∈ {missed_workout, skipped_workout, overdue_meal, skipped_meal, meal_deviation, meal_logged_later, overdue_checkin}; severity ∈ {critical, attention}. **[C]**

```mermaid
flowchart LR
  subgraph SYS["System"]
    D1["evaluateRelationshipExceptions()<br/>deterministic, ruleVersion stamped"]
    D2{"Open exception already<br/>for same source signal?"}
    D3["Insert exception status=detected<br/>keep sourceEntityType/Id"]
    D4["Promote to active; emit realtime hint<br/>(best-effort, DO)"]
    D5{"Relationship ended?"}
    D6["Skip: ended period frozen,<br/>never re-evaluated"]
  end
  subgraph TRN["Trainer"]
    H1["Sees exception in attention list"]
    H2["Acknowledge<br/>POST /exceptions/:id/acknowledge"]
    H3["Resolve (+ optional intervention note,<br/>plan adjustment, schedule check-in)<br/>POST /exceptions/:id/resolve"]
    H4["Undo<br/>POST /exceptions/:id/undo"]
  end
  D1 --> D5
  D5 -- yes --> D6
  D5 -- no --> D2
  D2 -- yes --> D1b(["No duplicate row"])
  D2 -- no --> D3 --> D4 --> H1
  H1 --> H2 --> H3
  H1 --> H3
  H3 --> RES(["status=resolved + exception_actions row"])
  H2 -. "undo" .-> H4
  H3 -. "undo" .-> H4
  H4 --> D4
  LATE["Trainee logs late"] -. "creates meal_logged_later;<br/>NEVER auto-closes the original" .-> D1
```

---

## A3 · State transition diagrams

Enums are the Drizzle `enum:` values in `apps/api/src/db/schema.ts` (line numbers in README inventory). Transition arrows are **[C]** where a route or domain function performs them, **[I]** where derived from enum values only (marked `*`).

```mermaid
stateDiagram-v2
  direction LR
  state "coaching_relationships.status" as REL
  [*] --> active: invitation accepted
  active --> ended: POST /relationships/:id/end
  ended --> active: reactivate -> confirm (reactivation_requests)
  ended --> ended: reactivate/cancel
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> pending: POST /invitations
  pending --> accepted: POST /invitations/accept (valid otpProof)
  pending --> revoked: POST /:id/revoke
  pending --> expired: accept/read after expiry
  revoked --> pending: reissue*
  expired --> pending: reissue*
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> detected: rule fires
  detected --> active
  active --> acknowledged: acknowledge
  active --> resolved: resolve
  acknowledged --> resolved: resolve
  acknowledged --> active: undo
  resolved --> active: undo
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> draft: create version
  draft --> published: publish (immutable from here)
  published --> scheduled: assign with future effective time*
  published --> effective: assign effective now*
  scheduled --> effective: effective time reached*
  effective --> superseded: newer version takes effect
  scheduled --> superseded
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> draft_cfg: coaching_configurations draft
  draft_cfg --> active_cfg: POST /activate
  active_cfg --> superseded_cfg: new version activated
  state "draft / active / superseded" as note1
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> scheduled_a: assignment generated
  scheduled_a --> superseded_a: plan re-assigned
  scheduled_a --> started: start (workout_executions)
  started --> paused: pause
  paused --> started: resume
  started --> completed: complete
  started --> modified: logged with changes
  scheduled_a --> skipped: skip
  state "workout_assignments: scheduled/superseded<br/>workout_executions: started/paused/completed/modified/skipped" as n2
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> cdraft: checkins draft (PUT /draft)
  cdraft --> csubmitted: POST /submit
  csubmitted --> reviewed: POST /review<br/>(acknowledged / needs_follow_up / adjust_coaching)
  state "checkins.status: draft/submitted<br/>checkin_reviews.outcome" as n3
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> queued: cron evaluate -> notification_deliveries
  [*] --> deferred: quiet hours / backoff
  deferred --> queued
  queued --> accepted: Expo push ticket ok (provider_status)
  queued --> failed: provider error (queue retry <=3, then DLQ)
  queued --> skipped: dedupe / cap / disabled
  accepted --> uncertain: receipt unknown*
  accepted --> accepted: receipt error recorded in failure_category
  note right of accepted: Acceptance != delivery.<br/>DeviceNotRegistered revokes device_tokens.
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> upload_pending: POST /files/upload-targets
  upload_pending --> ready: PUT content + POST confirm
  upload_pending --> upload_failed
  state "media_assets.status:<br/>pending_upload / ready / failed" as n4
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> acct_active
  acct_active --> acct_archived: POST /account/deletion
  acct_archived --> acct_active: POST /account/reactivation
  acct_archived --> [*]: cron.account_purge after purgeAfter
  acct_active --> acct_disabled
  note right of acct_archived: Only GET /account/status, POST /account/reactivation,<br/>DELETE /auth/session reachable; others 403 ACCOUNT_ARCHIVED
```

---

## B1 · C4 System Context

```mermaid
flowchart TB
  trainer(["<b>Trainer</b><br/>[Person]<br/>Configures plans, reviews exceptions"])
  trainee(["<b>Trainee (client)</b><br/>[Person]<br/>Executes workouts, logs meals, steps, check-ins"])
  ops(["<b>Owner / Ops</b><br/>[Person]<br/>Deploys, migrations, secrets, store consoles"])
  fitbud["<b>FitBud</b><br/>[Software System]<br/>Trainer Web + role-aware Mobile App + API on Cloudflare"]
  firebase["<b>Firebase Auth</b><br/>[External]<br/>ID and refresh tokens"]
  expo["<b>Expo Push Service</b><br/>[External]<br/>Push tickets and receipts"]
  zepto["<b>ZeptoMail (Zoho IN)</b><br/>[External]<br/>OTP, invite, alert email"]
  wa["<b>WhatsApp Cloud API</b><br/>[External, flags off]"]
  sentry["<b>Sentry</b><br/>[External]<br/>Crash reports"]
  health["<b>HealthKit / Health Connect</b><br/>[External, on device]"]
  stores["<b>TestFlight / Play / EAS</b><br/>[External]<br/>Distribution"]
  trainer -- "HTTPS" --> fitbud
  trainee -- "HTTPS / WSS" --> fitbud
  ops -- "wrangler (manual)" --> fitbud
  fitbud -- "HTTPS: mint, exchange, refresh" --> firebase
  fitbud -- "HTTPS: send, receipts" --> expo
  fitbud -- "HTTPS: send mail" --> zepto
  fitbud <-- "HTTPS + webhook" --> wa
  fitbud -- "HTTPS: errors" --> sentry
  health -- "native SDK (steps)" --> fitbud
  stores -- "install" --> trainee
  classDef person fill:#08427b,color:#fff,stroke:#052e56
  classDef sys fill:#1168bd,color:#fff,stroke:#0b4884
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  class trainer,trainee,ops person
  class fitbud sys
  class firebase,expo,zepto,wa,sentry,health,stores ext
```

---

## B2 · C4 Container

```mermaid
flowchart TB
  trainer(["Trainer"]) 
  trainee(["Trainee"])
  spa["<b>Trainer Web SPA</b><br/>[React 19 / Vite, browser]<br/>Online-only trainer UI"]
  mobile["<b>Mobile App</b><br/>[Expo / React Native]<br/>Trainer + trainee roles, sync outbox, push, steps"]
  subgraph cf["Cloudflare account (per env: staging, production)"]
    web["<b>Web Worker</b><br/>[Worker + static assets]<br/>Serves SPA, proxies /api/* and /i/*"]
    api["<b>API Worker</b><br/>[Hono / TypeScript]<br/>Authn, authz, domain, sync, jobs"]
    d1[("<b>D1 DB</b><br/>[SQLite, Drizzle]<br/>Authoritative state")]
    r2[("<b>R2 MEDIA</b><br/>[Object storage]<br/>Photos, avatars")]
    q[["<b>REMINDER_QUEUE</b><br/>[Queue + DLQ]"]]
    do["<b>RelationshipRealtimeRoom</b><br/>[Durable Object, WS hibernation]<br/>Change-hint fan-out"]
    cron["<b>Cron Trigger</b><br/>[*/5 * * * *]"]
  end
  fb["Firebase Auth"]
  expo["Expo Push"]
  zm["ZeptoMail"]
  wa["WhatsApp Cloud API"]
  sn["Sentry"]
  trainer --> spa
  trainer --> mobile
  trainee --> mobile
  spa -- "HTTPS /api/*, WSS (cookie + Bearer)" --> web
  web -- "service binding fetch" --> api
  mobile -- "HTTPS REST, WSS (Bearer, X-FitBud-Role)" --> api
  api -- "Drizzle SQL" --> d1
  api -- "get / put" --> r2
  api -. "send job (async)" .-> q
  q -. "queue() batch 10, 3 retries" .-> api
  cron -. "scheduled()" .-> api
  api -- "POST /broadcast, WS upgrade" --> do
  do -. "WSS hints" .-> spa
  do -. "WSS hints" .-> mobile
  api -- "HTTPS tokens" --> fb
  api -- "HTTPS push, receipts" --> expo
  api -- "HTTPS mail" --> zm
  api <-- "HTTPS / webhook (flagged)" --> wa
  api -- "HTTPS errors" --> sn
  classDef int fill:#438dd5,color:#fff,stroke:#2e6295
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  classDef per fill:#08427b,color:#fff
  class spa,mobile,web,api,d1,r2,q,do,cron int
  class fb,expo,zm,wa,sn ext
  class trainer,trainee per
```

---

## B3 · Component architecture — API Worker (`apps/api/src`)

```mermaid
flowchart TB
  IN(["fetch / scheduled / queue entry<br/>index.ts (wrapWithSentry)"])
  subgraph MW["Middleware chain (all routes)"]
    M0["NOW pin (demo)"] --> M1["request-id"] --> M2["request-log (safe fields)"] --> M3["runtime-guard<br/>(refuses test doubles outside local)"] --> M4["optionalAuth / requireAuth / requireRole<br/>cookie fitbud_session OR Bearer ID token;<br/>X-FitBud-Role; archived-account gate"]
  end
  subgraph RT["routes/* (Hono, zod via @fitbud/contracts, OpenAPI)"]
    R1["auth, auth-login, me-*, account, invitations, invite-landing"]
    R2["relationships, onboarding, configurations, subscriptions, client-settings"]
    R3["plans, templates, libraries, workouts, meals, checkin-forms, checkins"]
    R4["exceptions(+bulk), progress, steps, strength, history, workspaces, activity-feed"]
    R5["sync (push/pull), files, notifications, realtime, coach-asks, links, config"]
    R6["webhooks-whatsapp, dev (local only), openapi/docs, health"]
  end
  subgraph DM["domain/* (business rules)"]
    D1["exceptions, adherence, client-status, reminders (+backoff/status)"]
    D2["assignment-schedule, plan-version-assign, week/strength read models"]
    D3["sync (change_log, pull), compliance-logging, coach-log"]
    D4["relationship-lifecycle, account-deletion, onboarding-forms, whatsapp-budget"]
  end
  subgraph AU["auth/*"]
    A1["firebase (JWT verify)"] --- A2["custom-token + token-exchange"] --- A3["password, test-otp, proof (purpose proofs), identity"]
  end
  subgraph LIB["lib/*"]
    L1["crypto, cursor, idempotency, envelope"] --- L2["expo-push, email/zeptomail, whatsapp-cloud, sentry, files/media-key"]
  end
  subgraph JB["jobs/*"]
    J1["reminders (cron + queue consumer)"] --- J2["replenishment"] --- J3["coach-ask maintenance"] --- J4["account-purge"] --- J5["push-receipts"]
  end
  RTM["realtime/emit.ts → DO RelationshipRealtimeRoom"]
  DB[("D1 via db/client.ts + schema.ts")]
  PKG["packages: contracts (zod), core (pure rules)"]
  IN --> MW --> RT --> DM --> DB
  RT --> AU
  RT --> LIB
  RT --> RTM
  IN --> JB --> DM
  RT -.-> PKG
  DM -.-> PKG
```

---

## B4 · Service dependency diagram

Solid = synchronous, dashed = asynchronous. Dependency direction = "calls / imports". Package rule from AGENTS.md: apps depend on packages, never on another app. **[C]** from `package.json` workspaces and imports; inter-service calls from code.

```mermaid
flowchart LR
  subgraph APPS["Applications"]
    SPA["Trainer Web SPA"]
    MOB["Mobile App"]
    WEBW["Web Worker"]
    API["API Worker"]
  end
  subgraph PKGS["Shared packages"]
    CON["contracts"]
    COR["core"]
    CLI["api-client"]
    UIM["ui-mobile"]
    TOK["tokens / brand / config"]
  end
  SPA --> CLI --> CON
  MOB --> CLI
  MOB --> UIM --> TOK
  SPA --> COR
  MOB --> COR
  API --> CON
  API --> COR
  COR --> CON
  SPA == "HTTPS /api/*" ==> WEBW == "service binding" ==> API
  MOB == "HTTPS" ==> API
  API --> D1[("D1")]
  API --> R2[("R2")]
  API -. "enqueue" .-> Q["REMINDER_QUEUE"] -. "consume" .-> API
  API -. "hint" .-> DO["Realtime DO"]
  DO -. "WSS" .-> SPA
  DO -. "WSS" .-> MOB
  API --> FB["Firebase Auth"]
  API --> EXPO["Expo Push"]
  API --> ZM["ZeptoMail"]
  API --> WA["WhatsApp Cloud"]
  API --> SEN["Sentry"]
```

---

## B5 · External integration diagram

```mermaid
flowchart LR
  API["API Worker"]
  subgraph IDP["Identity — Firebase (Google)"]
    F1["identitytoolkit.googleapis.com<br/>accounts:signInWithCustomToken"]
    F2["securetoken.googleapis.com/v1/token<br/>(refresh)"]
    F3["JWT verify: issuer securetoken.google.com/&lt;project&gt;<br/>(public keys)"]
  end
  subgraph PUSH["Push — Expo"]
    P1["exp.host/--/api/v2/push/send<br/>(EXPO_ACCESS_TOKEN optional)"]
    P2["exp.host/--/api/v2/push/getReceipts<br/>15 min–24 h after accept"]
    P3["APNs / FCM (EAS-managed creds; not called by API)"]
  end
  subgraph MAIL["Email — ZeptoMail IN"]
    Z1["api.zeptomail.in/v1.1/email<br/>(ZEPTOMAIL_TOKEN)"]
  end
  subgraph WAB["WhatsApp Cloud (Meta) — flags FLAG_WA_* off"]
    W1["graph.facebook.com/v21.0/&lt;phoneNumberId&gt;/messages"]
    W2["Inbound webhook /webhooks/whatsapp<br/>(WA_APP_SECRET, verify token)"]
  end
  SEN["Sentry (SENTRY_DSN secret)"]
  API -- "HTTPS (sync, retry-aware: invalid vs unavailable)" --> F1
  API -- HTTPS --> F2
  API --> F3
  API -- "HTTPS (cron + queue consumer)" --> P1
  API -- "HTTPS (cron.push_receipts)" --> P2
  P1 -.-> P3
  API -- "HTTPS; failure → 502 EMAIL_SEND_FAILED" --> Z1
  API -- HTTPS --> W1
  W2 -- "HTTPS inbound" --> API
  API --> SEN
  MOB["Mobile App"] -. "EAS Build/Submit (manual)" .-> STORE["TestFlight / Play closed testing"]
  MOB -. "native" .-> HK["HealthKit / Health Connect"]
```

---

## C1 · Cloud architecture (Cloudflare — AWS conventions do not apply)

No AWS, VPC, subnet, AZ or security-group resources exist in the repository **[C]**. The platform is Cloudflare Workers; the placement is global/edge and managed by Cloudflare **[I]**. The closest equivalent of "network access relationships" is the set of **bindings** shown here.

```mermaid
flowchart TB
  U1["Browser (trainer)"]
  U2["Mobile App (iOS/Android)"]
  subgraph CFZ["Cloudflare zone thefitbud.com (DNS; Workers custom domains)"]
    subgraph PRODENV["Environment: production"]
      WP["Worker fitbud-web-production<br/>app.thefitbud.com<br/>ASSETS (dist/ SPA) + API binding"]
      AP["Worker fitbud-api-production<br/>api.thefitbud.com<br/>cron */5, queue consumer, observability 20%"]
      DP[("D1 fitbud-prod")]
      RP[("R2 fitbud-media-prod")]
      QP[["Queue fitbud-jobs-prod"]]
      QPD[["DLQ fitbud-jobs-prod-dlq"]]
      OP["DO RelationshipRealtimeRoom<br/>(migration v1-realtime)"]
    end
    subgraph STGENV["Environment: staging"]
      WS["Worker fitbud-web-staging<br/>app-staging.thefitbud.com"]
      AS["Worker fitbud-api-staging<br/>api-staging.thefitbud.com<br/>observability 100%"]
      DS[("D1 fitbud-staging")]
      RS[("R2 fitbud-media-nonprod<br/>prefix staging/")]
      QS[["Queue fitbud-jobs-staging"]]
      QSD[["DLQ fitbud-jobs-staging-dlq"]]
      OS["DO RelationshipRealtimeRoom"]
    end
  end
  U1 -- "HTTPS / WSS" --> WP
  U1 -- "HTTPS / WSS (staging)" --> WS
  U2 -- "HTTPS / WSS" --> AP
  U2 -- "HTTPS (staging builds)" --> AS
  WP -- "service binding API" --> AP
  WS -- "service binding API" --> AS
  AP --- DP
  AP --- RP
  AP --> QP --> AP
  QP -. "after 3 retries" .-> QPD
  AP --> OP
  AS --- DS
  AS --- RS
  AS --> QS --> AS
  QS -. "after 3 retries" .-> QSD
  AS --> OS
  EXT["Firebase projects: thefitbud-prod / thefitbud-staging<br/>Expo, ZeptoMail, Sentry, WhatsApp"]
  AP --> EXT
  AS --> EXT
```

Local development: `wrangler dev` with `--persist-to .wrangler/state` (own D1 per worktree), `AUTH_MODE=test`, `PUSH_PROVIDER_MODE=test`, `EMAIL_PROVIDER=dev_sink`, queue `fitbud-jobs-dev` without DLQ. **[C]**

---

## C2 · Trust boundaries and network topology

```mermaid
flowchart TB
  subgraph UNTRUSTED["Untrusted: internet clients"]
    B["Browser SPA<br/>bearer token in client storage + HttpOnly Secure SameSite=Lax cookie"]
    M["Mobile App<br/>Bearer ID token (SecureStore*), X-FitBud-Role"]
    WH1["Meta webhook sender"]
  end
  subgraph EDGE["Cloudflare edge: TLS termination, custom domains"]
    subgraph WEBB["Web Worker (no secrets; ASSETS + API binding only)"]
      WW["route table: /api/* → API (prefix stripped), /i/* → API, else SPA"]
    end
    subgraph APIB["API Worker — the only authorization boundary"]
      GATE{"Authn: cookie session OR Bearer Firebase ID token<br/>Authz: role + relationship ownership resolved server-side<br/>Archived-account gate; ended = read-only"}
      CORE["Domain + routes"]
    end
    subgraph DATA["Private bindings (not internet reachable)"]
      D1[("D1")]
      R2[("R2 — keys never authorize;<br/>HMAC-signed exp/sig URLs (MEDIA_SIGNING_SECRET)")]
      Q[["Queue"]]
      DO["DO room — WS accepted only after API actor check"]
    end
  end
  subgraph SAAS["Third-party SaaS (egress only, HTTPS)"]
    FB["Firebase"] 
    EX["Expo"]
    ZM["ZeptoMail"]
    WA["WhatsApp"]
    SE["Sentry"]
  end
  B -- "HTTPS" --> WW --> GATE
  M -- "HTTPS (direct to api.*)" --> GATE
  WH1 -- "HTTPS, signature (WA_APP_SECRET)" --> GATE
  GATE --> CORE --> D1
  CORE --> R2
  CORE --> Q
  CORE --> DO
  CORE -- "secrets via Worker env (wrangler secret)" --> SAAS
```

Secrets are Worker secrets, never in the repo: `MEDIA_SIGNING_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ZEPTOMAIL_TOKEN`, `EXPO_ACCESS_TOKEN`, `SENTRY_DSN`, `WA_*`, `QA_TEST_OTP_CODE` (names from `types.ts` and `staging-setup.md`). Public by design: `FIREBASE_WEB_API_KEY`. **[C]**

---

## C3 · CI/CD and deployment flow

```mermaid
flowchart LR
  DEV["Agent/dev branch claude/&lt;ID&gt;-slug"] --> PR["Pull request to main"]
  PR --> CH["job changes<br/>(classify docs vs code vs web)"]
  CH --> CI["job ci (required):<br/>pnpm build:packages, lint, typecheck, test,<br/>Maestro flow parse"]
  CH --> E2E["job e2e + banned-strings<br/>Playwright vs local seeded API (advisory)"]
  CI --> REV["Fresh Opus reviewer subagent<br/>(spec, diff, frames)"]
  REV --> MRG["Merge commit to main<br/>(agents; no squash/admin)"]
  MRG --> CIM["CI re-run on push to main"]
  MRG -. "manual, Firoz only" .-> DEPLOY
  subgraph DEPLOY["Manual deploy (wrangler; agents never run)"]
    DB1["db:migrate:&lt;env&gt; --yes (D1 migrations)"] --> LIB1["seed:library:&lt;env&gt;"] --> API1["deploy:&lt;env&gt; API Worker"] --> WEB1["trainer-web deploy:&lt;env&gt;<br/>build dist/ then Web Worker"]
  end
  MOBB["EAS build (development/preview/production profiles)<br/>eas submit — manual"] -. manual .-> STORE["TestFlight / Play closed testing"]
  NIGHT["qa.yml: nightly 02:00 IST + dispatch<br/>(seed-api/web/android/ios → api-smoke, web-staging,<br/>Maestro android+ios, unit → report artifact)"] --> STG["Staging (api-staging / app-staging)"]
  NIGHT --> DR["design-review.yml: QA screenshots vs frames (advisory)"]
```

No workflow deploys to Cloudflare **[C]**. The only remote writes in CI are the QA seed jobs on staging (environment `staging-qa`, from `main`).

---

## D1 · Sequence — trainer web sign-in (password) and session

```mermaid
sequenceDiagram
  autonumber
  actor T as Trainer
  participant SPA as Trainer Web SPA
  participant W as Web Worker
  participant A as API Worker
  participant D as D1
  participant F as Firebase Auth
  T->>SPA: identifier + password
  SPA->>W: POST /api/auth/login
  W->>A: service binding POST /auth/login
  A->>D: bump auth_rate_limits (ip hash)
  alt rate limited
    A-->>SPA: 429 RATE_LIMITED
  end
  A->>D: load user_identities (hash, lockedUntil)
  A->>A: verifyPassword
  alt invalid / unknown / locked
    A->>D: failed_login_count++ (lock 15 min at 10)
    A-->>SPA: 401 INVALID_CREDENTIALS (generic)
  else valid
    A->>F: signInWithCustomToken (minted custom token)
    F-->>A: idToken + refreshToken
    A-->>SPA: 200 tokens
    SPA->>W: POST /api/auth/session {idToken, timezone}
    W->>A: forward
    A->>F: verify JWT (issuer securetoken.google.com/project)
    A->>D: find/create user, ensure trainer role + profile
    A-->>SPA: 200 + Set-Cookie fitbud_session (HttpOnly, Secure, Lax)
    SPA->>W: GET /api/me
    A-->>SPA: actor, roles
    alt trainee-only account
      A-->>SPA: 403 FORBIDDEN_ROLE on /auth/session (client keeps bearer, shows trainee gate)
    end
  end
```

Parameters in parentheses (15, 30, 10, 15 min) are from `auth-login.ts`; the exact window semantics of `bumpRateLimit(…,15,30)` are **[U]** without reading the helper. **[C]**

---

## D2 · Sequence — invitation → OTP → acceptance (trainee, mobile)

```mermaid
sequenceDiagram
  autonumber
  actor Tr as Trainer
  actor Te as Trainee
  participant App as Mobile App
  participant A as API Worker
  participant D as D1
  participant Z as ZeptoMail
  Tr->>A: POST /invitations (identifier, form version pinned)
  A->>D: insert client_invitations status=pending
  A->>Z: invite email (E-INV) [or wa.me prefill by trainer]
  Te->>App: opens link /i/:token (landing served by API via Web Worker)
  App->>A: POST /auth/otp/start
  A->>D: auth_otps (code hash, rate limit)
  A->>Z: OTP email (E-OTP) (staging may use fixed QA code)
  Te->>App: enters code
  App->>A: POST /auth/otp/verify
  alt wrong/expired code
    A-->>App: 401 OTP_INVALID (attempts++)
  else ok
    A-->>App: purpose proof "invite" (otpProof)
  end
  App->>A: POST /invitations/accept {token, otpProof, ...}
  A->>D: load invitation
  alt not found 404 / revoked 410 / expired 409 / already accepted 409
    A-->>App: static error code
  else pending
    A->>A: verifyPurposeProof
    A->>D: create user+trainee profile, coaching_relationship=active, invitation=accepted
    A->>A: mintAuthToken → Firebase signInWithCustomToken
    A-->>App: tokens (Bearer)
  end
```

---

## D3 · Sequence — offline workout logging via sync push (idempotent)

```mermaid
sequenceDiagram
  autonumber
  actor Te as Trainee
  participant App as Mobile App (sync engine + outbox)
  participant A as API Worker /sync
  participant R as Domain route (internal dispatch)
  participant D as D1
  participant DO as RelationshipRealtimeRoom
  participant Tr as Trainer Web SPA
  Te->>App: complete set / workout (offline)
  App->>App: write local record, enqueue outbox (mutationId = idempotency key)
  Note over App: on reconnect
  App->>A: POST /sync/push [{mutationId, operation, payload}]
  A->>D: lookup sync_mutations(actor, mutationId)
  alt already stored
    A-->>App: already_applied (stored result)
  else new
    A->>R: mapMutationToRequest → in-process POST /workouts/executions/:id/sets/:id/complete
    R->>D: write execution rows + change_log(upsert) + recordVersion
    R-->>DO: queueRealtimeHint (best-effort, fire-and-forget)
    A->>D: persist sync_mutations result
    A-->>App: applied | conflicted (409) | rejected
  end
  App->>A: GET /sync/pull?cursor=…
  A->>D: change_log since cursor (opaque cursor)
  A-->>App: upserts / tombstones + new cursor
  App->>App: apply transactionally, then advance cursor
  DO-->>Tr: WSS hint (ids, type, serverVersion) → SPA refetches REST
```

Persistence on native is **not SQLite** in current code (see README D-02). Supported operations: workout.start/pause/resume/set complete/skip/complete/skip, meal.confirm/deviate/skip, checkin.save_draft/submit, measurement.create (subset listed in `routes/sync.ts`). **[C]**

---

## D4 · Sequence — reminder evaluation → queue → Expo push → receipts

```mermaid
sequenceDiagram
  autonumber
  participant C as Cron Trigger (*/5)
  participant A as API Worker scheduled()
  participant D as D1
  participant Q as REMINDER_QUEUE
  participant QC as API Worker queue()
  participant E as Expo Push
  participant M as Mobile App
  C->>A: scheduled(at)
  A->>A: runScheduledJobs (each job isolated, first error rethrown)
  A->>D: evaluate schedules + completion state (authoritative)
  A->>A: quiet hours, daily cap, backoff, category prefs, dedupe key
  A->>D: insert notifications + notification_deliveries (unique dedupe_key)
  A-)Q: send({notificationId, deliveryId})
  Q-)QC: batch ≤10
  QC->>D: load delivery + active device_tokens
  QC->>E: POST push/send (routing-only payload)
  alt provider accepted
    QC->>D: provider_status=accepted (≠ completed)
    QC-->>Q: ack
  else error
    QC-->>Q: retry (max 3) → DLQ
  end
  E-)M: APNs/FCM push
  Note over A,E: later cron.push_receipts (15 min–24 h)
  A->>E: POST getReceipts
  A->>D: failure_category, DeviceNotRegistered revokes token
```

Other cron jobs in the same tick, in order: `cron.reminders`, `cron.replenishment`, `cron.coach_ask`, `cron.account_purge`, `cron.push_receipts`. **[C]**

---

## D5 · Sequence — plan publish and assign

```mermaid
sequenceDiagram
  autonumber
  actor T as Trainer
  participant S as Trainer Web SPA
  participant A as API Worker
  participant D as D1
  participant DO as Realtime DO
  T->>S: edit draft plan version
  S->>A: PUT /plans/:id/versions/:vid (optimistic concurrency)
  alt version conflict
    A-->>S: 409 (no silent overwrite)
  end
  S->>A: POST …/consistency, …/preview
  S->>A: POST …/publish
  A->>D: version draft→published (immutable)
  S->>A: POST …/assign {window: today_onward | today_only}
  A->>D: supersede overlapping assignments, generate workout/meal assignments
  A->>D: change_log(effective_plan, assignments) + notifications(plan_published)
  A-->>DO: hint
  A-->>S: 200
```

Detailed ordering inside `plan-version-assign.ts` is **[I]** (route names and table writes confirmed, step order inferred).

---

## D6 · Sequence — realtime hint channel

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (SPA or Mobile)
  participant A as API Worker
  participant DO as RelationshipRealtimeRoom (id = relationshipId)
  C->>A: GET /realtime/relationships/:id/connection
  A-->>C: ws URL (authorization check)
  C->>A: GET /realtime/relationships/:id/ws (Upgrade, cookie or ?access_token)
  A->>A: resolve actor, verify relationship ownership
  A->>DO: forward Upgrade + x-fitbud-user-id
  DO-->>C: 101 (hibernation WebSocket)
  Note over A,DO: later, any mutation
  A->>DO: POST /broadcast {eventId, eventType, entityType, entityId, serverVersion}
  DO-->>C: fan-out
  C->>A: refetch REST / sync (authoritative)
  Note over C,DO: ping/pong auto-response, client-to-server app messages ignored
```

---

## D7 · Sequence — media upload (photo)

```mermaid
sequenceDiagram
  autonumber
  participant M as Mobile App
  participant A as API Worker
  participant D as D1
  participant R as R2 MEDIA
  M->>A: POST /files/upload-targets (kind, owner link)
  A->>D: media_assets status=pending_upload
  A-->>M: target URL with signed exp+sig (HMAC MEDIA_SIGNING_SECRET)
  M->>A: PUT /files/:id/content (session or signed query)
  A->>R: put (key via mediaKey(): env prefix + id)
  M->>A: POST /files/:id/confirm
  A->>D: status=ready (else failed)
  Note over M,A: structured mutation referencing the media id is sent separately (outbox upload queue)
  M->>A: GET /files/:id/download-target → GET /files/:id/content
  A->>D: ownership check via coaching relationship
  A->>R: get → stream
```

Bytes pass **through** the API Worker (no direct R2 presigned URL is used) — inferred from the `content` routes **[I]**.

---

## D8 · Data flow diagram (level 1)

```mermaid
flowchart LR
  TR(["Trainer"]) 
  TE(["Trainee"])
  subgraph P["API Worker processes"]
    P1["1 Authenticate / authorize"]
    P2["2 Onboard (invite, intake, review)"]
    P3["3 Plan & configure (versions, assign)"]
    P4["4 Capture execution (workouts, meals, steps, check-ins, media)"]
    P5["5 Sync (push/pull)"]
    P6["6 Detect exceptions + status"]
    P7["7 Notify (reminders, inbox, push, realtime)"]
  end
  DS1[("D1: identity & relationships")]
  DS2[("D1: plans, assignments, expectations")]
  DS3[("D1: executions, compliance, check-ins, progress")]
  DS4[("D1: exceptions, interventions, notes")]
  DS5[("D1: change_log, sync_mutations, idempotency")]
  DS6[("D1: notifications, deliveries, device_tokens")]
  DS7[("R2 MEDIA")]
  EXT1["Firebase"]; EXT2["Expo"]; EXT3["ZeptoMail"]
  TR --> P1 ; TE --> P1
  P1 <--> EXT1
  P1 --> DS1
  TR --> P2 --> DS1
  P2 --> EXT3
  TR --> P3 --> DS2
  TE --> P4 --> DS3
  P4 --> DS7
  P4 --> DS5
  TE <--> P5 <--> DS5
  DS2 --> P6
  DS3 --> P6 --> DS4 --> TR
  DS2 --> P7
  DS3 --> P7 --> DS6
  P7 --> EXT2 --> TE
  P3 --> DS6
```

---

## D9 · Database ER diagrams (Crow's Foot)

133 foreign keys exist across 88 tables (`schema.ts`); the diagrams below group them by domain with key columns only. Most owned tables reference `coaching_relationships.id` (28 FKs) or `users.id` (49 FKs) — the ownership paths used for authorization **[C]**.

### D9a Identity and relationship core

```mermaid
erDiagram
  users ||--o{ user_roles : has
  users ||--o| trainer_profiles : is
  users ||--o| trainee_profiles : is
  users ||--o{ user_identities : "login ids"
  users ||--o{ web_sessions : has
  users ||--o{ device_tokens : registers
  users ||--o{ client_invitations : "trainer sends"
  client_invitations ||--o| coaching_relationships : "accepted into"
  users ||--o{ coaching_relationships : "trainer / trainee"
  coaching_relationships ||--o{ subscription_versions : bills
  coaching_relationships ||--o{ payment_records : tracks
  coaching_relationships ||--o{ coaching_configurations : configures
  coaching_relationships ||--o{ reactivation_requests : has
  users { text id PK "account_state: active|disabled|archived" text firebase_uid text timezone text purge_after }
  coaching_relationships { text id PK text status "active|ended" text trainer_id FK text trainee_id FK }
  client_invitations { text id PK text status "pending|accepted|expired|revoked" }
  subscription_versions { text id PK text plan_frequency "weekly..yearly" text renewal_frequency }
  payment_records { text id PK text status "paid|unpaid" text method "cash|upi|bank" }
```

### D9b Onboarding, plans, expectations

```mermaid
erDiagram
  onboarding_form_templates ||--o{ onboarding_form_versions : versions
  onboarding_form_versions ||--o{ onboarding_form_responses : "pinned by"
  coaching_relationships ||--o{ onboarding_form_responses : submits
  onboarding_form_responses ||--o| onboarding_reviews : "reviewed (coaching_ready)"
  coaching_relationships ||--o{ plans : owns
  plans ||--o{ plan_versions : versions
  plan_versions ||--o{ workout_assignments : generates
  plan_versions ||--o{ meal_assignments : generates
  coaching_configurations ||--o{ workout_expectations : defines
  coaching_configurations ||--o{ nutrition_expectations : defines
  coaching_configurations ||--o{ checkin_schedules : defines
  coaching_configurations ||--o{ tracking_requirements : defines
  users ||--o{ plan_templates : "trainer owns (global|trainer)"
  plan_versions { text id PK text status "draft|published|scheduled|effective|superseded" text origin "blank|previous_version|template|adjustment" }
```

### D9c Execution, compliance, check-ins, progress

```mermaid
erDiagram
  workout_assignments ||--o{ workout_executions : executed
  workout_executions ||--o{ exercise_executions : contains
  exercise_executions ||--o{ set_executions : contains
  meal_assignments ||--o| meal_compliance : logged
  coaching_relationships ||--o{ checkins : has
  checkin_form_templates ||--o{ checkin_form_versions : versions
  checkin_form_versions ||--o{ checkins : "pinned"
  coaching_relationships ||--o{ checkin_schedules : schedules
  checkins ||--o| checkin_reviews : reviewed
  coaching_relationships ||--o{ measurements : records
  coaching_relationships ||--o{ progress_entries : records
  coaching_relationships ||--o{ daily_steps : "steps (apple_health|health_connect|manual)"
  media_assets ||--o{ progress_entries : attached
  coaching_relationships ||--o{ log_edit_events : "audit (target_type: workout_execution|meal_compliance|measurement, no FK)"
  workout_executions { text id PK text status "started|paused|completed|modified|skipped" text logged_by_role "trainee|coach" }
  meal_compliance { text id PK text status "confirmed|modified|skipped" text deviation_kind }
```

### D9d Exceptions, notifications, sync

```mermaid
erDiagram
  coaching_relationships ||--o{ exceptions : raises
  exceptions ||--o{ exception_actions : "acknowledge|resolve"
  exceptions ||--o{ interventions : "note|plan_adjustment|schedule_checkin"
  interventions }o--o| plan_versions : "resulting version"
  coaching_relationships ||--o{ trainer_notes : has
  checkins ||--o{ trainer_notes : "optional"
  coaching_relationships ||--o{ coach_asks : "asked coach"
  coaching_relationships ||--o{ reminder_rules : configures
  users ||--o{ notification_preferences : sets
  notifications ||--o{ notification_deliveries : "push channel"
  notification_deliveries }o--o| device_tokens : "sent to"
  coaching_relationships ||--o{ change_log : "sequence (upsert|tombstone)"
  users ||--o{ sync_mutations : "applied|already_applied|rejected|conflicted"
  idempotency_records { text key_hash "no FK; keyed by actor + key hash" }
  exceptions { text id PK text type "7 types" text severity "critical|attention" text status "detected|active|acknowledged|resolved" text rule_version text source_entity_type text source_entity_id }
  notification_deliveries { text id PK text state "queued|accepted|failed|skipped|uncertain" text dedupe_key }
```

### D9e Library (reference data) and WhatsApp (built, flagged off)

```mermaid
erDiagram
  library_sources ||--o{ exercise_library_items : source
  library_sources ||--o{ food_library_items : source
  exercise_library_items ||--o{ exercise_library_muscles : tagged
  exercise_library_items ||--o{ exercise_library_media : "media (by id)"
  library_sources ||--o{ exercise_library_media : source
  food_library_items ||--o{ food_library_servings : servings
  food_library_items ||--o{ food_library_nutrients : nutrients
  coaching_relationships ||--o{ trainee_custom_foods : "custom foods (no FK to library)"
  coaching_relationships ||--o{ whatsapp_messages : sends
  whatsapp_messages ||--o{ whatsapp_ledger : costs
```

---

## D10 · Event-driven architecture

```mermaid
flowchart LR
  subgraph SRC["Event sources"]
    S1["Cron Trigger */5 (time)"]
    S2["HTTP mutations (workouts, meals, checkins, plans, exceptions)"]
    S3["Expo receipts (poll)"]
    S4["WhatsApp webhook (inbound)"]
  end
  subgraph BUS["Messaging"]
    Q["Queue REMINDER_QUEUE<br/>{notificationId, deliveryId}<br/>max_batch 10, retries 3, DLQ"]
    DO["DO room per relationship<br/>{eventId, eventType, entityType, entityId, relationshipId, serverVersion}"]
    CL[("change_log (pull-based event log, cursor)")]
  end
  subgraph CON["Consumers"]
    C1["API queue() → Expo push"]
    C2["SPA / Mobile realtime hooks → refetch"]
    C3["Mobile sync pull → local apply"]
    C4["domain: whatsapp_webhook_events, opt-outs"]
  end
  S1 -. "evaluate" .-> Q
  S2 -- "append" --> CL
  S2 -. "best-effort hint" .-> DO
  S3 -. "update delivery" .-> CL
  Q -. "at-least-once; dedupe_key unique" .-> C1
  DO -. "at-most-once hint" .-> C2
  CL --> C3
  S4 --> C4
```

Delivery semantics: queue = at-least-once with unique `dedupe_key` for at-most-once push **[C]** (`reminders.at-most-once.test.ts`); realtime = best-effort hint, correctness never depends on it; change_log = durable, cursor-based **[C]**.
