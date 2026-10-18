# 01 · Product rules (apply to EVERY screen)

Read this after `00-foundations.md` and before your batch files. If a screen file seems to conflict with a rule here, **don't pick one yourself**. Follow this file, and list the conflict under "Spec questions" in your report.

## A. Rules

1. **No auto-send, ever.** All WhatsApp outreach is a `wa.me` link with **prefilled, editable text**, opened in the user's own WhatsApp, and **the user presses Send**. FitBud never sends a WhatsApp message and never claims one was sent ("Opened WhatsApp · today", never "Sent").
   - Trainer → client links use the **CLIENT's** WhatsApp number (`clientWhatsappE164`; see 03-api-changes A6). If the client has no number, the button is disabled with an explanation.
   - Trainee → coach links (TR-18 Ask coach) use the trainer's number.
2. **Text only.** No voice notes, audio, video or attachments in WhatsApp prefills or coach notes.
3. **Feature flags `wa_otp`, `wa_automation` and `steps_enabled` are OFF.**
   - **WhatsApp OTP** (sign-in code by WhatsApp) and **WhatsApp reminders/automation** render as visible, **disabled** options labelled **"Coming soon"**. They can't be activated, and the copy never implies they're working (e.g. no "Sent to WhatsApp ••••1234" while `wa_otp` is off).
   - **Steps** (TR-25) stays hidden or disabled while `steps_enabled` is off. Never show the raw flag name.
4. **Support = email.** Every Help or Support entry opens `mailto:tech@thefitbud.com` (subject per §1.6.10 of foundations / the screen file). With no mail app: copy the address. No in-app chat or ticket form.
5. **No % scores and no streaks.** No adherence %, completion %, compliance tiles, risk scores or "day streaks" anywhere, for trainer or trainee. Use counts and plain words ("3 of 4 workouts this week").
6. **Acknowledge is separate from Resolve.**
   - **Acknowledge** = "I've seen it". The item stays open, moves to "Reviewed, still open" and shows the ReviewedMarker, with Undo.
   - **Resolve** = closed, with a reason.
   - They're never one button, and acknowledging never closes an item.
7. **Needs attention layout:** **rows** on trainer web (desktop and ≤768 px wraps to two-line rows, TW-04 D32) and **cards** on trainer mobile (TM-01). One severity chip per row or card.
8. **Keep options simple.** One primary action per row, card or screen. Secondary actions go in a ⋯ overflow menu (web) or bottom sheet (mobile). No settings that the guide doesn't specify, and no extra toggles "for flexibility".
9. **Logo: the temporary "Honest Week" four-dot mark.** Three filled `#1A1248` dots, then one outlined `#FF587D` ring (`packages/brand/logo/mark.svg`, `mark-white.svg`, `mark-dark.svg`; mobile `apps/mobile/assets/brand-mark.png`). Use it in the web sidebar/top bar, the auth screens and mobile sign-in. It replaces `/favicon-32.png` + "FitBud Coach" + live-dot in `AppShell.tsx`. *(Source: QA checklist G7 and the repo brand package. The guide itself doesn't describe this mark; see BATCHES.md Spec questions.)*
10. **Ended relationships never appear** in active lists (Home, attention, check-in inbox, re-engage, mobile Attention, activity feed), only in their ended views (TW-30, TR-22).
11. **Mobile lists use pull-to-refresh** (`Screen` with `onRefresh`). There's no manual "Refresh" button on any mobile list.
12. **Labels come from `packages/core`.** Every enum the API returns (status, lifecycle, severity, exception type, ask topic, body part, history kind…) is rendered via `packages/core/src/labels.ts`. Never `replace('_',' ')` in a component.

## B. BANNED strings and patterns (machine-checkable)

The source of truth is **`banned-strings.json`** in this folder. Batch 0 adds a Playwright test (`e2e/banned-strings.spec.ts`, for trainer web on :5173 and Expo web on :8081) that loads it and checks the rendered text of every visited route and state. **Every screen's acceptance checks include "no banned-string match"**, so run the test on your screens and attach its output to your report.

| ID | Pattern (JS RegExp) | Flags | Scope | Severity | Why |
|---|---|---|---|---|---|
| `iso-date` | `\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?` | – | both | error | Raw ISO date/timestamp. Use the packages/core formatter ('Thu 15 Oct'). |
| `uuid` | `\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b` | i | both | error | UUID shown to the user. |
| `hex8-fragment` | `\b(?=[0-9a-f]{0,7}[0-9])(?=[0-9a-f]{0,7}[a-f])[0-9a-f]{8}\b` | i | both | error | 8-hex UUID fragment used as a name or title (e.g. 'Trainee 9035c4ad', shortId()). |
| `snake-case` | `(?<![\w@./:=-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w@./-])` | – | both | error | Raw enum (overdue_meal, portion_size, upper_back, steps_enabled). Map it through packages/core labels. |
| `good-to-see-you` | `good to see you` | i | both | error | Greeting removed (TW-04). |
| `templates-and-libraries` | `Templates\s*&\s*Libraries` | i | both | error | The nav and H1 label is 'Templates' (TW-03/TW-23). |
| `active-coaching` | `Active Coaching` | i | both | error | Sidebar status claim removed (TW-03). |
| `placeholder` | `\bplaceholder\b` | i | both | error | Dev placeholder copy (e.g. 'TR-21 placeholder'). |
| `screen-id` | `\bT[RWM]-\d{2}[a-z]?\b` | – | both | error | Spec IDs in UI. The only exception is the support mailto subject, which isn't rendered. |
| `negative-relative-time` | `(?:^\|[\s(·])(?:in\s+)?-\d+\s?(?:s\|sec\|secs\|m\|min\|mins\|minutes?\|h\|hr\|hrs\|hours?\|d\|days?\|w\|wk\|wks\|weeks?)\b` | i | both | error | Negative relative time. Clamp to 'just now'. |
| `us-numeric-date` | `\b\d{1,2}/\d{1,2}/\d{2,4}\b` | – | both | error | mm/dd/yyyy or dd/mm/yyyy. Use 'Thu 15 Oct'. |
| `us-long-date` | `\b(?:Mon\|Tues\|Wednes\|Thurs\|Fri\|Satur\|Sun)day,\s+(?:January\|February\|March\|April\|May\|June\|July\|August\|September\|October\|November\|December)\s+\d{1,2}\b` | – | both | error | US long date ('Sunday, October 18'). Use 'Sun 18 Oct'. |
| `library-snapshot` | `Library snapshot` | i | both | error | Internal snapshot label with a UUID (PlanCompositionEditor). |
| `percent` | `\d+(?:\.\d+)?\s?%` | – | both | error | No % scores, adherence or completion rates. |
| `streak` | `\bstreaks?\b` | i | both | error | No streaks (§1.5). |
| `banned-figma-claims` | `Live Sync\|Dropout Risk\|Photo Proof\|Priority Trainer Queue\|Day Streak\|Compliance` | i | both | error | Banned Figma elements (§1.5). |
| `dev-copy` | `mvp\.v2\|No gamification\|Selected role\|\bdeterministic\b\|outside FitBud\|Trainee daily execution\|LOCAL_DEV_ERROR\|Invalid datetime\|\[object Object\]\|\bundefined\b\|\bNaN\b\|\bnull\b` | i | both | error | Developer and internal copy leaking into the UI. |
| `help-and-support` | `Help\s*&\s*Support` | – | both | warn | The guide labels the support entry 'Help' (mailto tech@thefitbud.com). Check it against the screen spec. |
| `absurd-kcal` | `\b\d{1,3}(?:,\d{2,3}){2,}\s?kcal\b\|\b\d{5,}\s?kcal\b` | i | both | error | Unscaled nutrient (400000000 kcal; NUTRIENT_SCALE = 1e6). |
| `absurd-minutes` | `\b\d{4,}\s?min\b` | i | both | error | Unbounded duration (29068 min). |
| `lowercase-demo-name` | `(?<![\w.@/-])(?:rahul\|priya\|rohan\|meera\|sneha\|vikram\|aarav\|deepak\|farhan\|ishita\|kavya\|nikhil\|lakshmi\|anita)(?![\w.@-])` | – | both | error | Name not title-cased ('ishita pushoff', 'rahul coach'). Case-sensitive. Emails are excluded by the look-arounds. |
| `sent-claim` | `\bSent on WhatsApp\b\|\bWhatsApp sent\b\|\bMessage sent\b` | i | both | error | FitBud never knows a wa.me message was sent. It says 'Opened WhatsApp'. |
| `24h-time` | `\b(?:[01]?\d\|2[0-3]):[0-5]\d\b(?!\s?(?:am\|pm\|AM\|PM))` | – | both | warn | Times are 'h:mm am/pm'. 24 h values appear in some guide AC (quiet hours); see BATCHES.md Spec questions. |
| `manual-refresh-button` | role check: `getByRole('button', { name: /^\s*refresh\s*$/i })` → count 0 | – | mobile | error | Mobile lists use pull-to-refresh (Screen onRefresh), never a Refresh button. |
| `manual-refresh-button-web-lists` | role check: `getByRole('button', { name: /^\s*refresh\s*$/i })` → count 0 | – | web | warn | The web check-in and history lists had manual Refresh buttons. Realtime is a refetch hint (TW-04 §7). Check it against the screen spec. |

Notes:
- Run it against **rendered UI text** (innerText, `title`, `aria-label`, placeholders and tooltip contents), not against source code. Hidden `wa.me` URLs and `mailto:` hrefs aren't rendered text.
- A false positive is not a reason to edit the JSON. Report it under "Spec questions" with the exact string and route.

## C. Formatting rules

All of these live in `packages/core/src/format.ts` (Batch 0). Components never format dates, times or names inline.

| What | Rule | Example | Never |
|---|---|---|---|
| Civil date | weekday (3 letters), day, month (3 letters); year only when it isn't the current year | `Thu 15 Oct`, `Mon 12 Oct 2025` | `2026-10-15`, `10/15/2026`, `Thursday, October 15` |
| Time | `h:mm am/pm`, lowercase, no leading zero | `7:30 am`, `10:00 pm` | `07:30`, `19:30`, `7:30 AM` |
| Time zone | trainer views show the **client's** local time for client events (with the zone abbreviation when it differs from the trainer's, e.g. `9:10 am GST`); trainee views use the device zone | Deepak (Dubai) events in GST | server UTC |
| Relative time | `just now`, `5 min ago`, `2 h ago`, `yesterday`, `3 d ago`; future: `in 2 d`. Clamp negatives to `just now`. Absolute date and time go in a tooltip (web) or long-press (mobile) | `since 3 d` | `-4 min`, `1m` for a 3-day-old item |
| Ranges | `Mon 12 Oct – Sun 18 Oct`; time ranges `10:00 pm – 7:00 am` | | |
| Names | display names title-cased via `formatPersonName()` (keep existing capitals such as "McKenzie" and initials) | `Ishita Pushoff` | `ishita pushoff`, `Trainee 9035c4ad` |
| Enum labels | `packages/core` labels, sentence case | `Portion size`, `Overdue meal` | `portion_size`, `overdue meal` |
| Numbers | kcal rounded to whole numbers with Indian grouping when ≥ 1,000; durations from real events, bounded | `1,850 kcal`, `48 min` | `400000000 kcal`, `29068 min` |

> The guide's `formatCivilDate` example (§1.6.4) and some captions use a comma (`Mon, 12 Oct`), while other guide text and this product rule don't (`Thu 15 Oct`). This file follows the product rule. The conflict is listed in BATCHES.md "Spec questions" and is not resolved here.
