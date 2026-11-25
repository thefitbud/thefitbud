# FitBud design system v3-web (trainer web, desktop + iPad)

Draft for Firoz's approval, 18 Nov 2026. Extends `docs/design/v3/DESIGN-SYSTEM-v3.md` (colour roles and tokens unchanged) with the layer web never had: a desktop type scale, a page shell with one scroll model, and shared components. CSS: `kit-v3-web.css` (class names are suggestions; the W13 task can map them to React components). Reference renders: `png/W-00-components-sheet.png`, and the screen mocks in `png/`.

Trainer web is **light only**. Font **Inter** (OFL) with tabular digits on every number (`font-feature-settings:"tnum"`). Icons: Lucide, 1.75 px stroke, 16 px in buttons, 18 px in nav and rows.

## 1. Colour roles (unchanged from v3, restated because main breaks them)

| Role | Token | Web use | Never |
|---|---|---|---|
| Ink / primary | `--brand` `#1A1248` | Primary button, active tab underline, active nav text, selected chip, checkbox on, bars, chart line | — |
| Today / due | `--coral-strong` `#EE456E` | Today ring in week strip, "Due now" pill, notification dot | Any button, any fill larger than a pill |
| Coach | `--coach` `#5448C8` | "You" owner pill, coach avatar, goal line on charts, coach-target values | Primary buttons (main today paints them periwinkle via `--indigo → --coach-ink`; delete that alias) |
| Done | `--done` `#0B7A55` | Published, logged, reviewed, toggle on, positive deltas | — |
| Warn / crit / info | v3 values | Severity and status pills, banners | Large red blocks (Sign out, End coaching are quiet until confirmed) |

Web additions: solid lines `--line #E6E8EE`, `--line2 #D5D8E0`, `--line-strong #C3C7D1` (the 9 % alpha mobile line made cards disappear on desktop); `--row-hover #F7F8FA`, `--row-sel #F1F0F8`; six avatar pairs `--av1…6-bg/fg`.

## 2. Type scale (8 steps, the only sizes allowed)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--t-kpi` | 28 / 32, −0.02em | 600 | KPI numbers (64.2 kg, 1,240 kcal, 1 of 4) |
| `--t-title` | 24 / 32, −0.015em | 600 | Page title, client name |
| `--t-modal` | 20 / 28 | 600 | Modal and side-panel title |
| `--t-h2` | 17 / 24 | 600 | Card and section titles |
| `--t-h3` | 14 / 20 | 600 | Row primary text, group headings, field labels |
| `--t-body` | 14 / 20 | 400 | Default text, table cells, inputs |
| `--t-meta` | 13 / 18 | 400, `--ink3` | Second line, helper text, timestamps |
| `--t-cap` | 12 / 16 | 500 | Pills, chips, table headers, chart axes. **Floor: nothing smaller** |

Plus one kicker style `.eyebrow` 12 / 16, 600, caps, +0.06em (raised from 11.5 on 19 Nov so nothing on web is below 12), `--ink3`, used only above a section ("WHAT HAPPENED", "LAST 7 DAYS"), **never as the label over a value**. Hierarchy rule (fixes Progress column, Onboarding answers): a heading is always heavier or larger than what it heads; a label over a value is `--t-meta` and the value is `--t-body`/`--t-h3`. iPad uses the same scale (CSS px already scale); only control heights change.

Replaces ~50 font sizes in `apps/trainer-web/src/styles/**` (px and rem mixed). The W13 CSS task should add a lint rule: `font-size` only via these tokens.

## 3. Spacing, radii, elevation

- Spacing: 4 pt grid, tokens 4, 8, 12, 16, 20, 24, 32, 40, 48. Page gutter 32 desktop, 24 under 1280 px and on iPad. Card padding 20 (16 on iPad). Gap between cards 20. Page head to content 24.
- Radii: card 14, control 10, small control and pill tile 8, modal 16, pills and chips full.
- Elevation: e1 card `0 1px 2px rgba(26,18,72,.05)` + 1 px `--line`; e2 popover / toast; e3 modal and panel `0 24px 64px rgba(26,18,72,.22)` over `--scrim rgba(16,12,40,.44)`. Primary buttons have no shadow.

## 4. Page shell and scroll model

- `.app` = 100vh grid: nav + frame. **The window never scrolls.** Frame = top bar (56 px) + one content region.
- **Document pages** (Home, Clients, client tabs, Settings): exactly one scroller, `.main { flex:1; min-height:0; overflow-y:auto }`. Content max width 1280, centred. Two-column pages use `.cols` (main + 360 rail, 320 under 1280) and the rail may be `position:sticky; top:24px`.
- **Editors** (workout, diet, check-in form builders): `.workspace` grid, the page itself does not scroll; header and footer fixed; each pane `min-height:0; overflow-y:auto`. This removes the blank area under the builders (`plan.css .builder-pane max-height: calc(100vh - 11rem)` inside a scrolling window). One rule: **never put a scroller inside a scroller.**
- **Pinned actions**: a card whose actions must stay visible (check-in review) pins its footer inside a sticky card with `max-height: calc(100vh - 88px)` and an inner scroller. When the viewport is shorter than the card (iPad landscape 820), actions move to the `.actionbar` at the bottom of the frame. Never `overflow:hidden` on content that can grow (today's clipped "Schedule next").
- Nav: 232 px light sidebar at ≥1280 px; 72 px icon rail below 1280 and on iPad (tooltips for labels). Items: Home, Clients, Check-ins, Templates, Library; bottom: Help, Settings, account (avatar, name, menu: Profile, Switch role, Sign out). **"More" is removed**: Settings is a real item, Help is listed once, Sign out lives in the account menu. Nav counts are neutral (`--fill2`, ink); coral is only the notification dot.
- Top bar: breadcrumb left, client search (300 px, ⌘K) and bell right.

## 5. Components (the W13 CSS/React layer)

1. **Buttons**: heights 32 / 36 / 44 (iPad 36 / 44 / 48). Primary (ink fill, one per view), Secondary (card + `--line2` + e1), Quiet (`--fill`, row actions: Use for client, Review, Open), Ghost (text-like, Show all, icon buttons), Danger (crit fill, only inside a confirm), Danger-quiet (crit tint). Disabled: `--fill2` / `--ink4`. Focus: 3 px ink ring at 18 %. Labels are verbs from TM mocks: "Mark reviewed", "Nudge", "Reply", "Open draft".
2. **Segmented control**: one value among 2–4 (`6 wk / 3 mo`, review outcome). Track `--fill`, selected `--card` with hairline shadow, labels never wrap (`white-space:nowrap`; shorten copy instead). Replaces the 10+ per-page variants (`.segment`, `.pg-segment`, `.cs-segmented`, `.templates-type-segment`…).
3. **Filter chips**: 32 px, full radius, `--card` + `--line2`. Dropdown chip shows `Owner Anyone ▾`. Selected = ink fill. One toolbar row per list: search left, chips, sort right.
4. **Tabs**: page sections (client workspace, template types). 44 px, ink 2 px underline on active, counts in a neutral pill (ink pill when active).
5. **Cards**: header (title `--t-h2`, aside `--t-meta`, one link-style action right), body, optional footer with `--line` top border. No card inside a card; group with dividers.
6. **Tables and list rows**: header 40 px `--t-cap ink3`; rows 60 px two-line, 48 px single-line (`.compact`); hover `--row-hover`; thumbnail 40 + title `--t-h3` + meta `--t-meta`; numbers right-aligned tabular; **one row-action pattern everywhere**: a Quiet button + ⋯ menu, on every row.
7. **Form fields**: label `--t-h3` above, helper `--t-meta` below, input 36 (44 iPad), radius 10, `--line2` border, focus ink border + ring. Fields max 560 px wide in settings forms (label-left rows at ≥1024 for settings). Custom **Select / Combobox** (trigger + listbox popover with search, avatars, check on the selected option), **Date** (trigger with calendar icon, popover calendar), **Textarea** (no resize handle), **Checkbox** 18 px radius 5 (ink when on), **Radio** 18 px (5 px ink ring), **Toggle** 36×20 (green when on). No native `<select>`, `<input type=checkbox|radio|date>` appearance and no `<fieldset>` borders anywhere.
8. **Status pills**: 24 px, `--t-cap`, tint + ink pairs: done (Published, Reviewed), neutral (Draft, Private, Open), crit (Critical, Needs attention), warn (Off plan, Flagged), info (To review), coach (You), due (Due now, coral). Optional 13 px icon.
9. **Modal vs side panel (rule)**: *Side panel* (right, docked, 540 px as built today, also on iPad) only when it opens from a list that stays visible and useful beside it, so the coach can go item to item: Home attention queue, Check-ins inbox, Activity feed. *Centred modal* (560 standard, 720 large) when it opens from a detail page or asks for one decision: exception review from the client page, Use template, Make a copy, confirms. *Full page* for multi-step editing (builders). Generic modal anatomy: header (title `--t-modal`, subtitle meta, status pills, close), one scrolling body, footer with actions right (secondary, primary). Esc and scrim click close; focus is trapped. **Exception review is the exception to the generic anatomy:** in both the panel and the 720 modal it keeps the live `ExceptionDrawer` anatomy (§5.10).
10. **Toast**: navy, 44 px, white text, white-tint action ("Undo"), bottom-centre, 5 s.
11. **Empty, loading, error**: empty = brand-tint icon tile + `--t-h3` line + meta + one action; loading = skeleton bars `--skel1→--skel2` in the shape of the content; error = quiet crit banner that reassures first ("Your data is safe"); offline = neutral banner.
12. **Charts**: line 2 px `--brand`, area fill brand at 12 % → 0, gridlines 1 px `--line`, axis `--t-cap` 12 ink3, goal 1.5 px dashed `--coach` with a label, last point 4.5 px white dot with ink ring. Headline KPI + delta + period above the chart, caption is a sentence ("Last weigh-in Sun 15 Nov"), never a raw timestamp. Bars: `--brand` on `--fill2`, 8 px (10 for the main kcal bar); macros protein / carbs / fat tokens. Replaces the deprecated `MeasurementTrend` (black `currentColor` line).
13. **Thumbnails and avatars**: thumb 40 px radius 10, `--fill` + `--line`, type icon in `--ink2` (workout dumbbell, nutrition utensils, check-in list-checks, intake clipboard). **Food and exercise rows (revised 19 Nov): keep the live `LibraryThumb` coloured tile (gradient from a name hash, 40 px r10) in every list. Drawings appear only on detail views, How-to and the active card, exact match only. Detail views with no drawing show no image area; foods never show an image.** See `../exercise-images/NOTES.md` §0. Client avatars: six soft pairs assigned by id hash; sizes 26 (stack), 36, 56; coach avatar `--coach` fill. Progress photos: neutral `--fill` placeholder with a person icon, 3:4.
14. **KPI stat**: value `--t-kpi` + unit/denominator 14 / 500 ink3 + label `--t-meta`. Use 3 across.
15. **Week strip**: 7 columns; day label caption; 40 px date disc: done = done tint + check, missed = crit tint + ×, rest = dashed outline, planned = outline, **today = 2.5 px coral ring** and the label reads "Today" in coral ink. Below: workout name (12 / 500) and meals (caption). Replaces the lavender today box.
16. **Action bar**: 64 px frame-bottom bar (white, top line) for a page's primary actions on short viewports.

## 6. Screen decisions in the first three mocks

- **Templates (168, 174)**: type tabs with counts replace the filter-button group; Owner and Status become dropdown chips; Libraries moves to its own nav item (Library); titles hold only the name, facts go to the meta line; Used by shows an avatar stack + count (Used by API ships in W13, D-WEB-2); every row has `Use for client` + ⋯. Use-for-client modal: title "Use template for a client", template as subtitle, searchable client combobox, Starts and Length fields, a neutral "what happens" banner, Cancel / Open draft.
- **Client Overview (03)**: header without a primary button (actions are WhatsApp, Nudge, Note, ⋯ as TM-03a); tabs add **Settings** (consolidates Client settings, Coaching setup, Reminders, Onboarding answers; Plan keeps plans only). Body: Needs attention (each item: tinted icon tile, title, one-line meta, severity pill, Review), This week strip + 3 KPIs, Today's food (kcal KPI, macro bars, meal list with done / off-plan / due / planned states); rail: Weight chart, Next check-in, Plan, Coach notes. Recent activity and Renewal move out (Activity tab; Settings tab + an "Renewal expired" header pill when it applies).
- **Exception review (Home panel and client page)**: **keep the current flow and components; restyle only** (Firoz, 19 Nov 2026). The client-page version is the same component in a centred 720 modal, opened in list mode (pager + Also open + Resolve several…) instead of today's single-item drawer. No new options: Nudge has no sheet, there are no "send as" radios, and there is no separate note action. Frames W-02, W-02a–i, W-03x, W-03xb–d; walkthrough in `live-resolver/FLOW.md`.
- **Check-in review (163)**: one sub-header (back to Check-ins, title, To review pill, sent time, pager "2 of 3 to review"); left: comparison table (Week 5 / Week 6 / Change, coloured deltas), "Ananya wrote" answers with Flagged pills, photos with Compare; right: sticky review card (Outcome segmented, note, custom checkbox, Last 7 days) with a pinned footer (Reply on WhatsApp, Mark reviewed). iPad landscape moves actions to the action bar and Last 7 days into the left column.

## 7. Decisions

| ID | Date | By | Decision |
|---|---|---|---|
| D-WEB-1 | 18 Nov 2026 | Firoz | **Light sidebar**, as in the mocks: white `--bg-plain` nav, 1 px `--line` edge, colour lockup. Replaces the purple gradient sidebar. |
| D-WEB-2 | 18 Nov 2026 | Firoz | **Keep the "Used by" column** on Templates (desktop and iPad). W13 adds a "Used by" API field per template (count + up to 3 client ids for the avatar stack). Until it ships the cell shows "Not used yet" only when the count is really 0. |
| D-WEB-3 | 18 Nov 2026 | Firoz | **Coaching setup moves out of Plan into the client Settings tab.** Client Settings tab sections: Client details, Package and payments, Coaching setup (goal, mode, expectations), Check-ins, Reminders, Onboarding answers, End coaching. Plan keeps plans only. |
| D-WEB-4 | 18 Nov 2026 | Firoz | **Nav counts are neutral grey** (`--fill2` pill, ink numeral). Coral is only for today and due (today ring, "Due now", the notification dot). |
| D-WEB-5 | 18 Nov 2026 | Firoz | **Logo**: the sidebar uses the brand files themselves, never redrawn or typed: mark `runnerup-honest-week-mark.svg` (three navy dots, one open coral ring) + the outlined navy "fitbud" wordmark `fitbud-wordmark-navy-mono.svg`. Mark 40 px wide (the v3 minimum), cropped to its dot row (dots ≈ 8.6 px) and centred on the wordmark's x-height; wordmark 24 px tall; gap ≈ one dot. Rail (<1280 / iPad): mark only. In running text the product is always written **FitBud**. |

Copies of both logo files are in `assets/`.

## 5.10 Exception resolver (TW-05): keep the live component, restyle only (19 Nov 2026)
Source of truth: `apps/trainer-web/src/components/ExceptionDrawer.tsx` + `side-panel/*` on main. The live walkthrough with every control is in `live-resolver/FLOW.md`, with screenshots in `live-resolver/`. **Do not change layout, order, controls or copy.** Apply only the v3-web tokens: type scale, palette (navy primary, never coral on a button), spacing, light sidebar, Settings instead of More, and the typed "FitBud" lockup.
- **Header**: avatar 36, name 16/600, meta `--t-meta` ("Lose 6 kg · week 15 · 6 open items"). Pager: secondary icon buttons 32 + "5 of 6" + close. Under it: progress dashes (32×4, current navy, resolved `--done`) and on the right the severity pill (Critical `p-crit` / Attention `p-warn`), replaced by "✓ n of m resolved" (`p-done`) once anything is resolved.
- **Body, in this order**:
  - Title `--t-modal`, plus a ✓ Resolved pill when resolved.
  - Age line `--t-meta`.
  - Source card: a header on `--bg` with the source glyph, then a Planned / Window / Logged grid with label `--ink3` and value 14/500.
  - The resolved banner (`--done-tint`, Undo as an underlined text button).
  - **Signals**: eyebrow, bell line, **Details** link, then notices as 13 px tinted rows: neutral, info for inbox delivery, warn for quiet hours / limit, done for sent.
  - "Your note · private".
  - **Also open for {name}**: bordered list, 44 px rows, glyph + "n · label · date" + severity pill, rows clickable.
  - **Timeline**: 8 px dots, the resolved dot `--done`.
- **Footer** (sticky, `--bg-plain`): Mark reviewed (Quiet) · Nudge (Secondary) · ⋯ (Secondary icon) · **Resolve…** (Primary navy). Then the helper lines `--t-meta --ink3` and the Open client link. Form footer: Cancel / Resolve item, plus the lock helper. Resolved footer: "1 of 6 resolved · 5 still open" + Primary "Next item · 6 of 6 ›". Read-only footer: helper, Open client, Done.
- **Resolve form** (inline, replaces Signals and Also open): eyebrow "Resolve · Outcome", three chips (selected = `.chip.on` navy + check): Talked to client · Plan adjusted · No action needed. Then the note "Note · optional · only you see this".
- **⋯ menu** (`.menu`, 260): Add note, Resolve several… (list mode only), Adjust plan, Message on WhatsApp, divider, Open client, Client settings.
- **Resolve several**: select-all row "n of m selected", bordered checklist (meal changes are disabled: "resolves on its own"), a navy bottom bar "n selected · Clear/Back · Resolve n items…", the confirm dialog (outcome chips + note + "You can undo for 5 seconds after.") and the result list + navy Undo toast.
- **Nudge**: one tap, no sheet. The result shows as a Signals notice and a status toast. Skipped meal / workout items have no Nudge. All states are in W-02b.
