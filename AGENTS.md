# FitBud · rules for every agent

FitBud is an India-first coaching app for independent personal trainers: an MVP heading to a 20-trainer **closed** beta (TestFlight + Google Play closed testing). This file is the one rulebook for every agent (Grok/Cursor bots and Claude Code) and for developers. `CLAUDE.md` imports it and adds only Claude-specific notes.

Build the smallest coherent MVP that connects trainer expectations with low-friction trainee execution and surfaces meaningful exceptions to trainers. Do not broaden the product. A missing requirement is a question, not permission to invent a feature.

## Who does what

| Who | Does | Never |
|---|---|---|
| **Planning agents** (Grok bots in Cursor) | Turn `docs/tasks/` rows into task specs and batch files, check `main` for gaps, write decisions in. | Build product code, trigger Claude (no `@claude` comments, no API calls on the subscription). |
| **Coding agents** (Claude Code cloud sessions) | Run a whole batch: build, review, merge, write the batch report. | Run remote or deploy commands, handle secrets. |
| **Firoz** (owner, tech@thefitbud.com) | Launches a batch, answers open decisions, does the manual steps (DNS, secrets, deploys, store consoles, device checks). | Review code line by line (see "No human code review"). |

**One batch runs in one tool.** Planning hands over through merged specs and batch files only. The flow is in `docs/specs/README.md`.

## Source of truth

1. **The task spec**, `docs/specs/<ID>.md`. It is self-contained: you need nothing beyond it, the frames it names and the code it names. Its batch file is `docs/specs/batches/Wn.md`.
2. **Decisions** are written once, in the batch file, as `D-Wn-x` ("decided by <who>, <date>"). Specs cite the ID; they don't copy the text. Where a spec and its batch file disagree, the batch file wins; report the difference.
3. **Locked frames**, `docs/design/mockups/png/` (index and precedence: `docs/design/README.md`; also read `DESIGN-NOTES.md` and `DECISIONS-21OCT.md` there). Every frame is locked. Refer to a frame by its file name. `docs/spec/mockups*/` and older frames in git history are retired.
4. **Content rules**, `docs/spec/01-product-rules.md` and `docs/spec/banned-strings.json`.
5. **QA reports**, `docs/qa/` (`QA-<ID or PR>.md`; index in `docs/qa/README.md`).
6. **Repository** contracts, code, Drizzle schema, migrations and tests for what is implemented.
7. **Confluence is reference only** (D-W2-10). Read it if the connector is available and the spec points to it. Never block on it. If it disagrees with the spec, follow the spec and report the difference in the PR.

When an accepted decision changes the documented model, update the doc it changes.

## Stop and ask

There is **no mid-task human approval**: if the spec decides it (a new provider, an auth change), build it. Stop and report (comment on the PR or end the session with a question) only when:
- The spec has no task file, or a frame or decision it needs is missing or still **Open**.
- The spec leaves open a question whose answer changes product behaviour, scope, architecture, auth, ownership or data.
- The work would make a destructive or irreversible migration, rewrite historical coaching records, change published-plan immutability or discard user data, and the spec doesn't say so explicitly.
- A file outside the spec's `files_owned` must change.
- The work needs a remote or deploy command, a production credential or production data. Agents never have these.

## Before each task: check the spec against `main`

Specs are written before the batch runs, and `main` moves. Before building, re-check each item of the spec's gap list against the latest `main`. Drop what is already done and say so in the PR ("already on main via #NN"). If what is left no longer matches the outcome, stop and report instead of rescoping on your own.

## Commands (repo root; Node 22.23+, pnpm 9.15.4)

```bash
pnpm install
pnpm setup:local          # creates apps/api/.dev.vars
pnpm build:packages       # needed before lint/typecheck/test
pnpm db:reset             # migrations + library + realistic demo seed (~2.5 min)
pnpm api                  # API on 8787
pnpm web                  # trainer web on 5173 (proxies /api to the API)
pnpm lint && pnpm typecheck && pnpm test   # what the required `ci` check runs
pnpm affected             # lint/typecheck/test for packages changed since HEAD^1
```

Trainer-web e2e (Playwright). Global setup **resets the local DB and restarts the API**:
```bash
cd apps/trainer-web
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm test:e2e          # full e2e on spare ports
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm test:e2e:banned   # banned-strings scan only
```
On the default port 8787, global setup kills every local wrangler/workerd; on any other port only what listens there. `SKIP_E2E_API_BOOT=1` reuses a running, seeded API. `TRAINER_WEB_URL` reuses a running web server.

Demo sign-in: `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`. All personas: `docs/LOCAL_TESTING.md`.

## Visual check (UI tasks)

1. Run the app on the demo seed.
2. Capture the screen with Playwright at the frame's viewport: web 1440×900, iPad 1024×768 / 768×1024, iOS 393×852, Android 412×915.
3. Save the screenshots to `docs/qa/<ID>/` and put them next to the frame in the PR.

PASS means layout, copy and every state match the frame. Tests and CI passing are not enough. Don't invent screens, states or copy.

## Product rules (never break)

- No auto-resolve: only the trainer resolves an exception. A late log is "logged late", never auto-closed. Exceptions keep their source signal.
- No auto-send: WhatsApp is a wa.me prefill that the user sends, contextual and secondary.
- No percentages or streaks. No invented insights, risk scores, diagnoses or coaching recommendations.
- Dates read like "Wed 21 Oct". No ISO dates or raw enum values in the UI.
- Touch targets are at least 44 pt; web is keyboard-accessible. Never show state by colour alone.
- Ended clients are read-only, on both the server and the UI.
- Payments are tracking only (amount, subscription type, coaching mode, start and due dates, paid/unpaid, method Cash/UPI/Bank). No collection, gateway, invoices or session counting.
- External meeting links on calendar entries are fine. No in-app chat, video or voice calling, organization roles or trainer-team permissions.
- Steps (HealthKit / Health Connect, trainer-visible) and push notifications are in the MVP.
- Exercise drawings and wger exercise text are CC BY-SA: show the credit wherever they appear (`docs/spec/credits-and-licences.md`).
- Light theme only; the exploratory dark theme needs a decision first.
- Every visible dynamic value has a defined backend source.
- Design from domain state and transitions, not from a feature inventory or screen appearance alone. One dominant purpose and primary action per screen or card; progressive disclosure (attention summary → client workspace → history). Prefer clear lists and hierarchy over cards, pills, gradients and decorative analytics; motion only for state, completion, transition or feedback.

## Architecture

```
apps/api            API, authorization, D1, R2, sync, jobs, realtime coordination
apps/trainer-web    Trainer web app (online-only)
apps/mobile         Role-aware trainer and trainee Expo app
packages/contracts  Shared Zod request, response and domain schemas
packages/core       Platform-independent domain rules
packages/api-client Typed API client
packages/ui-mobile  Mobile UI primitives
packages/config     Shared workspace configuration
```
Update this map when the structure changes.

- Apps depend on packages, never on another app's source. Only `apps/api` touches D1 or R2; schema and migrations live there.
- Shared validation lives in `packages/contracts`; web and mobile use `packages/api-client`, not handwritten clients. Don't duplicate domain types across apps.
- `packages/core` holds only genuinely shared rules and stays free of Cloudflare and any other provider.
- Cloudflare (D1, R2, Workers, Queues, Cron, Durable Objects) is replaceable infrastructure, not a product concept. Keep provider code inside the API boundary; contracts describe FitBud behaviour. No speculative multi-provider abstractions.
- D1 and the API are authoritative. SQLite, notifications and realtime events are projections or delivery, never workflow state. REST + sync for state; Durable Objects/WebSockets only for selected change notifications; everything stays correct without realtime.

## Domain invariants

- Trainer and trainee surfaces show the same coaching state.
- A trainer accesses only relationships they own; a trainee only their own permitted records.
- Published plan versions are immutable. An adjustment creates a new version with an effective time; history references the version used at execution time.
- Missed and overdue states are derived from persisted expectations and observations.
- The normal trainee path needs minimal input; ask for detail only when the workflow requires it.

## API, data, offline and push

- **API:** resolve actor, role and ownership on the server for every protected request; never trust client-sent owner, trainer, trainee or role fields. Shared schemas in and out. Stable domain error codes, one error body. Opaque cursor pagination for changing collections. UTC timestamps plus stored user timezones. Idempotency keys for retryable and offline mutations. Optimistic concurrency on drafts and sync records; return conflicts, never silently overwrite. No sensitive data in errors, logs, notifications or analytics.
- **Database:** every protected entity has an ownership field or an unambiguous path through the coaching relationship. Committed Drizzle migrations for every change; never edit an applied migration. Constraints for important invariants where D1 allows. Stable UUIDs for public and offline-created records; versions and timestamps on sync records; tombstones where offline clients must see deletes. R2 metadata and ownership live in D1; raw object keys are never authorization. No tenant or organization layer.
- **Offline (mobile):** write to SQLite before enqueueing in the outbox; one mutation UUID and idempotency key per logical action, reused on retry; apply server results transactionally to local state and outbox; advance the sync cursor only after applying; conflict behaviour defined per entity; files upload separately from structured mutations. Don't claim offline support until airplane-mode create, restart, reconnect, retry and duplicate delivery are tested. No universal last-write-wins.
- **Push and realtime:** push payloads carry routing only, no coaching details. Reminder evaluation uses authoritative schedules and completion state; dedupe before delivery; record provider acceptance separately from completion. Realtime events carry ids, event type and server version; on receipt, refetch or sync.

## Tests

- Tests exercise real workflows on persisted domain data through the same contracts and resolution logic as production. No mock-only domain keys or shortcuts that bypass configuration, lookup, ownership, versioning or state transitions. Fixtures look like realistic product data.
- Never weaken validation, authorization or tests, or add test-only behaviour to domain logic, to make a change pass.
- Onboarding: invitation pins an exact form version → submission → trainer review → coaching-ready. A later form version never retargets an issued invitation. Cover global and trainer-specific definitions.
- Subscriptions: persisted relationship-owned subscription version; plan name, payment frequency, civil start and renewal dates, renewal state in the trainer's timezone, the attention list and `subscription_renewal_reminder`.
- Run what the change touches: lint, typecheck, unit, contract, API authorization, migration validation, integration, e2e for critical paths, offline/retry for sync changes, accessibility and the visual check for UI. Never report a check as passing unless it ran; say plainly what you could not run.

## Git, PRs and merging

- **One task, one branch, one PR, off the latest `main`.** Coding branches: `claude/<ID>-<slug>`. Planning branches: `grok/<batch>-specs`. PR title `<ID>: <summary>`; fill in `.github/pull_request_template.md`. Don't stack unless the spec says to. A slice may span the API, contracts, api-client and both apps; don't split one feature by directory, and keep no long-lived workstream branches.
- **Planning PRs are the save point.** A planning agent opens its batch's PR as a draft on the first commit, and the description lists every spec in the batch with a tick as each is written. If the planner stops (for example, Grok's weekly limit), the next agent reads that PR and finishes the unticked specs.
- Update a branch by merging `main` into it. Never rebase, force-push, amend a pushed commit or skip hooks.
- **Keep PRs pure.** Backend/migration PRs are separate from UI PRs. One migration at a time: take the next free number from `apps/api/drizzle/meta/_journal.json` when the PR opens, renumber at merge if another landed first. Commit only the task's slice, never unrelated changes or secrets.
- **Merging:** merge commits only, bottom-up, when `ci` is green and review passed. Never squash, never `--admin`. Never touch PRs labelled `do-not-merge`. Never close PRs, change labels or delete branches.
- **Never run remote or deploy commands** (`wrangler deploy`, `d1 … --remote`, `seed --remote`, `eas submit`, store consoles). Firoz runs them. **No secrets** in code, chat, logs or commits; only `.example` env files and the demo seed.

## No human code review (owner, 31 Oct 2026)

No person reads code line by line. Agents write, review and merge code at every level, including auth, security, data, migrations and infrastructure config. This overrides any spec, batch file or template text that asks Firoz to review or approve code (such as older "What Firoz reviews" lines); treat it as superseded and update it when you touch that file.

Agents compensate with care:
- Every code PR gets a **fresh reviewer** that sees only the spec and the diff, never the builder's conclusions.
- Extra scrutiny and tests on auth, data and security changes; mutation-checked tests for fixes.
- At most one fix round from review, then re-scope smaller.

**Standing authorization (owner, 31 Oct 2026):** open the PR when the work is done, get the fresh review, fix what it confirms, and merge once `ci` is green and review passes. This counts as the batch file allowing the merge. The stop rules above still apply.

## Definition of done

The user outcome works and the acceptance criteria are met; nothing unrelated was added; role and ownership boundaries hold; contracts and consumers agree; schema changes have migrations; retryable mutations are idempotent; offline and realtime behaviour stays correct; relevant checks pass; errors are actionable and logs carry nothing sensitive; UI states are backend-realistic, accessible and match the frames; docs changed by a decision are updated; the final diff was reviewed for regressions, stale code and scope creep. Report the checks you ran and their results.
