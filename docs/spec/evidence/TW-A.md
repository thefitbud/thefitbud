# TW-A evidence

Branch: `cursor/tw-a-trainer-web-shell-home-6807`  
Base: `cursor/batch-0-foundation-cd97`  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof commands: `pnpm typecheck` (green), `pnpm test` (green: api 208, core 121, trainer-web 21, mobile 52, contracts 22, api-client 7, tokens 7), Playwright `e2e/banned-strings.spec.ts` (TW-A hard-fail routes green).

Screenshots: `docs/spec/evidence/TW-A/` at 1440×900 unless noted. Home full + side-by-side vs mockup included.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-03 | 13 | 3 | 16 |
| TW-04 | 15 | 7 | 22 |
| TW-05 | 11 | 5 | 16 |
| TW-32 | 8 | 5 | 13 |
| TW-33 | 5 | 6 | 11 |
| **Total** | **52** | **26** | **78** |

## Mockup differences (honest)

Compared to `mockups/png/02-trainer-web-home.png` and `-full.png` (see `TW-04-side-by-side.png`, `TW-04-full-side-by-side.png`):

1. **Needs attention count** is **3** (Rohan, Farhan, Ishita). Mockup shows a fuller 8-row cast (extra demo surnames). Seed only has those three with active exceptions after Meera stays acknowledged-only.
2. **Farhan / Ishita ages** read `since 3 min` because detection opens those holes at API boot; Rohan keeps the seeded older age (`since 7 d`). Mockup shows multi-day ages on every row.
3. **Re-engage on WhatsApp** is implemented but empty for this seed snapshot, so the section is omitted (guide: only when items exist). Mockup shows the section.
4. **Right rail** matches the mockup (Check-ins / Renewals / Recent activity). Guide column order is intentionally not used when the mockup differs (BATCHES decision / DESIGN-NOTES).
5. **Drawer width** is ~panel CSS (spec ~520 px); visual weight is close but not pixel-measured against the mockup frame.
6. **Asked-coach row** concatenates “Meal” and the Portion size chip tightly in the line (“MealPortion size” in raw text); mockup separates them more clearly.
7. **Priya’s client** (`66bb4846-…`) returns API **404**, so the workspace shows the not-found panel rather than the Forbidden title. Spec allows either.

---

## TW-03 · App shell and navigation

| ID | Result | Proof |
|---|---|---|
| TW-03.1 | PASS | `TW-03.png`, `TW-03-390.png` — no horizontal scrollbar at 1440 or 390 |
| TW-03.2 | PASS | `TW-03--long-page.png` — navy sidebar spans full scroll height |
| TW-03.3 | PASS | `TW-03.png` — Home · Clients · Check-ins · Templates · More; More → `/settings` |
| TW-03.4 | FAIL | Palette UI in `TW-03--command-palette.png`; no timing measurement proving &lt;300 ms after API |
| TW-03.5 | PASS | `TW-03.png` — no live / “Active Coaching” dot |
| TW-03.6 | PASS | `TW-03.png` — label is **Templates** (not “Templates & Libraries”) |
| TW-03.7 | PASS | `TW-03.png` — Honest Week mark; no Active Coaching lockup |
| TW-03.8 | PASS | `TW-03.png` — Rahul Verma + RV; Help is `mailto:tech@thefitbud.com…` (`AppShell` `helpHref`) |
| TW-03.9 | PASS | `TW-03--long-page.png` on `/templates/libraries` |
| TW-03.10 | PASS | `TW-03.png`, `TW-03--command-palette.png`, `TW-03--bell.png` |
| TW-03.11 | PASS | Badges omit 0 (`AppShell`); Home badge shows `3` not `0`; `aria-current="page"` on active nav |
| TW-03.12 | PASS | `TW-03--icon-rail.png` (~1100), `TW-03-390.png` bottom nav 5 items, Check-ins label intact |
| TW-03.13 | PASS | `TW-03--offline.png` — “You're offline. Changes can't be saved.” |
| TW-03.14 | PASS | `TW-03.png` — four-dot mark (BrandMark inverse) |
| TW-03.15 | PASS | `banned-strings-web.json` — hardFailErrors `[]` for TW-A routes |
| TW-03.16 | FAIL | Offline captured; shell empty/error/partial states not each evidenced |

## TW-04 · Home triage

| ID | Result | Proof |
|---|---|---|
| TW-04.1 | PASS | `TW-04.png` — row list, 3 &lt; 8, no “View all” needed |
| TW-04.2 | PASS | `TW-04.png` — one row per client, one Critical chip |
| TW-04.3 | PASS | `TW-04.png` — avatar · name · issue · age · Review · ⋯ |
| TW-04.4 | FAIL | `onGridKey` in `HomePage.tsx`; no axe run attached; no keyboard evidence shot |
| TW-04.5 | FAIL | Re-engage section empty in this seed; no `wa.me` row on `TW-04.png` |
| TW-04.6 | FAIL | Undo path coded (`showToast` + delayed POST); no capture of Acknowledge → Reviewed + Undo |
| TW-04.7 | PASS | `TW-04.png` + banned-strings hard-fail on `/` |
| TW-04.8 | PASS | `TW-04-390.png` — no horizontal scroll; rows wrap |
| TW-04.9 | FAIL | Re-engage not visible; cannot prove 3-day dedupe from screenshot |
| TW-04.10 | PASS | Relative “since 7 d” / “since 3 min” on `TW-04.png`; absolute `title` tooltips in row markup |
| TW-04.11 | PASS | `TW-04.png` — H1 **Today**, date Sun 18 Oct, three tiles; no greeting |
| TW-04.12 | PASS | `TW-04.png` — row anatomy matches |
| TW-04.13 | PASS | `TW-04.png` — Rohan first Critical; Farhan; Ishita |
| TW-04.14 | FAIL | Overflow items exist in code; Acknowledge→Reviewed+Undo not screenshotted |
| TW-04.15 | PASS | `TW-04.png` / `TW-04-full.png` — Asked · Reviewed · Getting started; Check-ins+Renewals in rail (mockup layout) |
| TW-04.16 | FAIL | Re-engage not populated in seed snapshot |
| TW-04.17 | PASS | Banned-strings + screenshot — no %, risk, sync, raw ISO, `portion_size` |
| TW-04.18 | FAIL | 390 PASS (`TW-04-390.png`); keyboard not evidenced |
| TW-04.19 | PASS | Rohan+Ishita in Needs attention; Meera under Reviewed; Kavya/Nikhil absent |
| TW-04.20 | PASS | `banned-strings-web.json` on `/` |
| TW-04.21 | PASS | same |
| TW-04.22 | FAIL | Offline `TW-04--offline.png`; empty/error/partial Home states not each captured |

## TW-05 · Exception drawer

| ID | Result | Proof |
|---|---|---|
| TW-05.1 | PASS | `TW-05.png` — no UUID / Rule mvp.v2 |
| TW-05.2 | PASS | `TW-05.png` Mark reviewed vs `TW-05--meera-resolve.png` Resolve; helper copy present |
| TW-05.3 | FAIL | Resolve POST coded; no intervention payload proof in this evidence pack |
| TW-05.4 | FAIL | Nudge error→hint coded; rate-limit / quiet-hours copy not demonstrated |
| TW-05.5 | FAIL | Focus trap coded; no interactive keyboard evidence |
| TW-05.6 | PASS | `TW-05.png` — right-hand drawer over Home; name + severity + × |
| TW-05.7 | PASS | `TW-05.png` — reason H3, source card, Detected timeline |
| TW-05.8 | PASS | Active → Mark reviewed (`TW-05.png`); Meera ack → Resolve (`TW-05--meera-resolve.png`) |
| TW-05.9 | PASS | Helper sentence on both drawer shots |
| TW-05.10 | PASS | `TW-05--meera-resolve.png` — Talked / Plan adjusted / No action needed + note |
| TW-05.11 | PASS | Nudge + ⋯ on drawer footers |
| TW-05.12 | PASS | No UUID/rule; `TW-05--resolved.png` read-only “Resolved by you” |
| TW-05.13 | FAIL | `/exceptions/:id` → Home+drawer `TW-05--fallback-route.png`; Esc/focus not proven |
| TW-05.14 | PASS | `TW-05--meera-resolve.png` — Resolve primary, valid dates |
| TW-05.15 | PASS | banned-strings on `/?exception=…` |
| TW-05.16 | FAIL | Resolved + Meera + Rohan captured; loading/error drawer states not each shot |

## TW-32 · Asked-coach items

| ID | Result | Proof |
|---|---|---|
| TW-32.1 | FAIL | Not proven (no trainee-tap → appear-within-5s timing) |
| TW-32.2 | FAIL | Mark answered wired; trainee-side update not proven here |
| TW-32.3 | PASS | Drawer/Home show no WhatsApp message body (`TW-32.png`) |
| TW-32.4 | FAIL | Adherence independence not tested in this pack |
| TW-32.5 | PASS | `TW-32.png` — Ishita · Meal · date; chip **Portion size** |
| TW-32.6 | PASS | `TW-32.png` — Asked … on WhatsApp + source card |
| TW-32.7 | PASS | `TW-32.png` — Mark answered, note, Visible to client, Open WhatsApp chat, ⋯ |
| TW-32.8 | PASS | Hint copy on `TW-32.png` |
| TW-32.9 | PASS | No message content / sync claim on `TW-32.png` |
| TW-32.10 | FAIL | Pain topic not seeded — amber chip path not shown |
| TW-32.11 | PASS | “Portion size”; banned-strings clean on `/?ask=…` |
| TW-32.12 | PASS | `banned-strings-web.json` |
| TW-32.13 | FAIL | Happy path only; loading/error/answered read-only not each evidenced |

## TW-33 · System states

| ID | Result | Proof |
|---|---|---|
| TW-33.1 | FAIL | Not all five error kinds captured as distinct shots |
| TW-33.2 | PASS | `TW-33--404.png` / `TW-33.png` — `/not-a-real-route` |
| TW-33.3 | FAIL | 404 page has no Details/request id |
| TW-33.4 | PASS | `TW-33--404.png` — “We couldn't find that page” + Home; no silent redirect |
| TW-33.5 | FAIL | ErrorState component exists; no live API-error screenshot with Retry/Details/Email |
| TW-33.6 | PASS | `TW-33--offline.png` — offline banner; session still signed in |
| TW-33.7 | FAIL | API-down scenario not run |
| TW-33.8 | PASS | `TW-33--forbidden.png` — Priya client → not-found copy, no data leak (API 404) |
| TW-33.9 | FAIL | Expected-empty (no subscription/config) not evidenced |
| TW-33.10 | PASS | banned-strings on `/not-a-real-route` |
| TW-33.11 | FAIL | Partial state set only (404, offline, client missing) |

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
| `TW-04.png` / `TW-04-full.png` | Home viewport / full |
| `TW-04-side-by-side.png` / `TW-04-full-side-by-side.png` | vs mockup |
| `TW-04-390.png` | Home mobile web |
| `TW-04--offline.png` | Home offline |
| `TW-05.png` | Rohan active drawer |
| `TW-05--meera-resolve.png` | Meera Resolve |
| `TW-05--resolved.png` | Resolved read-only |
| `TW-05--fallback-route.png` | `/exceptions/:id` |
| `TW-32.png` | Coach ask drawer |
| `TW-33.png` / `TW-33--404.png` | Unknown route |
| `TW-33--client-not-found.png` | Missing client id |
| `TW-33--forbidden.png` | Other trainer’s client |
| `TW-33--offline.png` | Offline |
| `banned-strings-web.json` | Hard-fail empty for TW-A routes |
