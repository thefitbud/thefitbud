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


API documentation
The running API serves its generated contract:
- GET /docs is the interactive Scalar reference.
- GET /openapi.json is the OpenAPI document.
Both are public and same-origin. Try-it-out calls the API directly and does not add credentials. Protected operations still require a session cookie or bearer token.
Authoritative documentation
The project maintains six focused Confluence pages:
1. FitBud Project Details - product purpose, users, MVP scope, non-goals, and success measures.
2. FitBud Workflows and States - domain workflows, transitions, exceptions, and cross-surface consequences.
3. FitBud UX and Screen Architecture - navigation, screen behavior, design system, theme, and accessibility.
4. FitBud Technical Architecture and SLOs - system boundaries, services, auth, offline sync, notifications, realtime, and operational targets.
5. FitBud Conceptual API Contract - API behavior, authorization, sync, notifications, and realtime conventions.
6. FitBud Conceptual Database Schema - entities, relationships, invariants, ownership, and sync metadata.
The repository becomes authoritative for implemented contracts, schema, migrations, and commands. AGENTS.md contains the working rules for both agents and developers.
## Local development

### Install dependencies and prepare the API

Requirements: Node.js 20 or newer and pnpm 9.15.4. From the repository root:

```sh
pnpm install
pnpm exec turbo run build --filter=@fitbud/api...
pnpm db:migrate:local
```

### Run all applications

Start the API, trainer web, and mobile app together:

```sh
pnpm dev
```

### Run applications separately

Run an individual application from the repository root:

```sh
pnpm api
pnpm web
pnpm mobile
```

### Local URLs and configuration

The API listens at `http://127.0.0.1:8787` (interactive API docs: `/docs`). Trainer web defaults to `http://127.0.0.1:5173` (Vite uses the next free port if 5173 is taken). The trainer web dev server proxies `/api` requests to the local API. Expo prints instructions for opening the mobile app in a simulator or development client; mobile needs the API running as well. By default, mobile targets the local API. To override that address, set `EXPO_PUBLIC_API_BASE_URL` as described in `.env.example`.

The root `package.json` also defines workspace-wide build, lint, typecheck, test, affected-package validation, and API database scripts.

## Run locally

Detailed setup for day-to-day development on Windows, macOS, and Linux. For workflow walkthroughs and every demo account, see [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md).

### Prerequisites

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | **22.23 or later** (required for D1 FTS5 in local Wrangler). Install with [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows). |
| **pnpm** | **9.15.4** via Corepack: `corepack enable` then `corepack prepare pnpm@9.15.4 --activate`. |
| **Git** | Any recent version. |
| **Expo Go** | On a physical phone (App Store / Play Store) for the quickest mobile loop. |
| **Android Studio** | Optional — Android emulator and SDK platform tools. |
| **Xcode** | Optional, **macOS only** — iOS Simulator. |

### Clone and first-time setup

**macOS / Linux (bash or zsh):**

```sh
git clone <repository-url>
cd thefitbud
pnpm install
pnpm setup:local
pnpm db:reset
```

**Windows (PowerShell):**

```powershell
git clone <repository-url>
cd thefitbud
pnpm install
pnpm setup:local
pnpm db:reset
```

`setup:local` ensures `apps/api/.dev.vars` exists. `db:reset` applies migrations, loads the **FitBud Tech v2** library (manifest `2026.10.2`), and seeds the realistic demo world (27 accounts, up to 8 months of history; see [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md#realistic-demo-world) and [docs/seed/SEED_DESIGN.md](docs/seed/SEED_DESIGN.md)). Re-seed without re-migrating with `pnpm db:seed:local`. Both work from the repo root in PowerShell and bash; reset takes ~2.5 min. After reset, confirm library counts (global templates are **10**; demo may add trainer-owned templates):

```sh
cd apps/api
pnpm exec wrangler d1 execute fitbud --local --command "SELECT COUNT(*) AS foods FROM food_library_items WHERE seed_version='2026.10.2';"
pnpm exec wrangler d1 execute fitbud --local --command "SELECT COUNT(*) AS exercises FROM exercise_library_items WHERE seed_version='2026.10.2';"
pnpm exec wrangler d1 execute fitbud --local --command "SELECT COUNT(*) AS global_templates FROM plan_templates WHERE ownership='global';"
```

Expected: **693** foods, **353** exercises, **10** global plan templates.

### Start the API (port 8787)

The API dev script binds to all interfaces so phones on your LAN can reach it:

```sh
pnpm api
```

- URL: `http://127.0.0.1:8787`
- OpenAPI UI: `http://127.0.0.1:8787/docs`
- Dev email sink (OTP codes): `GET http://127.0.0.1:8787/dev/mail`

In an interactive terminal, `pnpm api` prints the size of local request traces at `apps/api/.wrangler/state/v3/observability` and asks what to do before Wrangler starts:

| Answer | Effect |
| --- | --- |
| **Enter** / `keep` | Leave the folder and keep recording traces (default). |
| `fresh` | Delete only that observability folder, then start. |
| `off` | Start this run with local tracing off. |

`pnpm dev`, CI, and tests are non-interactive and do not ask. They read `FITBUD_LOCAL_TRACES=keep|fresh|off` (default `keep`). Setting that variable also skips the question in an interactive terminal. A traces folder over 500 MB prints a warning that suggests `fresh`. `fresh` does not delete D1, R2, or anything else under `.wrangler/state`.

### Trainer web (port 5173)

In a second terminal:

```sh
pnpm web
```

Or: `pnpm --filter @fitbud/trainer-web dev` (same as `pnpm web`; `predev` rebuilds workspace packages).

- App: `http://127.0.0.1:5173` (or the port Vite prints if 5173 is busy)
- Sign in: **rahul.coach@demo.fitbud.test** / **FitBud-demo-2026** (or any demo account in [LOCAL_TESTING.md](docs/LOCAL_TESTING.md))
- `/api` is proxied to the local Worker on `8787`.

### Mobile (trainer + trainee, one Expo app)

Start Metro from the repo root (uses the dev client script) or Expo Go:

```sh
# Dev client (package default)
pnpm mobile

# Expo Go on a phone (no custom dev client)
pnpm --filter @fitbud/mobile exec expo start
```

Set the API base URL before starting Metro when not using `127.0.0.1` on the device:

| Target | `EXPO_PUBLIC_API_BASE_URL` |
|--------|----------------------------|
| iOS Simulator | `http://127.0.0.1:8787` |
| Android emulator | `http://10.0.2.2:8787` |
| Physical phone (same Wi‑Fi as PC) | `http://<your-lan-ip>:8787` |
| Expo web | `http://127.0.0.1:8787` (Metro may proxy via `/__fitbud_api`) |

**LAN IP discovery**

- **Windows:** `ipconfig` → IPv4 Address on your Wi‑Fi/Ethernet adapter.
- **macOS:** `ipconfig getifaddr en0` (or `en1` if en0 is unused).

Example (macOS/Linux):

```sh
export EXPO_PUBLIC_API_BASE_URL="http://192.168.1.42:8787"
pnpm --filter @fitbud/mobile exec expo start
```

Example (Windows PowerShell):

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = "http://192.168.1.42:8787"
pnpm --filter @fitbud/mobile exec expo start
```

**Windows Firewall** (allow LAN devices to reach the API and Metro):

```powershell
New-NetFirewallRule -DisplayName "FitBud API 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow
```

If the phone still cannot reach your PC, use Expo tunnel mode (slower): `pnpm --filter @fitbud/mobile exec expo start --tunnel`.

Clear a stale Metro cache: `pnpm --filter @fitbud/mobile exec expo start -c`.

**Platform shortcuts**

- **Android physical + Expo Go:** scan the QR code from `expo start`.
- **Android emulator:** open the project in the emulator, press `a` in the Expo CLI, API host `10.0.2.2`.
- **iOS physical + Expo Go:** scan QR with Camera (iOS 13+).
- **iOS Simulator (Mac):** press `i` in the Expo CLI.
- **Expo web:** press `w` in the Expo CLI.

After launch, choose **Trainer** or **Trainee** on the role picker. Demo password for all `@demo.fitbud.test` users: **FitBud-demo-2026**.

### Reset data and verify login

```sh
pnpm db:reset
```

**Login smoke test**

macOS / Linux:

```sh
bash apps/api/scripts/verify-local-login.sh
```

Windows (PowerShell):

```powershell
pwsh apps/api/scripts/verify-local-login.ps1
```

### Troubleshooting

| Symptom | What to do |
|---------|------------|
| **Port 8787 already in use** / stale Wrangler or workerd | **macOS/Linux:** `pkill -9 -f 'wrangler dev'`; `pkill -9 workerd`; `fuser -k 8787/tcp`. **Windows:** `Get-NetTCPConnection -LocalPort 8787` then `Stop-Process -Id <PID> -Force`. Restart with `pnpm api`. |
| **`No matching export` in `packages/contracts/dist`** after switching branches | Workspace `dist/` is stale. Run `pnpm build:packages` or any root dev command (`pnpm api`, `pnpm web`, `pnpm db:reset`) — they rebuild packages first. Or run `pnpm build` from the repo root. |
| **FTS5 / SQLite version error** during `db:reset` or search | Upgrade Node to **22.23+** (`node -v`). Reinstall deps after switching Node. |
| **Phone cannot reach API** | API must run with `--ip 0.0.0.0` (`pnpm api` already does). Set `EXPO_PUBLIC_API_BASE_URL` to `http://<LAN-IP>:8787`, not `127.0.0.1`. Check firewall rules above. |
| **Metro port conflict (8081)** | Stop other React Native/Expo processes; or `expo start --port 8082` and update firewall if needed. |
| **Fonts not loading on mobile** | Run `pnpm install`, then `expo start -c`. Confirm `apps/mobile/assets/fonts/satoshi/*.ttf` exist. |
| **E2E or Playwright missing browser** | From repo root: `pnpm exec playwright install chromium`. |

### Quality checks (repo root)

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @fitbud/trainer-web test:e2e
pnpm --filter @fitbud/mobile test
```

## Delivery rules
- Work in small vertical slices tied to one user outcome.
- Update shared contracts before or with consumer changes.
- Add migrations for every database change.
- Preserve published plan and historical execution semantics.
- Test role and ownership authorization for protected operations.
- Test offline retry and idempotency for sync-capable mutations.
- Keep notifications and realtime delivery separate from domain state.
- Update the relevant authoritative document when product or architectural behavior changes.
See AGENTS.md for the complete implementation workflow and completion criteria.