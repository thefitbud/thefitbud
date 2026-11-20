# 09 · Data inventory, processors, retention and security

> **DRAFT for founder and counsel review.** Prepared 2 Nov 2026 from the repository at commit `1578371`.
> This is the factual foundation for the Privacy Policy (draft 04) and the store disclosures (draft 11). **If this document is wrong, those are wrong.** Every row cites where it came from, so it can be re-checked when the code changes.

---

## 1. Scope and method

Everything below was read from the source: the Drizzle schema and migrations in `apps/api/drizzle/`, the API routes in `apps/api/src/`, the mobile and web clients, and the product decisions in `docs/spec/` and `docs/tasks/`. Nothing is inferred from the product description.

Two things worth stating up front, because they are unusual and they are to FitBud's advantage:

1. **There is no analytics, attribution or advertising code in the product at all.** No Google Analytics, Firebase Analytics, Meta SDK, PostHog, Mixpanel, Amplitude or any equivalent. No advertising identifier is read. No location, no contacts, no device fingerprinting. Firebase is used for identity only.
2. **Raw IP addresses are never stored.** The only IP-derived value is a SHA-256 hash used to rate-limit password sign-in and session refresh (`apps/api/src/routes/auth-login.ts` ~l.197, ~l.675) — see §2.1 on why it is still personal data.

## 2. What the system holds about people

### 2.1 Identity and account

| Data | Where | How obtained | Notes |
|---|---|---|---|
| Name (display name) | `trainer_profiles.display_name`, `trainee_profiles.display_name` | Trainer types the client's name when inviting; trainer gives their own | |
| Email address | `user_identities.email`, `.email_norm` | Trainer enters the client's; trainer enters their own | Required — it is a sign-in channel |
| Mobile number (E.164) | `user_identities.mobile_e164` | Trainer enters the client's | Also the WhatsApp contact number |
| Password | `user_identities.password_hash` | Set by the user | PBKDF2-SHA256, salted, `apps/api/src/auth/password.ts` — never stored in clear |
| Federated identity id | `users.firebase_uid` | Google Identity Platform | Pseudonymous |
| Failed sign-in count, lock-out time, password-change time | `user_identities` | Generated | Security only |
| Time zone | `users.timezone` | **Read automatically from the device**, editable afterwards | `apps/trainer-web/src/lib/auth-flow.ts:84`; `apps/mobile/src/screens/AcceptInviteScreen.tsx:247` |
| Account state, role | `users.account_state`, `user_roles` | Generated | |
| Session records | `web_sessions` | Generated per sign-in | Token hash, expiry, revocation, rolling `last_seen_at` |
| One-time passcodes | `auth_otps` | Generated | Code is hashed; identifier is hashed. The `ip_hash` column exists but is written as `null` (`auth-login.ts` ~l.305) |
| IP address hash | `auth_rate_limits.bucket_key` (`auth:ip:<hash>` on password sign-in, `auth:refresh:ip:<hash>` on session refresh) | **Automatic**, from `CF-Connecting-IP` (`auth-login.ts` ~l.197, ~l.675) | Plain unsalted SHA-256; the address itself is discarded. **An unsalted hash of an IPv4 address can be reversed by brute force**, so treat it as personal data, not as anonymous. Product task: switch to a keyed hash (HMAC with a Worker secret) so the stored value cannot be reversed |

### 2.2 Health and fitness information — treat as sensitive throughout

| Data | Where | Notes |
|---|---|---|
| Date of birth, gender | `trainee_profiles` (via `PUT /me/trainee-profile`) | |
| Body measurements (weight and other types, with units and observation time) | `measurements` | Carries a `source` field |
| Photographs: progress, meal, check-in and profile (avatar) | `media_assets` (`media_type` ∈ `progress_photo`, `meal_photo`, `checkin_photo`, `avatar`) metadata in D1; the object itself in Cloudflare R2 | Includes original filename, size, content type, uploader. **A trainer can require meal photos**: `photo_requirement` (`none` / `selected_meals` / `all_meals`) on the nutrition configuration and `photo_required` on meal assignments. A required meal cannot be logged `confirmed` or `modified` without a ready `meal_photo` asset (`PHOTO_INTENT_REQUIRED`, `apps/api/src/routes/meals.ts` ~l.842; rule in `packages/core/src/meal.ts`); a `skipped` meal needs none. `tracking_requirements.require_progress_photos` is stored and returned by the configuration routes but **not enforced** anywhere today; there is no check-in photo requirement. If either is enforced later, update 03 §4.5, 04 §4.2 and 12 §7. Earlier drafts said FitBud never requires a photo; that was wrong and is corrected in 03, 04 and 12 |
| Progress entries (title, free text, observation time) | `progress_entries` | |
| Onboarding intake answers | `intake_submissions.answers_json` against a trainer- or FitBud-defined `intake_definitions.schema_json` | **Trainer-composed questions** — may contain injury, condition and dietary information |
| Check-in answers, including free text | `checkins.answers_json`, `checkin_reviews` | Against a pinned form version |
| Workout prescriptions and execution, set by set | `workout_expectations`, `workout_executions`, `exercise_executions`, `set_executions` | |
| Meal prescriptions, nutrition targets and meal compliance | `nutrition_expectations`, `meal_assignments`, `meal_compliance` | Includes deviation kind and notes |
| Custom foods a client created | `trainee_custom_foods` | |
| Meal times and overrides | `meal_time_overrides` | |
| Trainer notes about the client, including private ones | `trainer_notes` | D20: a note may be marked visible to the client, or kept private |
| Derived exceptions (missed, overdue) with their reason | `exceptions`, `exception_actions`, `interventions` | Generated by the server from expectations versus observations |
| Asked-coach markers | `coach_asks` | Records **that** a question was asked about an item; never the message |
| **Step counts** | `/me/steps` — **not collected today** | `steps_enabled` is false (`packages/core/src/config.ts:12`); the endpoint returns a disabled stub and rejects writes (`apps/api/src/routes/me-steps.ts`); no health permission is declared in `apps/mobile/app.json` and no health library is installed. Under D35 as superseded (30 Oct 2026) steps will be synced and trainer-visible when enabled |

### 2.3 Coaching administration

| Data | Where | Notes |
|---|---|---|
| Coaching relationship, its state and dates | `coaching_relationships` | The ownership spine for every protected record |
| Invitations | `client_invitations`, `client_invitations_next` | Includes the invited person's contact details and a pinned form version |
| Subscription and payment tracking | `subscription_versions` (plan name, payment frequency, start, renewal) | **Tracking only** — no money moves through FitBud |
| Plans and their immutable published versions | `plans`, `plan_versions`, `plan_templates`, `plan_assignment_policies` | A published version cannot be altered; an adjustment creates a new version |
| Reactivation requests, lifecycle notes | `reactivation_requests`, `coach_asks` | |

### 2.4 Device, messaging and operational data

| Data | Where | How obtained | Notes |
|---|---|---|---|
| Push token, platform, installation id, status, last seen | `device_tokens` | **Automatic** once notification permission is granted; refreshed on every `/me` | Installation id is a hash of the push token; nothing is persisted on the device (D-W2-13) |
| Notification records and delivery receipts | `notifications`, `notification_deliveries` | Generated | Provider status, provider message id, failure category, attempt number |
| Notification preferences and quiet hours | `notification_preferences`, `reminder_rules` | User-set | |
| Reminder responsiveness | `reminder_states` (`consecutive_ignores`, mode, paused until) | **Automatic** | Visible to the trainer (D12) |
| WhatsApp send ledger | `whatsapp_messages` (hashed recipient, template key, provider id, status), `whatsapp_opt_outs`, `whatsapp_ledger` | Generated — **dormant**, both flags off | Recipient number is hashed, not stored in clear |
| Access logs | Cloudflare Workers logs, via `apps/api/src/middleware/request-log.ts` | **Automatic**, one line per request | Request id, method, redacted path, status, latency, acting user id, surface, auth method. **No** bodies, cookies, tokens or signed URLs |
| Sync and idempotency records | `change_log`, `sync_mutations`, `idempotency_records` | Generated | **These store full response payloads** — see §5.3 |

### 2.5 Trainer visibility — owner decision, 3 Nov 2026

There is **no trainee-private category** of data. Everything a trainee enters into the coaching workflow — health records, injuries, conditions, medications, dietary restrictions, measurements, workout and nutrition records, check-ins, progress, meal and check-in photos — is visible to the trainee's active trainer. The only asymmetric data is the trainer's own private notes (D20). The Privacy Policy (04 §4.2), Trainee Terms (03 §4.2) and the in-app screens (12 §2.2, §6) must say so plainly.

## 3. What the system does *not* collect

Stating this explicitly is useful for the store disclosures and for the privacy notice.

- No analytics, product telemetry, usage statistics or attribution data.
- No advertising identifier, no advertising or marketing data, no third-party trackers, no cookies for anything but the session.
- No precise or coarse location. No contacts, calendar, photos library (beyond a photograph the user deliberately uploads), microphone or camera stream.
- No raw IP address, no user-agent string, no device fingerprint.
- No health-platform data (HealthKit, Health Connect) today — see §2.2.
- No message content from WhatsApp or anywhere else.
- No biometric data, no government identifier, no financial instrument, no credit data.
- No data purchased from or enriched by a third party.

## 4. Processors and sub-processors

| Processor | Purpose | Data it sees | Status |
|---|---|---|---|
| **Cloudflare, Inc.** — Workers, D1, R2, Queues, Durable Objects | The entire application, database, media storage and job queue | Everything in §2 | Live. Core infrastructure |
| **Google LLC** — Firebase / Google Identity Platform | Identity verification and token exchange | Email address, federated identity id, authentication events | Live. `apps/api/src/auth/firebase.ts`, `token-exchange.ts` |
| **Expo (650 Industries, Inc.)** — Expo Push Service | Push delivery to devices | Push token, notification routing payload (ids and type only — never coaching detail) | Live. `apps/api/src/lib/expo-push.ts` |
| **Apple Inc. (APNs)** and **Google LLC (FCM)** | Underlying push transport | Push token, routing payload | Live, via Expo |
| **Zoho Corporation** — ZeptoMail | Transactional email (passcodes, invitations, password reset, admin alerts) | Email address, name, message content | Live. `EMAIL_PROVIDER=zeptomail` |
| **Functional Software, Inc. (Sentry)** | Crash and error reporting, errors only, with PII scrubbing | Stack traces, request ids, scrubbed context | **Planned** — task BT2, decided in D-B8, not yet in the codebase. Must not be described as live until it ships |
| **Meta Platforms, Inc.** — WhatsApp Cloud API | Business-initiated utility and authentication messages | Mobile number, template parameters | **Built but switched off** behind `wa_automation` and `wa_otp`. Nothing is sent today |
| **Apple Inc.** (TestFlight) and **Google LLC** (Play closed testing) | Distribution of the beta builds | Tester email address, crash and install data held by the store | Live for the beta |

> **ACTION (founder):** for each live processor, confirm a data-processing agreement is in place and record where it lives. Cloudflare, Google, Zoho and Expo all publish standard terms; they need to be accepted rather than assumed.

## 5. Retention — proposed schedule

The retention policy is currently **open** in the product documentation (`docs/spec/trainer-web/TW-30-...md`: "Data retention is subject to the open retention policy"). This section proposes one. It needs founder sign-off and counsel confirmation, and then it needs to become code — a document that says 90 days while the database keeps rows forever is worse than no document.

### 5.1 Proposed periods

| Category | Proposed retention | Reasoning |
|---|---|---|
| Account and identity data | While the account is open; deleted within [[30]] days of a deletion request | |
| Coaching content (plans, logs, check-ins, measurements, exceptions) | While the account is open. On deletion of a client's account, deleted within [[30]] days | See §5.2 on the trainer's copy |
| Progress photographs in R2 | Same as coaching content; the object and its metadata deleted together | |
| Ended coaching relationship records | [[24]] months after the relationship ends, unless either party's account is deleted sooner | Reactivation restores history (D21), so a short period defeats the feature. 24 months is a guess and needs a decision |
| Session records (`web_sessions`) | Deleted [[30]] days after expiry or revocation | |
| One-time passcodes and their IP hashes | [[7]] days | Fraud and abuse investigation only |
| Rate-limit buckets | [[24]] hours after the window closes | |
| Device tokens | Until revoked, the installation changes, or [[180]] days without being seen | |
| Notification and delivery records | [[90]] days | Operational diagnostics |
| Reminder responsiveness counters | While the relationship is active | Trainer-visible (D12) |
| WhatsApp send ledger (hashed recipients) | [[12]] months | Cost accounting and Meta policy evidence |
| Access logs | **180 days, rolling** | The CERT-In Directions (2022) require ICT system logs for a rolling 180 days — a floor, not a cap (draft 13 P13). Workers' built-in log retention is shorter, so request logs must be exported (e.g. Logpush to R2) to meet it. The logs carry no coaching data, so the longer period is low-risk |
| Sync and idempotency records | **See §5.3 — currently unbounded** | |
| Backups (D1 Time Travel) | [[CONFIRM: the Time Travel window on the plan FitBud is on]] | A deletion is not complete until it has aged out of backups; the notice must say so honestly |

### 5.2 The problem a deletion request creates

When a client asks us to delete their account, their trainer's record of the coaching they delivered disappears with it. That is correct for the client's rights and awkward for the trainer, who may have professional-record reasons to keep something.

Proposed position, for counsel to confirm: **the client's request wins.** On deletion we remove the client's personal data; the trainer retains only what they have already copied outside FitBud, for which they are separately responsible (Trainer Terms §4.6). We do not retain a shadow copy for the trainer's benefit.

> **COUNSEL:** is there any Indian legal basis on which a personal trainer may *require* retention of a client's records against that client's erasure request? If so, we need a narrow exception and the notice must disclose it.

### 5.3 Two retention defects found in the code

These are real findings, not hypotheticals, and they should be fixed before the retention policy is published:

1. **`idempotency_records.response_body`** stores the full response body of a mutation, with an `expires_at`, but no job deletes expired rows (`apps/api/src/lib/idempotency.ts` filters on expiry at read time only). Expired personal data stays in the database.
2. **`sync_mutations.result_body`** stores the full result body of every offline mutation, with **no expiry column at all** and no pruning.

Both therefore hold copies of coaching data indefinitely, outside every period in §5.1. Fixing them is a small API task and should be raised as one.

## 6. Security measures

Stated as fact, for the privacy notice's security section. Each is verifiable in the repository.

| Measure | Detail |
|---|---|
| Transport encryption | HTTPS/TLS throughout, terminated by Cloudflare |
| Encryption at rest | Provided by Cloudflare for D1 and R2 |
| Password storage | PBKDF2-SHA256 with a per-user salt and a fixed iteration count (`apps/api/src/auth/password.ts`) — never reversible |
| Session cookies | `httpOnly`, `sameSite=Lax`, `secure` in deployed environments (`apps/api/src/routes/auth.ts:142`) |
| Passcodes and tokens | One-time passcodes, session tokens and WhatsApp recipients are stored as hashes, never in clear |
| Authorisation | Actor, role and ownership are resolved **on the server** for every protected request; client-sent owner, trainer, trainee or role fields are never trusted. Every protected entity has an ownership path through the coaching relationship |
| Tenant isolation | A trainer can reach only their own clients' records; a client only their own |
| Media access | R2 object keys are never used as authorisation; metadata and ownership live in D1 and are checked per request |
| Logging hygiene | Access logs carry no bodies, cookies, tokens or signed URLs; push tokens are never logged; no coaching detail is put in a push payload |
| Secret handling | Provider credentials are Worker secrets, never in the repository; a runtime guard refuses to serve a deployed environment with a missing or blank provider secret |
| Immutability | Published plan versions cannot be altered; an adjustment creates a new version, so a historical record cannot be rewritten |
| Read-only after end | Ended coaching relationships are read-only on the server as well as in the UI |
| Backups | Cloudflare D1 Time Travel, with a documented restore rehearsal (beta must-have, D-B1) |

Not claimed, and not to be claimed: no ISO 27001, no SOC 2, no penetration test, no bug-bounty programme, no 24×7 monitoring. The notice must not imply any of them.

## 7. Where the data is

**This needs to be established as fact before the privacy notice is published.**

FitBud runs on Cloudflare Workers, which executes at edge locations worldwide. D1 databases have a primary region; `apps/api/wrangler.toml` does not pin one, and R2 buckets have a location hint that is likewise not set. So the data is very probably stored outside India, and we cannot currently say where.

> **ACTION (founder):** determine, from the Cloudflare dashboard, the actual primary region of the production D1 database and the location of the `fitbud-media` R2 bucket, and record it here. If an India or Asia-Pacific location is available and desirable, decide before production data exists, because moving a D1 primary afterwards is not trivial.

> **COUNSEL:** once the locations are known, please confirm (a) what the notice must say about cross-border processing under the DPDP Act, (b) whether any of the locations fall foul of a restriction notified under the Act, and (c) whether a transfer mechanism needs to be documented with Cloudflare.

## 8. Automated decision-making

There is none. FitBud derives states — missed, overdue, logged late — deterministically from persisted expectations and observations, and displays the reason. It produces no score, no percentage, no risk label, no profile and no recommendation, and it never resolves an exception by itself: only the trainer can. No decision affecting a person is taken by the system.

This is a product rule, not a current implementation detail, and it is worth saying in the notice: it is a straightforward answer to a question most health apps answer badly.

## 9. Maintenance

This document must be updated when any of the following happens, and the Privacy Policy re-checked against it:

- a new table or column holds personal data;
- a new processor is added, or a planned one goes live (Sentry, WhatsApp);
- `steps_enabled` is switched on;
- the retention schedule is implemented in code;
- the Cloudflare data locations are established or changed.
