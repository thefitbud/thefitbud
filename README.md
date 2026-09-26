FitBud
FitBud is a trainer-focused fitness coaching platform that connects trainer planning with low-friction trainee execution. The MVP is designed to help trainers identify who needs attention without manually inspecting every client or repeatedly chasing updates.
The product has two role-based experiences backed by shared state:
- A React and Vite trainer web application for deep coaching work.
- An Expo mobile application for trainer quick use and trainee daily execution.
The API runs on Cloudflare Workers with Hono. D1 is the authoritative application database, R2 stores files, Firebase provides authentication and push delivery, and mobile SQLite supports offline-first trainee workflows.
Repository structure
apps/
  api/              Hono API, D1 access, migrations, sync and background handlers
  trainer-web/      React and Vite trainer application
  mobile/           Expo application for trainer and trainee roles

packages/
  contracts/        Shared request, response and domain validation schemas
  core/             Platform-independent business rules and shared domain logic
  api-client/       Typed API client used by web and mobile
  ui-mobile/        Shared mobile UI primitives
  config/           Shared TypeScript, linting and build configuration
If an actual directory name differs, the repository is authoritative. Update this map in the same change that renames or restructures a package.
Dependency direction
applications
    ↓
api-client and platform UI
    ↓
contracts and core
- Applications may import packages.
- Applications must not import implementation code from another application.
- core must remain independent of React, Expo, Cloudflare, D1, and R2.
- contracts owns shared schemas, not business workflows or UI state.
- Only apps/api accesses D1 and R2.
- Database schema and migrations remain with the API.
Product boundaries
Trainer web
Trainer web is online-only and supports attention management, clients, onboarding review, coaching configuration, plans, adherence, check-ins, progress, history, and scheduling.
Mobile
Mobile is role-aware:
- Trainer mode supports attention review, client lookup, check-ins, and selected quick actions.
- Trainee mode supports onboarding, Today, workouts, diet compliance, check-ins, progress, push notifications, and offline-first daily workflows.
Deep plan editing remains optimized for trainer web.
Realtime and communication
Selected WebSocket events improve cross-surface freshness. D1 and the HTTP/sync APIs remain authoritative. The MVP does not include in-app chat and does not attempt to replace WhatsApp.
Design direction
- Trainer UI is an attention and coaching workspace, not a generic CRM or giant dashboard.
- Trainee UI is a mobile coaching companion optimized for the next action and minimal input.
- Show only stored, deterministically derived, explicitly entered, or integration-backed information.
- Use progressive disclosure and one primary action per screen or card.
- Use the current light-theme trainee references; dark-theme work remains exploratory.
- Preserve the FitBud indigo and coral identity without overusing gradients, cards, or pills.
- Accessibility and workflow correctness take priority over decorative polish.
Technical stack
Area	Technology
Language	TypeScript
Workspace	pnpm and Turborepo
Trainer web	React, Vite and React Router
Mobile	Expo and React Native
Server	Hono on Cloudflare Workers
Database	Cloudflare D1 and Drizzle
Files	Cloudflare R2
Mobile storage	SQLite
Authentication	Firebase Authentication
Push	Firebase Cloud Messaging
Jobs	Cloudflare Queues and Cron Triggers
Realtime	Durable Objects and WebSockets for selected updates
Data fetching	TanStack Query


Authoritative documentation
The project maintains six focused Confluence pages:
1. FitBud Project Details - product purpose, users, MVP scope, non-goals, and success measures.
2. FitBud Workflows and States - domain workflows, transitions, exceptions, and cross-surface consequences.
3. FitBud UX and Screen Architecture - navigation, screen behavior, design system, theme, and accessibility.
4. FitBud Technical Architecture and SLOs - system boundaries, services, auth, offline sync, notifications, realtime, and operational targets.
5. FitBud Conceptual API Contract - API behavior, authorization, sync, notifications, and realtime conventions.
6. FitBud Conceptual Database Schema - entities, relationships, invariants, ownership, and sync metadata.
The repository becomes authoritative for implemented contracts, schema, migrations, and commands. Agents.md contains the working rules for both agents and developers.
Local development
Use the scripts defined in the root package.json. The root workspace must expose scripts for:
- Development.
- Build.
- Linting.
- Type checking.
- Tests.
- Affected-package validation.
- API database migrations.
Do not create undocumented application-specific command paths when a root workspace script can provide a consistent entry point.
Delivery rules
- Work in small vertical slices tied to one user outcome.
- Update shared contracts before or with consumer changes.
- Add migrations for every database change.
- Preserve published plan and historical execution semantics.
- Test role and ownership authorization for protected operations.
- Test offline retry and idempotency for sync-capable mutations.
- Keep notifications and realtime delivery separate from domain state.
- Update the relevant authoritative document when product or architectural behavior changes.
See Agents.md for the complete implementation workflow and completion criteria.