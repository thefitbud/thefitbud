# FitBud high-fidelity mockups: design notes

These are the visual targets for every implementation batch. Sources: spec pack `docs/spec/` (00-foundations, 01-product-rules, 02-navigation, 09-demo-data, TW-01/03/04/09/09a, TM-01, TR-01/06, plus the BATCHES.md spec decisions) and the brand package (`packages/tokens`, `packages/brand`).

Build: `node tools/build.mjs` (src → html, inlines Lucide icons, partials and the WhatsApp glyph) → `node tools/render.mjs` (headless Playwright → png/) → `node tools/overview.mjs`. QA: `node tools/check.mjs` (banned-strings.json on rendered text), `node tools/contrast.mjs` (WCAG audit).

## Palette and roles
| Token | Hex | Role |
|---|---|---|
| Deep navy | #1A1248 | Headings and names; web sidebar (depth); trainee "Next up" hero; workout-done dots |
| Indigo | #4527C6 | The only filled primary button colour, links, focus ring, active tab/nav, kcal ring |
| Coral | #FF587D | Accent only: the logo ring and the glow in the sign-in gradient. Never a status or selection colour |
| Pale lavender | #EDEAFF on #4527C6 text | Selected filters/segments, count badges, and the **tinted primary** for repeated row/card actions |
| Ink 900/700/500/200 | #0F1115 / #25262B / #5B616B / #E6E8EB | Body text 700, secondary text 500 (6.2:1 on white), ring tracks 200 |
| Page (web / mobile) | #F3F5FB / #F6F5FB | Canvas; cards are #FFFFFF with a #E7E9F2 border |
| Critical | #FEF2F2 / #B91C1C + octagon-alert | Severity Critical, missed workout |
| Attention | #FFFBEB / #B45309 + triangle-alert | Severity Attention, renewal due/expired, not logged |
| Positive | #ECFDF5 / #047857 + circle-check | Logged, done, coach reviewed |
| Info | #EFF6FF / #1D4ED8 + info | Submitted, asked coach, visible-to-client note |
| Neutral | #F3F4F6 / #374151 + circle-dashed etc. | Active (lifecycle), planned, invited, changed, private, coming soon |
| Rings | kcal #4527C6, protein #1A1248, carbs #7C6CF0, fat #0E7490 | Nutrition only; never good/bad; numbers always beside them |

Every state chip has an icon plus text, with a 1 px tinted border so it holds up on white and tinted surfaces. WhatsApp is always a neutral secondary button with the official glyph colours, never green-filled.

## Type (Satoshi 400/500/600/700, embedded from packages/brand/fonts; tabular numbers on all counts, times and kcal)
- Web: Display 28/36 700 · H1 24/32 700 · H2 18/26 600 · H3 15/22 600 · Body 14/20 · Body-sm 13/18 · Label 13/16 500 · Caption 12/16 500 · Numeral-L 24/28 700 tabular. Display gets −0.02em tracking.
- Mobile: Display 28/34 · H1 24/30 · H2 20/26 · H3 17/24 · Body 16/24 (never below 16 for content) · Body-sm 14/20 · Label 14/18 · Caption 12/16. Exceptions: tab labels 11–12 (platform norm), 12 px metadata captions.

## Spacing, radius, elevation
- 4 px base: 4 · 8 · 12 · 16 · 24 · 32 · 40. Web content padding 32, section gap 24, card header 16/20. Mobile gutter 16, card padding 16, section gap 24.
- Radius: web cards 16, inputs and buttons 10 (small buttons 8), chips 999. Mobile cards 20 (spec decision 3), controls 16, the hero 22.
- Elevation: level 1 `0 1px 2px rgb(26 18 72 / 6%)` plus a border on every card; level 2 `0 8px 24px rgb(26 18 72 / 10%)` for menus and popovers. The trainee hero has a soft navy drop shadow.

## Components used
App shell (navy 240 px sidebar, Honest Week mark, Home/Clients/Check-ins/Templates/More, Help (mailto) and the trainer at the bottom; top bar with page title, ⌘K search and bell) · count tiles as filters · AttentionRow (56 px, fixed columns: avatar+name · plain-words issue + "+N more" · one severity chip · "since N d" · Review · ⋯) · list sections with count badges · WorkspaceHeader (name H1, lifecycle + adherence chips, meta line as separate items, Message on WhatsApp secondary, one primary CTA, ⋯, underline tabs with a badge only on Check-ins) · WeeklyConsistency week strip with counts · compact NutritionRings (web) and full NutritionRings (mobile) · ReasonLine card · activity rows with chips and relative times · side cards (Check-in, Plan, Reminders, Progress sparkline, Renewal, Coach notes with Private/Visible badges) · trainee DateNavigator week strip · Next-up hero · workout card · meal rows with Logged / Up next / Later · coach note card and reviewed signal · TM-01 attention cards · segmented filter chips · iOS tab bar and Android M3 navigation bar · auth forms with a disabled "Coming soon" WhatsApp option.

**Button hierarchy:** one filled indigo primary per screen or card (Sign in, Review issue, Start workout, Send code). When the same primary repeats down a list (Review on every row/card, Mark answered, Review intake), it uses the **tinted primary** (lavender fill, indigo text, 7.55:1), so a list never becomes a wall of identical heavy buttons. Then come the secondary (white, border), tertiary (text link) and ⋯ overflow.

## Data and time
Sun 18 Oct 2026. Web at about 9:40 am; trainee Today at 7:30 am (early-morning meal logged at 6:42 am, breakfast at 8:00 am up next, the rest later; workout planned for 6:30 pm). Aarav's meal kcal add up to the 1,850 kcal plan (50 + 420 + 560 + 180 + 640). Rohan's week (2 of 4 workouts, 18 of 25 meals, missed Tue and Thu, lunch and dinner not logged Fri) matches his Home row ("Missed 2 workouts (Tue, Thu) +2 more") and his trainee-side numbers. Ended clients (Kavya, Nikhil) never appear.

## QA run on the final files
- Banned strings (`banned-strings.json`, rendered text plus title/aria-label/placeholder/alt, device status bars excluded): 12 files, 0 errors, 0 warnings. The checker was confirmed to catch %, ISO, snake_case and 24 h test strings.
- Contrast audit on solid backgrounds: no text below AA. Text on gradients (sidebar, hero, sign-in panel) was checked by hand: white at 64–84% on navy/indigo is ≥ 5:1.
- No clipped text and no horizontal scroll at the target viewports.

## Deviations from the spec (minimal, with reasons)
1. **Demo surnames.** The seed's display names are state placeholders ("Rohan Slipping", "Aarav Ontrack"). The mockups use realistic surnames (Rohan Mehta, Aarav Shah, Rahul Verma…), and the 8-row list adds clients the seed doesn't have (Arjun, Neha, Priya, Karthik, Tanvi, Varun, Siddharth) to show a full list. Priya Sharma is used as a client, as in the guide's examples, even though the seed's "Priya" is a second trainer.
2. **Home layout.** The guide's section order is kept in the main column (Needs attention → Asked you on WhatsApp → Reviewed, still open → Getting started → Re-engage). **Check-ins to review** and **Renewals** sit in a 320 px right rail, so they're visible without scrolling at 1440. On narrower widths they should fall back into the single column in guide order.
3. **"Recent activity" on Home.** You asked for it, but it isn't a TW-04 section. It's a quiet, read-only rail card in client time and easy to drop.
4. **Greeting.** TW-04.11 says H1 "Today" with no greeting line. The primary mockup follows the spec (eyebrow "Sun 18 Oct", H1 "Today", one factual summary line). `02b-…-greeting-variant.png` shows "Good morning, Rahul" for comparison. The trainee Today greeting ("Good morning, Aarav. Here's your day.") is from TR-06.
5. **Workspace header label.** The guide's secondary button is "WhatsApp". It reads **"Message on WhatsApp"** as you asked, still neutral secondary. A "Week 6" meta item was added because you asked for the week.
6. **Overview "open items".** By contract the Needs attention card shows **one** open item (the most severe), not a backlog. The submitted check-in is surfaced in the Check-in side card and the tab badge.
7. **Trainee hero + next meal.** TR-06 has a hero and also a "Next meal to log" card inside Nutrition. When the hero *is* the next meal (breakfast, within 60 min), the nutrition card shows the meal-slot list (state per slot) instead of a second identical action card. The hero's primary is a white button on navy, the only non-indigo primary, because indigo on navy lacks contrast.
8. **Sign-in gradient.** The guide gradient is indigo → coral. It's rendered as navy with an indigo glow and a coral corner, so the panel doesn't read as a 2016 gradient. The same two brand stops are used. The web panel adds a small static "Needs attention" product glimpse.
9. **Trainee sign-in.** It's delivered as two iOS screens: password (default) and "Sign in with a code" (Email selected, WhatsApp disabled with "Coming soon" and the guide note). The spec models them as separate states, and putting both on one screen would break "one primary per screen".
10. **TM-01 title.** "Attention" (spec decision 2), with the guide's segments "Needs you · Asked · Check-ins". The full-width Review uses the tinted primary (see button hierarchy). The swipe actions aren't visible in a static frame; the ⋯ fallback is.

## Open founder decisions
- **Navy sidebar vs light sidebar** (compare `02-…-home.png` with `02c-…-light-sidebar-variant.png`). Navy gives depth and brand presence; light is closer to Linear/Stripe and makes the content the hero. I recommend navy.
- **Home greeting**: spec "Today" (recommended for a triage screen) vs "Good morning, Rahul" (`02b`).
- **Recent activity on Home**: keep it as a quiet rail card, or drop it to stay strictly to TW-04.
- **Tinted primary** for repeated row actions, as a formal Button variant (Batch 0.17).
- **Demo seed names**: retitle the seed to realistic surnames so the evidence screenshots look like the product.
