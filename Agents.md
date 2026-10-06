FitBud Agent Instructions
Mission
Implement the smallest coherent FitBud MVP that connects trainer expectations with low-friction trainee execution and surfaces meaningful exceptions to trainers.
Do not broaden the product while implementing a task. Missing requirements are questions, not permission to invent features.
Sources of truth
Read the applicable source before planning:
1. The current task and its acceptance criteria.
2. FitBud Project Details in Confluence for product purpose, scope, non-goals, and success measures.
3. FitBud Workflows and States in Confluence for behavior, transitions, derived states, and cross-surface consequences.
4. FitBud UX and Screen Architecture in Confluence for navigation, interactions, visual rules, theme, and accessibility.
5. FitBud Technical Architecture and SLOs in Confluence for applications, services, authentication, offline sync, delivery systems, and operational targets.
6. FitBud Conceptual API Contract in Confluence for API behavior and cross-client contracts.
7. FitBud Conceptual Database Schema in Confluence for data ownership, relationships, and invariants.
8. Repository contracts, code, Drizzle schema, migrations, and tests for implemented behavior.
When these sources conflict, stop and report the conflict. Do not silently select an interpretation.
Context loading rule
Read only the pages needed for the task:
Task	Required pages
Product scope or acceptance criteria	Project Details and relevant Workflows and States section
Web or mobile UI	Relevant Workflows and States section plus UX and Screen Architecture
API implementation	Relevant Workflows and States section plus Conceptual API Contract
Database or migration	Relevant Workflows and States section plus Conceptual Database Schema
Auth, sync, notifications, realtime, deployment, or capacity	Technical Architecture and SLOs plus the affected API or database section


Do not load every document by default.
Repository map
apps/api            API, authorization, D1, R2, sync, jobs and realtime coordination
apps/trainer-web    Trainer deep-work web application
apps/mobile         Role-aware trainer and trainee mobile application
packages/contracts  Shared Zod request, response and domain schemas
packages/core       Platform-independent domain rules
packages/api-client Typed API client
packages/ui-mobile  Mobile UI primitives
packages/config     Shared workspace configuration
Use the actual repository tree if it differs and update this map when structure changes.
Architectural rules
- Applications may depend on packages; applications must not depend on another application's source.
- Keep platform-independent rules in packages/core only when they are genuinely shared.
- Keep shared request and response validation in packages/contracts.
- Use packages/api-client from web and mobile rather than creating parallel handwritten clients.
- Only apps/api accesses D1 or R2.
- Keep database schema and migrations with apps/api.
- Keep trainer web online-only.
- Support trainer and trainee modes in the Expo mobile application.
- Treat D1 and the API as authoritative. SQLite, notifications, and realtime events are projections or delivery mechanisms.
- Use REST and sync for normal state. Use Durable Objects and WebSockets only for selected change notifications.
- Do not add in-app chat, payment tracking, organization roles, or trainer-team permissions to the MVP.
Provider portability rule
- Cloudflare is an infrastructure choice, not a domain-model choice.
- Product behavior, domain rules, shared contracts, and client behavior must remain provider-neutral.
- Keep provider-specific implementations inside the API/infrastructure boundary; `packages/core` must remain independent of Cloudflare, D1, R2, Workers, Queues, Cron Triggers, Durable Objects, and other infrastructure providers.
- Treat D1, R2, Workers, Queues, Cron Triggers, Durable Objects, and WebSockets as replaceable infrastructure capabilities, not product concepts.
- A future provider migration may require infrastructure adapters and data/migration work, but must not require a rewrite of FitBud domain behavior or shared product contracts.
- API contracts must describe FitBud behavior and domain semantics, not provider-specific implementation details.
- Do not introduce speculative multi-provider abstractions. Add an abstraction only when it protects a real infrastructure boundary or a realistically foreseeable migration.
- Cloudflare remains the current MVP infrastructure choice unless an explicit architecture decision changes it.
Product invariants
- Trainer and trainee surfaces show the same underlying coaching state.
- A trainer may access only coaching relationships they own.
- A trainee may access only their own permitted records.
- Published plan versions are immutable.
- Plan adjustments create a new version with an effective time.
- Historical execution references the plan version used at execution time.
- Notifications are not workflow state.
- Realtime events are not workflow state.
- Missed and overdue states are derived from persisted expectations and observations.
- Exceptions retain their source signal and do not replace it.
- FitBud presents context to trainers; it does not make automatic coaching decisions.
- The normal trainee path should require minimal input. Ask for detail only when the workflow requires it.
Design rules
- Design screens from domain state and transitions, not from a feature inventory.
- Every visible dynamic value must have a defined backend source.
- Give each screen or card one dominant purpose and primary action.
- Use progressive disclosure: attention summary, client workspace, then history or analytics.
- Do not create fake intelligence, unsupported live data, risk scores, diagnoses, or automatic coaching recommendations.
- Keep WhatsApp contextual and secondary.
- Prefer clear lists and hierarchy over excessive cards, pills, gradients, glass effects, or decorative analytics.
- Use the current approved light-theme trainee direction. Do not implement the exploratory dark theme without approval.
- Preserve semantic status colors and never communicate state by color alone.
- Use practical touch targets on mobile and keyboard-accessible interactions on web.
- Keep motion purposeful and related to state, completion, transition, or feedback.
- Existing Stitch screens are references. Current product, workflow, backend, accessibility, and design rules take precedence.
API rules
- Resolve actor, role, and ownership on the server for every protected request.
- Never trust client-provided owner, trainer, trainee, or role fields for authorization.
- Use shared schemas for API input and output.
- Use stable domain error codes and a consistent error body.
- Use opaque cursor pagination for changing collections.
- Use UTC timestamps and separately stored user timezones.
- Require idempotency keys for retryable and offline-capable mutations.
- Use optimistic concurrency for mutable drafts and sync-enabled records.
- Return conflicts rather than silently overwriting newer state.
- Keep sensitive data out of errors and logs.
Database rules
- Every protected entity must have a direct ownership field or an unambiguous ownership path through the coaching relationship.
- Use committed Drizzle migrations for every schema change.
- Do not edit an already applied migration.
- Enforce important invariants with database constraints where D1 supports them.
- Use stable UUIDs for public and offline-created domain records.
- Include versions and timestamps on sync-enabled records.
- Use tombstones when a deletion must be observed by offline clients.
- Store R2 object metadata and ownership in D1; do not expose raw object keys as authorization.
- Do not create a tenant or organization layer for the MVP.
Mobile offline rules
- Write offline-capable trainee actions to SQLite before enqueueing them in the outbox.
- Generate one stable mutation UUID and idempotency key per logical action.
- Reuse the key for retries.
- Apply server results transactionally to local state and the outbox.
- Advance the sync cursor only after applying the represented changes.
- Define conflict behavior per entity.
- Upload files separately from structured sync mutations.
- Do not claim offline support for a workflow until airplane-mode creation, restart, reconnect, retry, and duplicate-delivery scenarios are tested.
Push reminders and realtime
- Push payloads contain routing information, not sensitive coaching details.
- Scheduled reminder evaluation uses authoritative schedules and completion state.
- Deduplicate reminders before delivery.
- Record provider acceptance separately from application completion.
- Realtime events contain identifiers, event type, and server version.
- On receiving a realtime event, refetch or sync authoritative state.
- All workflows must remain correct when realtime delivery is unavailable.
Working-session process
For each task:
1. Read the relevant Confluence sections and repository code.
2. Restate the user-visible outcome and non-goals.
3. Identify affected applications, packages, contracts, data, migrations, and tests.
4. List unresolved questions and stop if an answer changes product behavior or architecture.
5. Create a short implementation plan for the current session.
6. Implement the smallest vertical slice that satisfies the acceptance criteria.
7. Run the relevant repository checks.
8. Review the diff against product scope, architecture, authorization, offline behavior, and compatibility.
9. Summarize the result, checks run, remaining risks, and any follow-up work.
Session plans are temporary. Do not add a permanent plan file unless a task explicitly requires a multi-session tracked plan.
Plan format
Use this compact format:
Outcome
- User-visible result

Scope
- Affected applications and packages

Steps
1. Contract or schema work
2. Implementation
3. Verification

Risks or questions
- Only material uncertainties

Done when
- Observable acceptance criteria
Human approval required
Stop before implementing when a task would:
- Change MVP scope or a documented non-goal.
- Introduce a new role, application, provider, or infrastructure service.
- Change authentication or authorization boundaries.
- Change ownership semantics.
- Make a destructive or irreversible migration.
- Remove or rewrite historical coaching records.
- Change published-plan immutability or version-effective behavior.
- Choose unspecified conflict resolution that could discard user data.
- Put sensitive information in notifications, logs, or analytics.
- Require production credentials or direct production-data access.
Required verification
Run the checks relevant to the changed scope using root workspace scripts:
- Formatting and linting.
- Type checking.
- Unit tests.
- Contract tests.
- API authorization tests.
- Migration validation.
- Integration tests for affected workflows.
- Web or mobile end-to-end tests for critical user paths.
- Offline and retry tests for sync-capable mobile changes.
- Accessibility checks for affected UI.
- Visual review at supported responsive breakpoints for affected screens.
Do not report a check as passing unless it was run successfully. State clearly when a check could not be run.
Testing and data realism rules
- Tests must exercise real product workflows using persisted domain data and the same contracts/resolution logic used by production code.
- Do not introduce fake, hard-coded, mock-only domain keys or shortcuts that bypass real configuration, lookup, ownership, versioning, or state-transition behavior.
- Onboarding tests must use persisted onboarding form definitions and exercise the real flow: form resolution → invitation → onboarding submission → trainer review → coaching-ready state.
- When onboarding supports both global and trainer-specific definitions, tests must cover both resolution paths and verify that the submitted response remains tied to the exact definition/version used at submission time.
- Test fixtures should resemble realistic product data and relationships rather than synthetic placeholders that could hide lifecycle, authorization, filtering, versioning, or migration problems.
- A test helper may create fixture data, but it must create the same persisted entities and valid relationships that the production workflow expects.
- Do not weaken production validation or introduce test-only behavior into domain logic merely to simplify tests.
- When a product decision changes the data model or workflow, update the affected fixtures and integration tests so they continue to represent the real product flow.
- Subscription tests must use a persisted relationship-owned subscription version and exercise plan name, payment frequency, civil start and renewal dates, derived renewal state in the trainer timezone, the trainer attention list, and the `subscription_renewal_reminder` path. Do not invent amounts, invoices, or payment collection.
Definition of done
A task is complete only when:
- The requested user outcome works.
- Acceptance criteria are satisfied.
- No unrelated product behavior was added.
- Role and ownership boundaries are enforced.
- Shared contracts and consumers agree.
- Schema changes include migrations.
- Retryable mutations are idempotent.
- Offline and realtime behavior remains correct for the affected workflow.
- Relevant tests and static checks pass.
- Errors are actionable and logs contain no sensitive payloads.
- UI states are backend-realistic, accessible, and consistent across trainer and trainee surfaces.
- Authoritative documentation is updated when a product or architectural decision changes.
- The final diff has been reviewed for regressions, stale code, and accidental scope expansion.
Prohibited shortcuts
- Do not implement from screen appearance alone; follow the documented workflow and state transitions.
- Do not duplicate domain types independently across applications.
- Do not access D1 or R2 directly from web or mobile.
- Do not mutate published plan versions.
- Do not use notifications or WebSockets as the only record of an action.
- Do not use silent last-write-wins as a universal sync policy.
- Do not add speculative abstractions or features for possible future requirements.
- Do not weaken tests, authorization, or validation to make a change pass.
- Do not delete or rewrite unrelated user work.