# TW-A evidence

Branch: `cursor/tw-a-trainer-web-shell-home-6807`  
Base: `cursor/batch-0-foundation-cd97`  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof commands: `pnpm typecheck` (**17/17 green**, including mobile after `@types/react` pnpm override), `pnpm test` (api **209**, core **121**, trainer-web **21**, mobile **52**, contracts **22**, api-client **7**, tokens **7**), Playwright `e2e/banned-strings.spec.ts` (TW-A hard-fail routes green).

Screenshots: `docs/spec/evidence/TW-A/` at 1440×900 unless noted. Home full + side-by-side vs mockup included.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-03 | 14 | 2 | 16 |
| TW-04 | 18 | 4 | 22 |
| TW-05 | 12 | 4 | 16 |
| TW-32 | 9 | 4 | 13 |
| TW-33 | 6 | 5 | 11 |
| **Total** | **59** | **19** | **78** |

## Mockup differences (honest)

Compared to `mockups/png/02-trainer-web-home.png` and `-full.png` (see `TW-04-side-by-side.png`, `TW-04-full-side-by-side.png`):

1. **Needs attention** is now **8** clients (Rohan, Farhan, Ishita Critical; Deepak/Arjun/Neha/Tanvi/Aarav Attention). Mockup still shows a larger cast with different surnames and “Showing 8 of 11 · View all”.
2. **Ages** use mobile wording (`Since 7 days`, `Since 3 days`, `Since 16 hours`). Mockup uses compact `since 5 d` / `since 2 d`.
3. **Re-engage on WhatsApp** renders with Farhan (`TW-04-full.png`). Mockup shows multiple re-engage rows.
4. **Right rail** matches the mockup (Check-ins / Renewals / Recent activity). Meera renewal shows **Due**; Rohan **Expired** (amber).
5. **Asked-coach** shows `Lunch · Sun 18 Oct` with topic chip **Portion size** separate (no MealPortion run-on).
6. **H1 Today** is 22px / 500 to track the mockup weight (was 28/700).
7. **Priya’s client** still returns API **404** → not-found panel (spec allows Forbidden or not-found).

---

## TW-03 · App shell and navigation

| ID | Result | Proof |
|---|---|---|
| TW-03.1 | PASS | `TW-03.png`, `TW-03-390.png` — no horizontal scrollbar at 1440 or 390 |
| TW-03.2 | PASS | `TW-03--long-page.png` — navy sidebar spans full scroll height |
| TW-03.3 | PASS | `TW-03.png` — Home · Clients · Check-ins · Templates · More; More → `/settings` |
| TW-03.4 | FAIL | Palette UI in `TW-03--command-palette.png`; no timing measurement proving &lt;300 ms after API |
| TW-03.5 | PASS | `TW-03.png` — no live / “Active Coaching” dot |
| TW-03.6 | PASS | `TW-03.png` — label is **Templates** |
| TW-03.7 | PASS | `TW-03.png` — Honest Week mark; no Active Coaching lockup |
| TW-03.8 | PASS | `TW-03.png` — Rahul Verma + RV; Help is `mailto:tech@thefitbud.com…` |
| TW-03.9 | PASS | `TW-03--long-page.png` on `/templates/libraries` |
| TW-03.10 | PASS | `TW-03.png`, `TW-03--command-palette.png`, `TW-03--bell.png` |
| TW-03.11 | PASS | Home badge shows `8`; `aria-current="page"` on active nav |
| TW-03.12 | PASS | `TW-03--icon-rail.png` (~1100), `TW-03-390.png` bottom nav |
| TW-03.13 | PASS | `TW-03--offline.png` — “You're offline. Changes can't be saved.” |
| TW-03.14 | PASS | `TW-03.png` — four-dot mark |
| TW-03.15 | PASS | `banned-strings-web.json` — hardFailErrors `[]` for TW-A routes |
| TW-03.16 | FAIL | Offline captured; shell empty/error/partial states not each evidenced |

## TW-04 · Home triage

| ID | Result | Proof |
|---|---|---|
| TW-04.1 | PASS | `TW-04.png` — 8 rows; capped at 8 so View all footer not required |
| TW-04.2 | PASS | `TW-04.png` — one row per client; Critical + Attention chips |
| TW-04.3 | PASS | `TW-04.png` — avatar · name · issue · age · Review · plain ⋯ |
| TW-04.4 | FAIL | Grid keyboard coded; no axe/keyboard shot in this pack |
| TW-04.5 | PASS | `TW-04-full.png` — Re-engage · Farhan · Open WhatsApp (`wa.me/919…`) |
| TW-04.6 | FAIL | Undo path coded; Acknowledge→Reviewed+Undo not screenshotted |
| TW-04.7 | PASS | `TW-04.png` + banned-strings hard-fail on `/` |
| TW-04.8 | PASS | `TW-04-390.png` — no horizontal scroll; rows wrap |
| TW-04.9 | FAIL | Re-engage 3-day dedupe not proven from screenshot alone |
| TW-04.10 | PASS | `Since 7 days` / `Since 3 days` / `Since 16 hours` on `TW-04.png` |
| TW-04.11 | PASS | H1 **Today** ~22px/500; date; three tiles; no greeting |
| TW-04.12 | PASS | Row anatomy matches |
| TW-04.13 | PASS | Critical first (Rohan/Farhan/Ishita), then Attention |
| TW-04.14 | FAIL | Overflow + Undo not screenshotted |
| TW-04.15 | PASS | Asked · Reviewed · Getting started · Re-engage; rail Check-ins/Renewals/Activity |
| TW-04.16 | PASS | Re-engage present on `TW-04-full.png` |
| TW-04.17 | PASS | Banned-strings + no MealPortion run-on |
| TW-04.18 | FAIL | 390 PASS; keyboard not evidenced |
| TW-04.19 | PASS | Meera under Reviewed; Kavya/Nikhil absent from Needs attention |
| TW-04.20 | PASS | `banned-strings-web.json` on `/` |
| TW-04.21 | PASS | same |
| TW-04.22 | FAIL | Offline `TW-04--offline.png`; empty/error Home states not each captured |

## TW-05 · Exception drawer

| ID | Result | Proof |
|---|---|---|
| TW-05.1 | PASS | `TW-05.png` — no UUID / Rule mvp.v2 |
| TW-05.2 | PASS | Mark reviewed vs Meera Resolve; helper copy |
| TW-05.3 | PASS | API stores `resolve` + optional `note` interventions with outcome (exceptions.test) |
| TW-05.4 | FAIL | Rate-limit / quiet-hours / paused nudge copy coded; not demonstrated in shots |
| TW-05.5 | FAIL | Focus trap coded; no interactive keyboard evidence |
| TW-05.6 | PASS | Right-hand drawer over Home |
| TW-05.7 | PASS | Reason H3, source card (planned / logged / Due by) |
| TW-05.8 | PASS | Active → Mark reviewed; Meera ack → Resolve |
| TW-05.9 | PASS | Helper sentence |
| TW-05.10 | PASS | Talked / Plan adjusted / No action + note |
| TW-05.11 | PASS | Nudge + ⋯ (includes WhatsApp client) |
| TW-05.12 | PASS | Resolved read-only; no severity chip on resolved |
| TW-05.13 | FAIL | Fallback route shot; Esc/focus not proven |
| TW-05.14 | PASS | Resolve primary; valid dates |
| TW-05.15 | PASS | banned-strings on `/?exception=…` |
| TW-05.16 | FAIL | Loading/error drawer states not each shot |

## TW-32 · Asked-coach items

| ID | Result | Proof |
|---|---|---|
| TW-32.1 | FAIL | 4s Home poll coded; trainee-tap→appear timing not measured |
| TW-32.2 | FAIL | Trainee “Coach answered” + private-note API test exists; trainee UI not screenshotted |
| TW-32.3 | PASS | No WhatsApp message body (`TW-32.png`) |
| TW-32.4 | FAIL | Adherence independence not tested in this pack |
| TW-32.5 | PASS | `Lunch · Sun 18 Oct` + **Portion size** chip |
| TW-32.6 | PASS | Asked … on WhatsApp + source card |
| TW-32.7 | PASS | Mark answered, note, Visible to client **switch** (default off), Open WhatsApp chat, ⋯ |
| TW-32.8 | PASS | Hint copy |
| TW-32.9 | PASS | No message content / sync claim |
| TW-32.10 | FAIL | Pain topic not seeded |
| TW-32.11 | PASS | Portion size; banned-strings clean |
| TW-32.12 | PASS | `banned-strings-web.json` |
| TW-32.13 | FAIL | Loading/error/answered read-only not each evidenced |

## TW-33 · System states

| ID | Result | Proof |
|---|---|---|
| TW-33.1 | FAIL | Not all five error kinds captured as distinct shots |
| TW-33.2 | PASS | `TW-33--404.png` / `TW-33.png` |
| TW-33.3 | FAIL | Route 404 page has no Details/request id (ErrorState does for API errors) |
| TW-33.4 | PASS | “We couldn't find that page” + Home |
| TW-33.5 | FAIL | No live API-error screenshot with Retry/Details/Email |
| TW-33.6 | PASS | `TW-33--offline.png` — offline banner; session retained |
| TW-33.7 | FAIL | API-down scenario not run |
| TW-33.8 | PASS | `TW-33--forbidden.png` — other trainer’s client → not-found, no leak |
| TW-33.9 | FAIL | Expected-empty not evidenced |
| TW-33.10 | PASS | banned-strings on `/not-a-real-route` |
| TW-33.11 | FAIL | Partial state set only |

## Evidence index

| File | What |
|---|---|
| `TW-03.png` | Shell on Check-ins 1440 |
| `TW-03-390.png` | Bottom nav |
| `TW-03--icon-rail.png` | ~1100 icon rail |
| `TW-03--long-page.png` | Sidebar height |
| `TW-03--command-palette.png` | ⌘K |
| `TW-03--bell.png` | Bell popover |
| `TW-03--offline.png` | Offline banner |
| `TW-04.png` / `TW-04-full.png` | Home viewport / full (incl. Re-engage) |
| `TW-04-side-by-side.png` / `TW-04-full-side-by-side.png` | vs mockup |
| `TW-04-390.png` | Home mobile web |
| `TW-04--offline.png` | Home offline |
| `TW-05.png` | Rohan active drawer |
| `TW-05--meera-resolve.png` | Meera Resolve |
| `TW-05--resolved.png` | Resolved read-only |
| `TW-05--fallback-route.png` | `/exceptions/:id` |
| `TW-32.png` | Coach ask drawer (visibility switch) |
| `TW-33.png` / `TW-33--404.png` | Unknown route |
| `TW-33--client-not-found.png` | Missing client id |
| `TW-33--forbidden.png` | Other trainer’s client |
| `TW-33--offline.png` | Offline |
| `banned-strings-web.json` | Hard-fail empty for TW-A routes |
