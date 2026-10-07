# FitBud Trainer Web — Figma frames

File: [FitBud Trainer Web](https://www.figma.com/design/WxSw4jGGeOigNmc6RKFhfh/FitBud-Trainer-Web)

Prototype URL pattern:

`https://www.figma.com/proto/WxSw4jGGeOigNmc6RKFhfh/FitBud-Trainer-Web?node-id={NODE}&scaling=scale-down-width&content-scaling=fixed&page-id=0%3A1&hide-ui=1`

Compare implementations at **1440×1024**. Figma artboards in this file are **1280** wide; Plan Builder showed a canvas size badge of **1280 × 1439**. Other frames share that width; heights were not labeled on every selection (workspace frames are visually taller than Plan Builder).

Product / UX Architecture overrides Figma when they conflict. Do not add WhatsApp as a primary action, broadcasts, calendar sessions, Settings as primary nav, risk scores, or fake metrics.

**Node ID note:** Layers-panel `data-testid` values and URL `node-id` after clicking each layer. Plan Builder is `2-2010`, not `2-2610`. `2-2610` is Client Workspace Overview.

## Node IDs and screenshots

| # | Frame | Node | Size | Route | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 01 | Trainer Home — Command & Triage Cockpit V4 | `2-3` | ~1280 × (taller than viewport) | `/` | `docs/design/figma/01-home.png` |
| 02 | Trainer Clients — Roster & Workspace Directory | `2-561` | ~1280 × (taller than viewport) | `/clients` | `docs/design/figma/02-clients.png` |
| 03 | Trainer Templates & Libraries — Prescriptions & Asset Vault | `2-1370` | ~1280 × (taller than viewport) | `/templates` | `docs/design/figma/03-templates.png` |
| 04 | Trainer Plan Builder — Coaching Composition Surface | `2-2010` | **1280 × 1439** (badge) | `/clients/:id/plan` | `docs/design/figma/04-plan-builder.png` |
| 05 | Trainer Client Workspace — Arjun Mehta Overview | `2-2610` | ~1280 × (taller than viewport) | `/clients/:id` | `docs/design/figma/05-overview.png` |
| 06 | Trainer Client Workspace — Plan Tab | `2-2958` | ~1280 × (taller than viewport) | `/clients/:id/plan` | `docs/design/figma/06-plan-tab.png` |
| 07 | Trainer Client Workspace — Check-ins Tab | `2-3412` | ~1280 × (taller than viewport) | `/clients/:id/check-ins` | `docs/design/figma/07-checkins-tab.png` |
| 08 | Trainer Client Workspace — Activity Tab | `2-3866` | ~1280 × (taller than viewport) | `/clients/:id/activity` | `docs/design/figma/08-activity.png` |
| 09 | Trainer Client Workspace — Progress Tab | `2-4417` | ~1280 × (taller than viewport) | `/clients/:id/progress` | `docs/design/figma/09-progress.png` |
| 10 | Trainer Client Workspace — History Tab | `2-4984` | ~1280 × (taller than viewport) | `/clients/:id/history` | `docs/design/figma/10-history.png` |

## Structure (from prototype screenshots)

Shared chrome on Home / Clients / Templates / workspace:

- **Sidebar:** white, indigo bolt, “FitBud Coach” / “Active Coaching” (or “Pro Workspace”), primary CTA pill, nav Home / Clients / Templates & Libraries / **Schedules** / **Settings**, Help & Support, trainer card.
- **Workspace header (client frames):** breadcrumb, identity (Arjun Mehta + program chips), actions **Adjust Plan**, **Message (WhatsApp)**, **Review Check-in**, overflow/settings gear. Tabs: Overview / Plan / Activity / Progress / Check-ins / History.

### 01 Home (`2-3`)

- Header: search, date chip, **WhatsApp Live Sync**, bell, clock.
- Greeting + KPI cluster (Active Trainees, Quietly On Track, Exceptions Surfaced).
- Quick actions: Add Client, Create Plan Template, **Schedule Calendar Session**, **Broadcast Cohort Announcement**.
- Filter chips; Needs Attention 2-column cards; Today’s Work list.
- **Skip:** Settings, Schedules as primary nav, WhatsApp Live Sync, Broadcast, Schedule Calendar Session, Send Nudge, **Dropout Risk**, WhatsApp on cards.

### 02 Clients (`2-561`)

- Header: WhatsApp Live Sync, date, + Add Client.
- Title “Client Roster”; Export Roster, **Bulk Message**, + Add Trainee.
- KPI chips: Total Active / On Track / Need Attention / Critical/Overdue / Onboarding.
- Search, sort, cohort; filter chips including **Low Adherence &lt;60%**.
- Dense table: trainee, goal/phase, coaching status, attention, **Adherence Signal %**, next check-in, current plan.
- **Skip:** Settings, Schedules, Bulk Message, Dropout Risk, fake adherence %.

### 03 Templates (`2-1370`)

- Header: WhatsApp Live Sync, date, + Create Template.
- KPI cards (active templates, prescriptions, most reused, library counts).
- Filter chips + search/sort; template cards with Edit / Assign to Client.
- **Skip:** Settings, Schedules, WhatsApp Live Sync.

### 04 Plan Builder (`2-2010`)

- Top: back to client, Plan Prescriptions, version chip, Workout / Nutrition / Hybrid, Save as Template, **Publish to Client**.
- Left weekly split; center exercise editor (sets table); right Exercise Library.
- Keep existing plan mutations and published-version immutability.

### 05 Overview (`2-2610`)

- Attention Required banner; Current Coaching Snapshot (workout compliance, **diet adherence %**); Recent Meaningful Change (weight, completion, nutrition %, sleep).
- Do not invent client names; use invitation/relationship display data.
- **Skip:** WhatsApp, Settings, Schedules, fake adherence %, fake “real-time adherence pulse”.

### 06 Plan Tab (`2-2958`)

- Current Effective Plan card: Modify Plan / Replace Plan / View Plan History.
- Workout Protocol (4-day split) + Coach Instructions & Tactical Rules.
- Same workspace chrome as Overview. Plan builder composition is `2-2010`, not this summary tab.

### 07 Check-ins (`2-3412`)

- Left: upcoming + check-in history list; right: Week 4 Check-in Review (metrics, trainee note, physique photos).
- Primary: Adjust Protocol in Plan Builder, Approve & Send Feedback.
- **Skip:** WhatsApp, fake adherence %, Settings.

### 08 Activity (`2-3866`)

- Client Activity Log, date-grouped events (workout, meals, weigh-in, surplus flags).
- Filters: All / Workout / Diet / Check-in / Evidence / Coach Notes.
- **Skip:** WhatsApp, Settings, auto-calculated surplus as coaching decision.

### 09 Progress (`2-4417`)

- KPI tiles (weight delta, **workout adherence %**, diet/macro %, check-in consistency) plus **charts** and strength bars.
- **Compliance Score 89%**.
- Product: stored measurements/photos only. **No fake charts or adherence %.** Skip WhatsApp, Settings.

### 10 History (`2-4984`)

- Coaching Ledger & Milestones; filters; timeline of protocol adaptations and plan activations.
- Projection from API. **Skip:** WhatsApp, Settings, Billing & Agreement if not in MVP.

## Figma-only (product forbids)

Present across many frames — do not implement as MVP behavior:

- **WhatsApp** (Live Sync chip, Message (WhatsApp), Send via WhatsApp on cards)
- **Broadcast** / Bulk Message / Broadcast Cohort Announcement
- **Schedule Calendar Session**
- **Settings** and **Schedules** as primary sidebar nav (product: Check-ins, not Schedules)
- **Risk / dropout** (Dropout Risk badges, risk scores)
- **Fake adherence %** and decorative analytics (roster adherence column, 74%/87%/89% compliance, trend charts without stored measurements)

## Visual system (Home `2-3`)

- Sidebar: white, indigo bolt mark, “FitBud Coach”, “Active Coaching”, indigo Add Client pill, MENU, Home/Clients/Templates/Check-ins (Figma shows Schedules/Settings instead), trainer card at bottom.
- Canvas: search, date chip, bell with count.
- Cards: white, ~16–20px radius, light border, 2-column attention grid, KPI cluster, filter chips.
- Tokens: reuse `--indigo` `#4527C6`, `--deep-navy` `#1A1248`, `--pale-lavender` `#EDEAFF`, `--page-bg` `#f3f5fb`, Satoshi.
