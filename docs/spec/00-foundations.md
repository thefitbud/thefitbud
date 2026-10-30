# 00 · Foundations (read first, in full)

Copied **verbatim** from guide §1.1–§1.6, lines 52–445. This covers the principles, decisions table (D1–D35), removal list, tokens, semantic colours, contrast, spacing, radii, elevation, icons, typography, the component table, formatting, states, loading/empty/error, accessibility, target sizes, responsiveness, motion, copy, support links and feature flags. §1.7 navigation is in `02-navigation.md`. The **Implementation notes** at the end are facts from the repo at `7f74108`, not from the guide.

<!-- BEGIN VERBATIM foundations -->
## 1.1 How to use this guide

1. **Work by screen ID.** Each screen has a stable ID: `TW-` for trainer web, `TM-` for trainer mobile and `TR-` for trainee mobile. Use the ID in branch names, PR titles and commit messages (for example `feat(trainee): TR-07 meal logging one-tap confirm`).
2. **Every screen section uses the same 13-part template:** purpose and user · entry points and route · current state · what's wrong or missing · target design · states · interactions and edge cases · notifications and deep links · references (adopt, adapt, avoid) · UX decisions and why · implementation approach · acceptance criteria · priority.
3. **The status labels** mean the following:
   - **Implemented**: code exists on `feat/iteration-a-backend`. The screen may still need rework, as described in that section.
   - **Figma-only**: designed, but not built.
   - **Missing**: needed by the contract, but neither designed nor built.
   - **New-proposed**: this guide proposes the screen to deliver a 14 Oct decision. It needs product sign-off where marked.
4. **The priorities** mean the following:
   - **P0**: the core loop doesn't work, or the contract is violated. Build it first.
   - **P1**: needed for beta quality.
   - **P2**: valuable, but can follow the beta.
5. **Order of authority when sources disagree:**
   1. The Confluence product contract (Workflows and States beats UX and Screen Architecture beats the Iteration A addendum).
   2. The user decisions in this guide, labelled [DECISION · user 14 Oct].
   3. The rest of this guide.
   4. Figma visuals.
   5. Older Stitch references.

   Code and tests describe what *is* implemented. They don't decide what *should* be built.
6. **Never add a value the API can't return.** Each screen's "Implementation approach" lists any API gap as `API-NEW` (new endpoint or field) or `API-CHG` (a change). Don't build UI against an `API-NEW` item until the endpoint exists. A stub with a feature flag is acceptable.
7. **Copy.** All user-facing strings go through the copy catalogue (§1.9). Strings in this guide are English (en-IN) source strings. Hinglish samples are given where they matter, and they are style guidance, not final translations.
8. **Definition of done for any screen:**
   - every acceptance criterion is ticked;
   - every state (loading, empty, error, offline, partial) is implemented;
   - axe and the React Native accessibility checks pass;
   - the screen has no raw ISO timestamps or UUIDs;
   - every dynamic value is traced to an API field in the PR description.

## 1.2 Authority and what this guide is not

- This guide **does not reopen accepted behaviour**: the derived client status, the four-state adherence enum, Critical, Attention and On track activity severity, Acknowledge versus Resolve, versioned and immutable plans, the assignment windows, and so on. It only decides how that behaviour is presented.
- Where a 14 Oct user decision **refines** an accepted policy, the guide says so explicitly and lists it for Confluence write-back. One example is the reminder timing defaults, which decision C leaves as "system-policy defaults to tune".
- Nothing here has been published to Confluence or Figma.

## 1.3 Global UX principles (each with rationale)

| # | Principle | What it means in the UI | Why |
|---|---|---|---|
| P1 | **Answer the role's one question first** | Trainer screens open on "who needs me, why, what next". Trainee screens open on "what do I do now". | These are the two questions in UX and Screen Architecture §2. Everything else is secondary. |
| P2 | **Honest by construction** | Every number, state and label maps to a persisted or deterministic field. There are no % scores, risk labels, sleep or HRV values, "live sync" claims or usage counts. | This is contract rule UX §12. The 13 Oct audit found 40+ Figma elements with no backend source. Trust is FitBud's differentiator against competitors with opaque scores and sync failures. |
| P3 | **Figma density, code semantics** | Adopt Figma's hierarchy: strong headline, bounded sections, compact rows and iconography. Keep the code's data model: four adherence states, derived status, plan versions, and Acknowledge separate from Resolve. | This is the user's decision of 14 Oct. The gap analysis showed the implementation is honest but flat, while Figma is dense but untruthful. |
| P4 | **One dominant action per card or screen** | Each card shows who or what, why it matters, one useful piece of context, one primary action and at most one secondary action. Any further actions go in a "⋯" overflow menu. | This is UX §11, and it removes pill and button overload. |
| P5 | **Normal path in one tap, detail only for deviations** | "Eaten as planned", "Done" on the current set, and a check-in pre-filled from the last values. | Project principle: "Keep the normal trainee path short". MyFitnessPal and FITTR complaints centre on taps and friction ([R33], [R37]). |
| P6 | **Bounded lists, progressive disclosure** | Home shows the top 5 per group with "View all". Long forms become accordions with summaries. | The implemented Home was 2,630 px with 50 cards. Guidance on information-density levels is in UX §10. |
| P7 | **Reminders serve logging, not engagement metrics** | Push only when the item is still unlogged. Respect quiet hours, apply hard caps, merge reminders and back off. Send no promotional pushes. | 14 Oct decision. HealthifyMe users switch off "pushy" notifications ([R36]). HeartSteps shows prompts work briefly and near the moment of action ([R64]). |
| P8 | **WhatsApp is a door, not a room** | Use context-specific `wa.me` deep links with a prefilled message and a link back to the exact FitBud item. There is no in-app chat. FitBud records only an "asked coach" marker. | This follows the non-goals (no in-app chat, don't replace WhatsApp) and the 14 Oct decision. Trainers already live in WhatsApp. |
| P9 | **Consistency over streaks** | Show a weekly consistency count ("3 of 4 workouts this week"). Use "never miss twice" recovery copy. No leaderboards. | Research suggests missed days are recoverable ([R62]). Daily streaks punish planned rest days. Gamification is a non-goal. |
| P10 | **Show that the coach is there** | Show visible review signs: "Coach reviewed your check-in · Tue", "Coach answered" on asked items, and trainer notes on summaries. | Users churn when coach follow-up feels absent (HealthifyMe and FITTR complaints). The accountability loop is the retention engine. |
| P11 | **Offline is a normal state** | Trainee writes go to the outbox first. Show a quiet sync indicator, and never lose a log. | The architecture is offline-first (Tech Arch §9). Sync failures are the top complaint about competitors ([R25]). |
| P12 | **Calm colour semantics** | Error red is for Critical, amber for Attention, green for On track and neutral grey for No recent data. Coral is a brand accent only, **never** a warning. State always pairs an icon with text, never colour alone. | UX §15–16 rule, plus accessibility. |
| P13 | **India-first** | Use household measures, veg and non-veg swaps, the `en-IN` number format, trainee-local time, Hinglish-ready copy and WhatsApp-native sharing. | This is the target market, and trainers juggle WhatsApp today. |
| P14 | **Explain, don't decide** | The UI states the deterministic reason ("2 required workouts missed: Mon, Wed") and offers the trainer's options. It never recommends a coaching action. | Non-goal: AI coaching or automatic decisions. |

## 1.4 Product decisions baked into this guide

The decisions below are binding for implementation. "Source" shows where each decision comes from.

| ID | Decision | Source | Rationale |
|---|---|---|---|
| D1 | **No in-app chat.** WhatsApp is reached through context-specific `wa.me` links that prefill the message and include an https deep link back to the exact item. | User 14 Oct; Project Details §8 | Trainers already coach on WhatsApp, and chat is an explicit non-goal. |
| D2 | **"Asked coach" marker.** When a trainee opens WhatsApp from an item, FitBud records an ask marker on that item (item, time, optional topic chip). The trainer sees the marker and can **Mark answered** (resolve) or **Add note** in FitBud. Message content is never stored. | User 14 Oct · [PROPOSED] data model, see TR-18 and TW-32 | It closes the loop without building chat, and it keeps sensitive message content out of FitBud. |
| D3 | **Deep links open the exact screen.** One role-aware https link format, `https://{appHost}/go/{kind}/{id}`, opens the trainee item in the trainee app and the client item in the trainer app or web. | User 14 Oct | WhatsApp only linkifies https URLs, so a custom `fitbud://` scheme wouldn't be clickable there. |
| D4 | **Push for in-the-moment logging, only if the item is unlogged.** | User 14 Oct; decision C | Reminders exist to get a log, not to drive opens. |
| D5 | **Workout reminder** fires 60–90 min (default 75) after the trainee's preferred workout time, or the learned time if none is set, with **18:00** as the fallback. **No blanket 06:00 reminder.** | User 14 Oct · changes `WORKOUT_REMINDER_LOCAL_TIMES = ["06:00","18:00"]` in `packages/core/src/reminder.ts` | A 6 AM reminder before a session that's normally done at 7 PM is noise. Learned timing fits real behaviour. |
| D6 | **Meal reminder:** one per meal, 30–45 min (default 40) *after* mealtime, with a one-tap **"Eaten as planned"** notification action and **one snooze** (30 min). | User 14 Oct · changes `MEAL_REMINDER_ADVANCE_MINUTES = 45` and `MEAL_REMINDER_FOLLOW_UP_MINUTES = [30,60]` | Logging happens after eating. One reminder per meal plus one snooze keeps the daily total under the cap. |
| D7 | **End-of-day summary:** one only, at the earlier of (last scheduled meal + 60 min) and 21:30. Nothing is delivered after 22:00. | User 14 Oct · changes `DAILY_SUMMARY_LOCAL_TIME = "21:00"` | It closes the day while the trainee still remembers, and stays out of sleep time. |
| D8 | **Caps:** at most 4–5 pushes a day (hard cap 5). Quiet hours default to 22:00–07:00. Reminders within 30 min of each other are merged. Back off for self-loggers and for people who keep ignoring a reminder. | User 14 Oct | Prevents notification fatigue and opt-out, the HealthifyMe pattern. |
| D9 | **Tone: "never miss twice", no guilt.** | User 14 Oct | Lapses are recoverable. Guilt drives uninstalls. |
| D10 | **WhatsApp is for rare messages.** There are two kinds. **(a) Person-sent `wa.me` prefills**, live now: trainee asks, trainer invites, check-in follow-ups and the **day-3 re-engagement** (trainer-signed text, the trainer presses Send, D31). **(b) FitBud-sent utility messages** through the Cloud API: a reminder fallback for trainees with push off or inconsistent logging, plus plan, check-in and renewal events. These are **built but switched off** (`wa_automation`, D17). At most one FitBud-sent message a day per trainee. | User 14 Oct; refined by D17 (user 17 Oct, Q1) and **D31 (user 17 Oct, evening)** | It's a high-attention channel, so it must stay rare. `wa.me` links are free. See §3.5, §4.2, §4.5 and §4.6. |
| D11 | **Onboarding asks for the channel preference** (App by default), collects explicit WhatsApp opt-in consent, and guides the user through OEM battery optimisation. | User 14 Oct · see TR-05 | Indian Android OEMs kill background apps ([R54]). Meta and the DPDP Act require explicit opt-in ([R44], [R60]). |
| D12 | **Trainers can see each client's reminder responsiveness.** | User 14 Oct · see TW-31 | Trainers can tell "didn't do it" from "didn't see it", and adjust coaching rather than nagging. |
| D13 | **Weekly consistency count instead of a daily streak. No leaderboards. Visible trainer-review signs.** | User 14 Oct | See P9 and P10. |
| D14 | **Keep the code's data model and honesty:** four adherence states, derived status, versioned plans, and Acknowledge separate from Resolve. Adopt Figma's visual density. | User 14 Oct | See P3. |
| D15 | **Remove banned or unsupported elements** (the full list is in §1.5). | User 14 Oct; UX §12 | Contract compliance. |
| D16 | **Trainer mobile is in scope** for quick use: the attention feed, client lookup and status, **a recent-activity feed inside the Clients tab (TM-09)**, check-ins, exception actions, asked-coach items and nudges. Deep plan editing stays on web. | Project Details §5 and §7; UX §7; user 17 Oct (nav 2) | MVP scope. |
| D17 | **WhatsApp Cloud API with a hard budget: fully built, switched off.** *v1.2 (user 17 Oct, evening):* everything below is implemented and tested, but it sits behind the server flags `wa_automation` and `wa_otp`, **both off**. A business SIM and a WhatsApp Business account aren't set up yet. Until the flags turn on, only push and user-tapped `wa.me` links work, and every WhatsApp setting shows "Coming soon" (§1.6.11). Every template needs Meta's approval before first use, and the template registry tracks that status (§4.6). Copy is strictly utility, with no CTA and no marketing framing (OQ-27). FitBud integrates Meta's WhatsApp Cloud API directly. It pays only for messages it starts: **authentication** templates (login OTPs) and **utility** templates (reminders), about **₹0.136 each including GST** (₹0.115 list rate plus 18% GST, Meta India rate card from 1 Oct 2026, [R77] [R78]). Budget is **₹500 a month for 50 trainers**, with a **₹1,000 hard cap**. Every send is recorded in a cost ledger. At 100% of budget, only required-item reminders and OTPs continue. At the cap, all FitBud-started WhatsApp stops for the rest of the calendar month (IST): reminders fall back to push only, OTPs go by email only, and admins get an alert. Marketing-category templates are never used. Opt-in is explicit and recorded (TR-05). | User 17 Oct (Q1) | Predictable cost, and WhatsApp reaches the trainees push can't reach. Password is the default login, so OTP volume is low. Nearly all spend is reminders. Full spec in §4.5. |
| D18 | **Password login by default; OTP as an alternative.** Sign in with mobile number *or* email, plus password. "Sign in with a code instead" sends a 6-digit OTP. **Live now: email OTP only.** The WhatsApp leg (one code to both WhatsApp and email at once, and either copy works) is **fully built behind `wa_otp` (off)**. The UI shows a disabled "WhatsApp · Coming soon" option with a short note. **No SMS OTP**, and no SMS fallback. Forgot password uses the same OTP. | User 17 Oct (Q11); **v1.2: user 17 Oct, evening** | Passwords avoid per-login cost and delivery failures. Dual-channel OTP covers WhatsApp outages and full inboxes. See TW-01, TR-01 and §3.1a. |
| D19 | **Support by email.** There's no help site. Every "Help" or "Contact support" link opens a `mailto:tech@thefitbud.com` in the default mail app, with a prefilled subject and a context block (app and version, platform, role, screen ID, request ID when there was an error). It never includes health data. | User 17 Oct (Q12) | Zero build cost. The context lets support act without a back-and-forth. See §1.6.10. |
| D20 | **Trainer notes are private unless marked "Visible to client".** A visible note shows in the trainee's Today "From your coach" card (and on the item it's attached to, such as a check-in) and sends push **P-NOTE** ("Rahul has a note for you!"). Unmarked notes stay private to the trainer. | User 17 Oct (Q14) | It gives the coach a voice in the app without building chat. See TW-34 and TR-06. |
| D21 | **Ending and restarting coaching.** If the *same* trainer and trainee restart, the relationship is **reactivated and restored**, with history, configuration and the trainer's notes back as they were. A *different* trainer always starts with **a new invite and a blank workspace**: nothing from the previous trainer is shared, and onboarding isn't reused. The trainee keeps their full progress and coaching history in the app. | User 17 Oct (Q15) | Reactivation is fast for returning clients. New trainers get a clean privacy boundary. See TW-30, TR-22 and §3.8. |
| D22 | **The trainee's timezone runs the app.** Reminders, day boundaries, "today", logging windows, assignment dates and quiet hours all use the trainee's timezone. Trainers see the time difference in the client's persistent header and whenever they schedule check-ins or plan a call. Trainers absorb the extra work. | User 17 Oct (Q16) | Logging and reminders have to match the trainee's real day. See §3.9. |
| D23 | **Late logging stays open until the exception is resolved.** A past assigned item that wasn't logged can still be logged as **late** after its day has passed, until the trainer resolves the related exception. Acknowledging doesn't lock it. Resolving does. | User 17 Oct (Q17) | Honest records beat lost ones. The trainer decides when the matter is closed. See §3.7. |
| D24 | **Trainees can change their meal times.** A trainee can move each meal slot's time (TR-24). The trainer gets an activity entry and a "Custom meal times" indicator on the client view. Reminders and meal windows follow the new times. | User 17 Oct (Q20) | Reminders need to match real eating times, and the coach stays informed. |
| D25 | **Kcal is visible to trainees, per meal and for the whole day.** Today shows nutrition rings for kcal, protein, carbs and fat, logged against assigned (numbers, never % text). Diet shows kcal per meal and per day. | User 17 Oct (Q7; nav 3) | Trainees asked to see intake against plan. The rings show nutrition totals, not an adherence score (§1.5 note). |
| D26 | **Templates use a secondary tab bar of six type tabs:** Workouts · Diets · Full plans · Check-ins · Onboarding · Libraries. The **scope filter** (All · FitBud bases · Mine) and the **Use / Fork** actions stay inside each tab. | User 17 Oct (nav 1); guide decision | Each type is a different object with its own editor and actions, which is what tabs are for. Filter pills suit narrowing one homogeneous list. The current code already renders families as tabs, so the effort is close to zero. Full reasoning in TW-23. |
| D27 | **The trainee Today tab gains** a date navigator, a Today's workout card with a direct **Start workout**, nutrition rings plus a "next meal to log" card, and an **optional step count** (Health Connect or HealthKit, hidden without permission, never sent to the server, **never shared with the trainer**). Steps are in MVP only if they pass the go/no-go spike in TR-25 (D35); otherwise they move after MVP. Past days are read-only except for late logging (D23). Future days are a read-only preview. | User 17 Oct (nav 3) | One screen answers "what now" and "how am I doing today". See TR-06 and TR-25. |
| D28 | **"Something different" can log actual foods from the food library**, with search, quantity and unit, and macros calculated by the same rules as plans. Foods that aren't found become custom items with unknown nutrients. The actual totals feed the rings and the trainer's views. | User 17 Oct (nav 4) | Accurate intake without leaving the meal flow. See TR-08 and TR-26. |
| D29 | **A trainer-set review-time expectation ("I review within 48 h") is out of MVP scope.** | User 17 Oct (Q19) | Optional, not required. The default check-in copy is "Rahul will review this." |
| D30 | **System email.** Every system email (OTP, invites, password reset, budget and admin alerts) is sent from one configurable sender: `SYSTEM_EMAIL_FROM`, which defaults to `FitBud <tech@thefitbud.com>`. Reply-to defaults to the same address (`SYSTEM_EMAIL_REPLY_TO`). Admin alert recipients come from `ADMIN_ALERT_EMAILS`, which defaults to `tech@thefitbud.com`. | User 17 Oct, evening | One address for now, and it can change without a deploy. The email provider and domain authentication are OQ-32. |
| D31 | **FitBud never auto-sends on a person's behalf.** Anything a trainer or trainee "sends" (re-engagement, invites, follow-ups, asks) opens `wa.me` with a prefilled **text** template, and the person presses Send in their own WhatsApp. Day-3 re-engagement is a **trainer-initiated prefill**, not an automated message. The wording is "written as the trainer" or "trainer-signed text". It's text only: no voice notes and no audio. FitBud-sent messages (D17) are always signed as FitBud, never as the trainer. | User 17 Oct, evening | It keeps trust and consent with the person whose name is on the message, and it avoids Meta policy risk. "Trainer's voice" was ambiguous, so it's been removed everywhere. |
| D32 | **Home "Needs attention" on trainer web is a list of rows, one per client, not cards.** Each row has one status chip, the avatar and name, the issue in plain words, its age and one primary action. Rows are ordered by severity, then age. About 8 rows show, then "View all". It's fully keyboard-navigable. **Trainer mobile keeps cards** (TM-01). | User 17 Oct, evening | The full rationale, comparing rows and cards, is in TW-04 §10. In short: triage is scanning and comparing many similar items, which rows do better (higher density, aligned columns, a predictable action position, keyboard use). Cards suit heterogeneous content and touch on small screens. |
| D33 | **Support reply promise.** Help shows a short promise in FitBud's voice: "We'll get back to you within a day." It's backed by an internal target of one working day for `tech@thefitbud.com`. | User 17 Oct, evening (OQ-29) | Sets expectations for the mailto-only support channel. The copy options are in §1.6.10. |
| D34 | **Optional items aren't late-loggable.** The late-logging rule (D23) applies only to items that have an exception, until the trainer resolves it. There's no separate window for optional items. | User 17 Oct, evening (OQ-26) | It keeps one simple rule. |
| D35 | **Steps go/no-go.** Steps are never shared with the trainer (OQ-30). They're in MVP only if reading today's step count is straightforward with Expo-compatible libraries on both platforms, as judged by the TR-25 spike criteria. Otherwise they move to after MVP. | User 17 Oct, evening (OQ-30) | Native health integrations carry build and store-review cost. MVP shouldn't absorb that unless it's cheap. |

## 1.5 Removal list (banned or unsupported elements)

Remove these from Figma and never implement them. Reviewers should reject any PR that adds one.

| Element | Where it appears | Why it's banned | Replace with |
|---|---|---|---|
| Numeric adherence or compliance % (for example "72% Fair", "Diet adherence 74%", "76% Target" ring, "94% Comp. Rate", "53% On Plan") | Figma: trainer Home, Clients, Overview; trainee Today, Diet, Yesterday | Iteration A §3 and decision D: no numeric score | Counts ("17 of 21 meals logged") and the four-state adherence chip. **Exception (D25):** the trainee **nutrition rings** on Today are allowed. They show logged vs assigned kcal and macros as numbers ("1,240 / 1,850 kcal"), never a % label, never red or green, and they're not an adherence or compliance score. **Confluence flag C-9.** |
| Risk labels ("Dropout Risk", "Flagged", "Macro Underflow", "Acute Flares", "Fatigue High") | Figma trainer Home and Clients; Stitch client detail | Opaque risk, banned | Activity severity (Critical or Attention) plus the deterministic reason sentence |
| Sleep, HRV, biofeedback, "Soreness, Sleep & HRV Sync", "Sleep & Rest (7-day avg)" | Figma Overview, Plan Builder, Check-in | No wearable integration (non-goal) | Self-report questions only if they're in the check-in template |
| Hydration and water tracker | Figma Today and Diet | Not in `tracking_requirements` | Nothing (OQ-9 if hydration is wanted) |
| Steps as a required, synced or trainer-visible metric | Figma Today | Wearable integration is a non-goal (Project Details §8) | Only the **optional, on-device** step card (TR-25, behind the go/no-go in D35). It needs permission, is hidden when that's not granted, and is never sent to FitBud or shown to the trainer. **Confluence flag C-10.** |
| "WhatsApp Live Sync", "Telemetry Synchronized", "Real-time adherence pulse" | Figma Home and Overview | No such integration. WhatsApp is a redirect. | Nothing. Show the real freshness ("Updated 2 min ago") only if useful. |
| Usage counts ("Used 18 times", "42 prescriptions active", "High Retention", "850 Verified items") | Figma Templates | Copies don't alias templates, so the counts aren't derivable | Created and updated dates, family and owner |
| "Verified", "Photo Proof", "Finalized & Verified" | Figma Templates and Yesterday's diet | Photos are not proof (UX §9) | "Photo added" |
| "Ask Coach Rahul About This Diet" (chat) | Figma Assigned Diet | In-app chat is a non-goal | The TR-18 "Ask on WhatsApp" flow |
| Grocery list, Broadcast cohort announcement, Schedule calendar session, Scheduled coaching session rows, Voice memo, Media and video vault, Custom recipe | Figma | Out of scope | Nothing |
| "Priority Trainer Queue: reviews within 4 hours" | Figma Check-in | Invented service promise | "Your coach will review this" |
| Stimulus analytics, weekly sets volume inspector, fatigue indices | Figma Plan Builder | Banned by Iteration A §10 | Prescription fields only |
| "Mesocycle", "Deload week scheduled", "Load progression rules", "Hormonal base", "Clinical intervention", "commercial coaching mandate" | Figma | Not modelled, and jargon | Trainer instruction text and neutral history kinds |
| Daily streak chip ("5-Day Streak") | Figma Today and Diet | No streak entity, and it punishes rest days | Weekly consistency (TR-06) |
| Per-meal "Set Reminder" | Figma Diet | FitBud owns reminder timing (decision C) | TR-16 reminder settings |
| Client "Paused" or "Archived" badges, "Low Adherence <60%" filter | Figma Clients | No such status | Derived lifecycle plus adherence filters |
| Bulk message, Export roster, leaderboards, badges | Figma Clients | Out of scope | Nothing |
| Trainee-facing "Active Plan V2" | Figma Today; implemented TodayTab plan card | Version numbers are trainer jargon | Plan title only |
| Strength progression charts | Figma Progress | Deferred in the contract | Weight and measurement trends, photo compare |
| Dev copy shown to users ("No gamification.", "Selected role · userId", "deterministic exceptions only", "Plan builder stays on web.", "(outside FitBud)") | Implemented mobile screens | Internal language leaking into the UI | Human copy (see each screen) |
| "Active Coaching" live dot in the brand lockup | Implemented AppShell | Implies a live status that doesn't exist | Trainer name and role |

## 1.6 Design system

### 1.6.1 Tokens

These are the canonical brand tokens from UX §15, already present in `packages/ui-mobile/src/theme.ts` and `apps/trainer-web/src/styles.css`. Add the **semantic layer** below to both. On web, put it in `styles.css` `:root` as CSS custom properties. On mobile, add a `semantic` export in `theme.ts`.

| Token | Value | Use |
|---|---|---|
| `brand.deepNavy` | `#1A1248` | Headings, primary text on light, dark surfaces |
| `brand.indigo` | `#4527C6` | Primary buttons, selection, links, focus ring |
| `brand.coral` | `#FF587D` | **Brand accent only:** logo gradient, celebration micro-moments, onboarding hero. **Never** a status, warning or error colour. |
| `brand.softCoral` | `#FFB0C3` | Decorative only |
| `brand.paleLavender` | `#EDEAFF` | Selected row or tab background, info-neutral panels |
| `brand.gradient` | `#4527C6 → #FF587D` | Logo, sign-in hero, invite landing. Nowhere else. |
| `ink.900` / `ink.700` / `ink.500` / `ink.200` | `#0F1115` / `#25262B` / `#5B616B` / `#E6E8EB` | Text and borders |
| `surface.page` | Web `#F3F5FB`, mobile `#F6F5FB` | Canvas |
| `surface.card` | `#FFFFFF` | Cards |
| `border.default` | `#E7E9F2` | Card and table borders |

**Semantic status colours.** Use a tinted background with dark text and an icon. Ratios were computed against WCAG 2.2 ([R57]).

| Semantic | Icon | Fill | Text or icon colour | Contrast | Used for |
|---|---|---|---|---|---|
| `critical` | ⛔ octagon-alert | `#FEF2F2` | `#B91C1C` | 5.91:1 | Activity severity Critical, error states, destructive actions |
| `attention` | ⚠ triangle-alert | `#FFFBEB` | `#B45309` | 4.84:1 | Activity severity Attention, overdue, renewal due or expired |
| `positive` | ✓ circle-check | `#ECFDF5` | `#047857` | 5.21:1 | On track, completed, confirmed, synced |
| `info` | ℹ info | `#EFF6FF` | `#1D4ED8` | 6.16:1 | Informational banners, "Asked coach", upcoming |
| `neutral` | ○ circle-dashed | `#F3F4F6` | `#374151` | 9.37:1 | No recent data, not available, pending, scheduled, ended |
| `brand-selected` | n/a | `#EDEAFF` | `#4527C6` | 7.55:1 | Selected filter, active tab, reviewed marker |

**Nutrition ring colours** are non-semantic: they never mean good or bad, and going over the assigned amount stays the same colour. kcal is `#4527C6` (indigo), protein `#1A1248` (deep navy), carbs `#7C6CF0` (light indigo) and fat `#0E7490` (cyan 700), each on a `#E6E8EB` track. The numbers always appear next to the ring, so colour never carries meaning on its own.

**Contrast rules** (computed 14 Oct):
- White text on coral is 3.02:1, which fails AA for body text. White on amber `#F59E0B` is 2.15:1 and white on green `#10B981` is 2.54:1, so **never put white text on these fills**.
- White on indigo is 8.9:1, so indigo stays the only filled primary button colour.
- A filled destructive button uses `#B91C1C` with white text (6.47:1). Don't use `#EF4444` for it (3.76:1).
- WhatsApp buttons are **neutral secondary buttons** (white with an `ink.200` border) carrying the WhatsApp glyph in its official mark colours. Never fill a button with WhatsApp green, and never use WhatsApp green as a FitBud status colour (UX §15).

**Spacing:** 4 px base, rhythm 4 · 8 · 12 · 16 · 24 · 32 · 40, matching the existing `spacing` tokens xs to xxxl.

**Radii:**
- Web: cards 16 px (reduced from the current 20 px for density), tables and inputs 10 px, buttons 10 px. Pills (999) for status chips and filters only.
- Mobile: cards 20, controls 16, and tactile primary actions 16 or full-round for the set "Done" button.

**Elevation:** Level 0 is a flat page. Level 1 is a card with `0 1px 2px rgb(26 18 72 / 6%)` plus a border. Level 2 is a popover or drawer with `0 8px 24px rgb(26 18 72 / 10%)`. Level 3 is a modal with a scrim at 40% deepNavy.

**Iconography:** use one set, Lucide (`lucide-react` for web, `lucide-react-native` for mobile), at 1.75 px stroke, 16 px inline, 20 px in navigation and 24 px in mobile tabs. This replaces the ad-hoc inline SVGs in `AppShell.tsx`.

### 1.6.2 Typography

Satoshi (400, 500, 600 and 700) is already loaded on web through Fontshare. **Mobile doesn't load Satoshi yet**: `theme.ts` has no `fontFamily`, so add it with `expo-font`. Satoshi has no Devanagari glyphs, so the fallback stack is `Satoshi, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif`.

| Style | Web (px, size/line) | Mobile (pt) | Weight | Use |
|---|---|---|---|---|
| Display | 28/36 | 28/34 | 700 | Page title on Home and Today only |
| H1 | 24/32 | 24/30 | 700 | Screen titles |
| H2 | 18/26 | 20/26 | 600 | Section titles |
| H3 | 15/22 | 17/24 | 600 | Card titles |
| Body | 14/20 | 16/24 | 400 | Default text. Mobile body is never below 16. |
| Body-sm | 13/18 | 14/20 | 400 | Secondary metadata |
| Label | 13/16 | 14/18 | 500 | Form labels, chips |
| Caption | 12/16 | 12/16 | 500 | Timestamps, helper text |
| Numeral-XL | n/a | 40/44 tabular | 700 | Active set weight and reps |
| Numeral-L | 24/28 tabular | 28/32 tabular | 700 | Count tiles |

Use `font-variant-numeric: tabular-nums` (web) and `fontVariant: ['tabular-nums']` (React Native) on all numbers in tables, timers and set rows.

### 1.6.3 Component library

The web components live in `apps/trainer-web/src/components/` (new sub-folders as noted). The mobile components live in `apps/mobile/src/components/`. Where both platforms share logic (label maps, formatters), put it in `packages/core` (pure TypeScript, no React).

| Component | Platforms | Spec | Replaces or extends |
|---|---|---|---|
| `StatusChip` | web, mobile | `kind` ∈ {lifecycle, adherence, severity, checkin, renewal, meal, workout, sync, ask} and `value` = the API enum. It renders an icon, a label from `packages/core/src/labels.ts` [new] and the semantic colour. There's one chip per concept, with at most two chips per row (lifecycle plus adherence). | Web `StatusBadge.tsx` and mobile `StatusChip.tsx` (tone-only, no icon) |
| `ReasonLine` | both | The deterministic reason sentence built from `exception.type`, `details` and local dates: "Missed workout · Mon 12 Oct". Never shows a raw ISO string. | Raw `summary` strings |
| `AttentionRow` | web | Avatar initials · name · `ReasonLine` (most severe reason, plus "+N more") · since · `StatusChip(severity)` · Acknowledged marker · primary action (Review) · ⋯ overflow (Acknowledge, Nudge, Open client, WhatsApp) | The Home `exception-card` |
| `ClientRow` | web | Name · goalShort · lifecycle chip · adherence chip · next check-in · effective plan (truncated, with a tooltip) · one action | `ClientsPage` table row |
| `WorkspaceHeader` | web | Line 1: name, lifecycle chip, adherence chip. Line 2: meta (goalShort · plan title · next check-in · age·gender · renewal chip). Right side: one primary CTA plus ⋯. | The run-on meta string in `ClientWorkspaceLayout.tsx` |
| `Tabs` | web | Underline tabs with an optional count badge. Keyboard: ←/→ moves between tabs, Home and End jump to the ends. | Existing tab links |
| `FilterBar` | web | One row: search, then multi-select dropdown pills (Status, Adherence, Goal) with live counts and a "Clear" link. Selected pills use `brand-selected`. | The three text-row facets |
| `StickyActionBar` | web, mobile | A bottom bar for the screen's primary decision (check-in review outcome, builder publish, meal sheet confirm). | Actions sitting below the fold |
| `Drawer` | web | A right-side panel 480–560 px wide, used for exception detail, asked-coach detail and quick previews. It has a deep-linkable URL param. | The full-page `/exceptions/:id` (kept as a deep-link fallback) |
| `Modal` | web | Centred, max width 640, used for Assign plan, Fork template and End relationship. | n/a |
| `BottomSheet` | mobile | A Material 3 modal bottom sheet ([R49]): drag handle, scrim, dismiss with a swipe or back. Used for meal deviation, the ask-coach topic, snooze and filter. | The full-screen `MealDeviationScreen` |
| `Toast` / `Snackbar` | both | 4 s, with an optional Undo. Use it for confirmations ("Lunch logged · Undo") ([R50]). | Silent saves |
| `EmptyState` | both | Icon, a one-line title, one sentence that names who owns the next step, and one action ([R67]). | The plain "No …" text |
| `ErrorState` | both | What failed, a Retry button and a "Details" disclosure holding the request id. **It never signs the user out on a network error.** | The `AuthProvider` sign-out on API failure |
| `Skeleton` | both | Row and card skeletons shown after 300 ms ([R68]). | "Loading…" text |
| `SyncIndicator` | mobile | A top-bar glyph with four states: *Saved on phone* (cloud-off, neutral) · *Syncing* (spinner) · *Synced* (check, shown for 2 s, then hidden) · *Sync problem* (attention, opens TR-19). | n/a (`SyncProvider` has no UI) |
| `AskedCoachMarker` | both | An `info` chip reading "Asked coach · 2 h", or "Coach answered" in positive once resolved. | n/a [new] |
| `ReviewedMarker` | both | Trainer side: "Acknowledged · you, 10:12". Trainee side: "Coach reviewed · Tue". | n/a [new] |
| `NutritionRings` | mobile (trainee), web (trainer, compact) | Four rings: kcal (large) plus protein, carbs and fat (small). Each shows "logged / assigned", for example "1,240 / 1,850 kcal" or "62 / 90 g". The logged total is "≥ value" when any logged item has unknown nutrients. A ring past 100% shows a full ring plus an overflow arc in the same colour, and the label reads "+180 kcal over plan" in neutral text. No % text. | n/a [new] |
| `DateNavigator` | mobile (trainee) | ‹ previous · date label ("Today", "Yesterday", "Thu 15 Oct") with a calendar icon · next ›. The calendar opens a month sheet with a dot on days that have unlogged late-loggable items. A "Back to today" pill appears when away from today. | n/a [new] |
| `FoodSearch` | mobile (trainee), web (builder drawer) | A search field with Recent and Frequent sections, results showing name, classification and serving chips, then a `QuantityPicker` (unit chips plus a stepper) with live kcal and macros. Full spec in TR-26. | n/a [new] |
| `NoteCard` / `NoteComposer` | web, mobile | Composer: text, a **"Visible to client"** switch (off by default) and Save. Card: the note text, author, time and a visibility badge ("Private" in neutral, "Visible to client" in info). Spec in TW-34. | n/a [new] |
| `TimezoneBadge` | web, mobile (trainer) | "Priya's time 6:10 am · 5 h 30 m behind you". It's hidden when the offsets are equal. | n/a [new] |
| `SupportLink` | web, mobile | Builds the `mailto:` per §1.6.10. | Static "Help & Support" text |
| `WeeklyConsistency` | mobile, web | Mon to Sun dots for this week. Each dot is done, partial, missed (outlined), rest (a dash) or future (faint). Under the dots is a count line: "3 of 4 workouts · 17 of 21 meals". | The Figma streak chip |
| `TrendChart` / `Sparkline` | web, mobile | A line chart of a stored measurement series. It shows "No data yet" rather than zero, and breaks the line on gaps. Web uses a small library (for example `recharts`) or SVG. Mobile uses `react-native-svg`. | `MeasurementTrend.tsx` (extend it) |
| `PhotoCompare` | web, mobile | Two stored photos side by side with dates, chosen from the gallery. | n/a |
| `DateWindowPicker` | web | Three radio cards (Next 7 days, Next calendar week, Custom dates) plus a date-mapping preview grid. | n/a |
| `FormRenderer` | mobile, web preview | Renders the six MVP field types (short text, long text, single choice, multiple choice, number, yes/no) plus measurement and photo blocks for check-ins. | `IntakeScreen` fields and the hard-coded `CheckinScreen` fields |
| `SetRow` | mobile | States: assigned · active · completed · modified · skipped. Shows prescribed values, plus the previous values as a caption. | `ActiveWorkoutScreen` rows |
| `Stepper` | mobile | ± with long-press repeat. Steps are 2.5 kg, 1 rep and 0.1 kg (body weight). Once a value differs from the prescription, the row shows a "Modified" tag. | Text inputs |
| `MealCard` | mobile | States: scheduled, due, pending, confirmed, modified, skipped, logged later, overdue. Badges: photo requested, asked coach. Primary: "Eaten as planned". Secondary: "Something different". | `DietTab` rows |
| `WhatsAppButton` | both | A neutral secondary button. If no number exists it's disabled, with a tooltip saying why. Builds the `wa.me` link through `packages/core/src/whatsapp.ts`. | Duplicated helpers in web `lib/whatsapp.ts` and mobile `trainer/whatsapp.ts` |
| `NotificationRow` | mobile | Icon by type, a one-line title, relative time and a read state. Tapping it routes by deep link. | n/a |

### 1.6.4 Shared formatting rules (P0)

Add `packages/core/src/format.ts` [new] and use it everywhere. The gap analysis found raw ISO strings such as `2026-10-07T14:56:05.25Z`.

| Function | Output example (en-IN) | Rule |
|---|---|---|
| `formatCivilDate(localDate)` | "Mon, 12 Oct" (current year), "12 Oct 2025" (any other year) | For `localDate` strings. No timezone shift is applied. |
| `formatInstant(iso, tz)` | "13 Oct, 12:18 pm" | Always uses the viewer's timezone. Trainer views of trainee activity show the trainee-local time, with "(client time)" when the two zones differ. |
| `formatRelative(iso, now)` | "2 h ago", "Yesterday", "in 3 days" | Prefer this in lists, with the absolute time in a tooltip or accessibility label. |
| `formatWindow(start, end, tz)` | "Due by Wed 14 Oct, 11:59 pm" | For check-in and meal windows. |
| `formatCount(n, unit)` | "1 meal", "3 meals" | Uses ICU plurals through the copy catalogue. |
| `formatNumber(n)` | "1,280" or "1,00,000" | `Intl.NumberFormat('en-IN')` ([R59]) |
| `formatWeight(kg, unit)` | "74.2 kg" | Stored in kg. Display unit is a user preference (kg or lb). |
| `formatTimeDiff(viewerTz, subjectTz, now)` | "5 h 30 m behind you" or "Same time as you" | Used by `TimezoneBadge` and the check-in scheduling pickers (D22) |
| `formatKcal(n, unknown)` | "1,240 kcal" or "≥ 1,240 kcal" | Unknown nutrients never become 0 |

Never render: UUIDs, `ruleVersion` strings like `mvp.v2`, enum literals with underscores, or `Z` timestamps.

### 1.6.5 States (applies to every screen)

| State | Visual | Rule |
|---|---|---|
| Loading (first) | A skeleton matching the layout | Show it after 300 ms. Below that, show nothing, to avoid a flash. |
| Loading (refresh) | Keep the content, and show a thin top progress bar (web) or pull-to-refresh spinner (mobile) | Never blank out data that's already on screen. |
| Empty | `EmptyState`, naming the owner of the next step | One action only. Copy is in each screen section. |
| Error | `ErrorState`: inline per section where possible, full page only when the primary read fails | 401 goes to sign-in. Network failures and 5xx show Retry. 404 shows "Not found" with a Back link. 409 (version conflict) shows "This changed elsewhere. Reload to see the latest." |
| Offline (mobile) | `SyncIndicator` plus an inline note on actions that need the network | Outbox-capable actions (meal confirm, set done, check-in draft) work offline. Network-only actions are disabled, with "Needs internet". |
| Offline (web) | A top banner: "You're offline. Changes can't be saved." Disable mutating buttons. | Trainer web is online-only (Tech Arch §6). |
| Partial | Each section loads independently. A failed section shows an inline error while the others render. | For example, the workspace header loads but the activity list fails. |
| Read-only (ended relationship) | A neutral banner, "Coaching ended on 3 Oct. History is read-only.", and all mutating controls hidden | Decision G |
| Permission-limited (mobile) | An inline "Notifications are off" card with "Turn on" | No repeated system prompts ([R52]) |

### 1.6.6 Accessibility

- Meet WCAG 2.2 AA on web. On mobile, apply the equivalent platform guidance.
- **Target sizes:** at least 24×24 CSS px on web ([R56]). On mobile, at least 48×48 dp, primary actions at least 56 dp, and the set "Done" button at least 72 dp.
- **Colour:** never the only carrier of meaning. Every `StatusChip` has an icon and text.
- **Keyboard (web):**
  - Every action is reachable with Tab, and the skip-link is already present in `AppShell`.
  - Lists support J/K to move, Enter to open, A to acknowledge and N to nudge, with a visible shortcuts help on `?`.
  - Drawers and modals trap focus and return it on close. Esc closes them.
- **Screen readers:**
  - Rows read as a sentence: "Priya Sharma. Needs attention. Missed workout Monday 12 October. Critical. Not acknowledged."
  - Set rows read as: "Set 2 of 4, 70 kilograms, 10 reps, not done."
  - Live regions announce toasts and the rest timer every 30 s, not every second.
- **Dynamic Type and font scaling:** Today, Diet and the active workout must work at 200% scaling. Rows wrap rather than truncate. Fixed-height containers are banned.
- **Reduced motion:** respect `prefers-reduced-motion` and the OS setting. Use opacity transitions instead of motion.
- **Language:** set `lang` and `accessibilityLanguage` per string locale so Hinglish isn't read with a Hindi engine.

### 1.6.7 Responsiveness

| Surface | Breakpoints | Layout |
|---|---|---|
| Trainer web | ≥1280: a 240 px sidebar plus content (max 1200) · 1024–1279: a 72 px icon rail ([R48]) · 768–1023: a collapsible rail with drawers overlaying · <768: a top bar plus a bottom navigation bar of 5 items ([R47]). Tables become stacked cards. | This fixes the current 390 px failures (the sidebar stacks, Home overflows, the Check-ins label is clipped). The 390 px trainer **web** is a fallback. Trainers on phones should use trainer mobile (TM). |
| Trainer mobile and trainee mobile | Phones 360–430 pt wide · tablets get a centred max-width column of 600 (`supportsTablet` is true in `app.json`) | Portrait only (`app.json` orientation). |
| Plan builder (TW-13, TW-14) | ≥1280: three panes · 1024–1279: two panes, with the library as a toggle drawer · <1024: read-only preview plus "Open on a larger screen" | Deep editing is web-optimised (UX §7). |

### 1.6.8 Motion

Motion is only for state change:
- Set completion: a 150 ms check plus a light haptic.
- Rest timer: a ring progress bar.
- Meal confirm: the card collapses into its confirmed state in 200 ms, then a toast appears.
- Drawer: a 200 ms slide.

Avoid confetti, bouncing counters and decorative motion. The workout summary gets **one** subtle celebration (a coral accent line), which is the only place coral appears near completion.

### 1.6.9 Copy, tone, i18n and Hinglish readiness

**Voice.** Clear, encouraging, human and brief. For trainees it reads like a supportive coach: second person, active voice, no guilt. For trainers it reads like a precise assistant: facts first, no hype.

**Tone rules**

1. **Never miss twice.** After a miss, focus forward: "Yesterday got away from you. Today's a fresh start." Avoid "You failed / you missed / don't break your streak".
2. Never shame, and never use exclamation marks in reminders.
3. Name the item and the next step: "Lunch isn't logged yet. Tap if you ate as planned."
4. Trainer copy states the rule: "2 required workouts missed this week (Mon, Wed)". Avoid "Client is at risk".
5. No internal jargon in the UI: never "deterministic", "exception" (trainer UI says "Needs attention"), "relationship", "assignment", "idempotency", "payload" or "outside FitBud".

**Glossary** (UI word on the left, model term on the right)

| UI (trainer) | UI (trainee) | Model |
|---|---|---|
| Needs attention item | (not shown) | exception (active) |
| Reviewed | n/a | exception acknowledged |
| Resolved | n/a | exception resolved |
| Nudge | Reminder from your coach | activity_nudge |
| Plan · Version 3 | Your plan | plan / plan_version |
| Client | n/a | coaching relationship (trainee side) |
| Coach | Coach | trainer |
| Logged · Logged late · Not logged · Skipped · Changed | Same | meal compliance states |
| Check-in due · Overdue · Submitted · Reviewed | Same | checkin derived states |

**i18n implementation**
- Add a new package, `packages/copy`, holding plain TypeScript message catalogues:
  - `en-IN.ts` is the source.
  - `hi-Latn.ts` is Hinglish, phase 2 and trainee-first.
  - `hi.ts` is Devanagari, later.
- Messages use ICU syntax for plurals and selects. Use one runtime on both platforms, for example `i18next` with `react-i18next` on web and mobile, or FormatJS. Pick one and use it everywhere.
- **Rules:**
  - No string concatenation.
  - Allow 30–40% expansion.
  - Trainer-entered content (food names, instructions, plan titles) is **never translated**, so render it as entered.
  - Push copy is resolved **server-side** in the recipient's locale, because the push is built on the API. Add a `locale` field to the user's preferences [API-NEW].
- **Hinglish style:** Roman script, short sentences, English for fitness nouns ("workout", "set", "check-in") and Hindi for the verbs and politeness. For example: "Lunch ho gaya? Plan ke hisaab se khaya toh ek tap mein log karo." Test with real trainees. A sample appears beside each notification in §4.

### 1.6.10 Support links (D19)

Every Help, "Contact support" or error "Report a problem" entry uses `SupportLink`, which opens the user's default mail app:

```
mailto:tech@thefitbud.com?subject=<encoded subject>&body=<encoded body>
```

| Field | Content |
|---|---|
| Subject | `FitBud support · <app> · <screen ID>`, for example `FitBud support · Trainee app · TR-07 Diet` |
| Body | A blank line for the user to write in, then a separator and the context block: app (Trainer web, Trainer app or Trainee app), version and build, platform and OS version, role, screen ID and name, local time with timezone, and the request ID (only on error screens). |
| Never included | Names of clients, health data, food or weight values, notes, tokens or the user's password. The user ID is a short hash only. |

**Implementation:**
- Shared builder `packages/core/src/support.ts` → `buildSupportMailto({app, version, platform, role, screenId, requestId?})`. Encode with `encodeURIComponent` per RFC 6068 [R83] and keep the URL under about 1,800 characters.
- Web opens it with `window.location.href`. Mobile uses `Linking.openURL`, getting the version from `expo-application` [R85].
- **No mail app:** if `Linking.canOpenURL` returns false, show a sheet with the address `tech@thefitbud.com` and **Copy address** and **Copy details** buttons.

**Reply promise (D33, OQ-29).** One line sits under every Help entry, in FitBud's voice (we, warm and short). Option A is the default. The trainer UI stays English. Hinglish is for the trainee app when `hi-Latn` ships.

| Option | English (en-IN) | Hinglish (hi-Latn) |
|---|---|---|
| **A (default)** | "We'll get back to you within a day." | "Hum ek din ke andar aapko reply karenge." |
| B | "Write to us anytime. We reply within a day." | "Kabhi bhi likhiye. Hum ek din mein jawab dete hain." |
| C | "Stuck? Email us and we'll get back to you within a day." | "Kahin atak gaye? Email kariye, hum ek din ke andar reply karenge." |

- The internal target is one working day for the `tech@thefitbud.com` inbox.
- Don't show a time ("within 24 hours") or a staff name.
- The line also appears on the no-mail-app sheet.

### 1.6.11 Feature flags and system email (D17, D18, D30)

FitBud has two **server-side** flags: KV or D1 config, read at send time and exposed to the clients through `GET /config` (API-NEW: `{flags:{wa_otp:boolean, wa_automation:boolean}, supportEmail}`). Clients cache the config for 1 h and refresh on foreground. **Both flags are off.**

| Flag | Off (today) | On (later) | Turn-on prerequisites |
|---|---|---|---|
| `wa_otp` | Codes go **by email only**. Sign-in, forgot-password and invite screens show a disabled option, **"WhatsApp · Coming soon"**, with the note: "Codes on WhatsApp are coming soon. For now we'll email your code; check spam if you don't see it." | Codes go to WhatsApp and email at once (§3.1a) | A business SIM and number registered on the Cloud API, a verified WhatsApp Business account, the approved `fitbud_otp` authentication template (§4.6) and the budget guard live |
| `wa_automation` | **No FitBud-sent WhatsApp.** Reminders are push and inbox only. No opt-in is collected. Every WhatsApp reminder setting shows **"Coming soon"** (TR-05, TR-16, TW-11, TW-31), with the note: "WhatsApp reminders are coming soon. For now we'll remind you in the app." | W-FB, W-PLAN, W-CHK and W-RENEW per §4.2, subject to opt-in, the daily cap and the budget (§4.5) | Everything `wa_otp` needs, plus the utility templates **approved** in the registry, the webhook endpoint verified, and the admin alert recipients set |

**Rules:**
- The code paths ship and are tested with the flags in both states (unit tests, plus a Cloud API sandbox or mock in CI). With a flag off, the send functions return `{skipped:'flag_off'}` before reserving any budget.
- A flag turns on only when every template that path uses is **Approved** (§4.6). The server refuses to send an unapproved template even with the flag on.
- A third, client-side flag, `steps_enabled`, defaults off and is turned on only if the TR-25 spike is Go (D35).
- `wa.me` links (trainee asks, trainer invites, re-engagement, follow-ups) **don't depend on any flag**. They're always live (D31).

**System email (D30):** the provider is set by config (`EMAIL_PROVIDER`, OQ-32). The sender is `SYSTEM_EMAIL_FROM` (default `FitBud <tech@thefitbud.com>`), the reply-to is `SYSTEM_EMAIL_REPLY_TO` (default the same), and the alert recipients are `ADMIN_ALERT_EMAILS` (default `tech@thefitbud.com`).

| Email | Trigger | Subject (en-IN) |
|---|---|---|
| E-OTP | Code sign-in, forgot password, invite verification | "Your FitBud code: 482913" |
| E-INV | The trainer chooses **Email invite** in TW-07, in addition to `wa.me` and Copy link | "Rahul invited you to coaching on FitBud" |
| E-PWD | Password changed | "Your FitBud password was changed" |
| E-ALERT | Admin alerts (WhatsApp budget, reconciliation, template rejected) | "FitBud alert: WhatsApp spend at 80%" |
<!-- END VERBATIM foundations -->

---

## Implementation notes (repo facts at `cursor/stage1-foundation-a3da` @ `7f74108`, checked 18 Oct 2026; NOT part of the guide)

**Tokens**
- Source of truth: `packages/tokens/src/tokens.ts`, which exports `brand`, `ink`, `surface`, `semantic`, `rings`, `spacing`, `radii`, `fontFamily` and `tagline` ("Progress, guided."). `packages/tokens/scripts/build-css.ts` generates `packages/tokens/src/tokens.css` ("run pnpm build in @fitbud/tokens"). Contrast tests: `packages/tokens/src/contrast.test.ts`.
- Web: `apps/trainer-web/src/styles.css` (1,374 lines) does `@import "@fitbud/tokens/tokens.css"` on line 3. Page CSS lives in `apps/trainer-web/src/styles/{home,clients,workspace,plan,templates}.css`. `tokens.css` also defines **legacy aliases** (`--deep-navy`, `--coral`, `--warning`…), which old pages still use.
- Web radius: `styles.css:8` sets `--radius: 20px` for cards, but the guide and `radii.webCard` say **16 px**.
- Mobile: `packages/ui-mobile/src/theme.ts` re-exports the tokens as `colors`, `semanticColors`, `radii` (card 20, control 16, pill 999), `spacing` and `ringColors`. `touchTargetMin = 44` (guide: **48 dp**).

**Known token bugs (from USAGE.md):** `packages/tokens/src/tokens.ts` has `brand.deepNavy = "#1A1249"` and `brand.coral = "#FF5B7D"`, so `tokens.css` has `--brand-deep-navy: #1A1249` and `--brand-coral: #FF5B7D`. Both are off by one from the guide and the logo (`#1A1248` / `#FF587D`). Rings inherit the bug (`--ring-protein: #1A1249`). Fix them in `tokens.ts`, regenerate `tokens.css`, and update the contrast test.

**Typography / Satoshi**
- Web: Satoshi 400/500/600/700 loads from Fontshare **twice**, in `apps/trainer-web/index.html:13` and in `styles.css:1`. Keep one. The stack is `--font-family: Satoshi, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif`.
- Mobile: Satoshi **is** loaded now (the guide's "Mobile doesn't load Satoshi yet" is stale). `apps/mobile/src/providers/FontsProvider.tsx` loads `Satoshi-400/500/700.ttf` from `apps/mobile/assets/fonts/satoshi/` through `expo-font`, and injects the Fontshare CSS on web. **There's no 600 weight on native**, yet 88 places use `fontWeight: "600"`. `packages/ui-mobile/src/typography.ts` maps `fontFamily`/`Medium`/`Bold` per platform. Its `typeScale.body` is **15** (guide: mobile body 16, never below 16) and `display` is 30 (guide: 28).

**Buttons**
- `packages/ui-mobile` has **no Button component**. It only exports theme, typography, `NutritionRings`, `DateNavigator` and `WeeklyConsistency`, plus a placeholder `ScreenProps`.
- Mobile buttons: `apps/mobile/src/components/PrimaryButton.tsx`, with `variant: "primary" | "secondary" | "ghost"`. Primary is an indigo fill. Secondary is a paleLavender fill with an indigo border, which doesn't match the guide's neutral WhatsApp secondary (white with an `ink.200` border). There's **no tertiary or destructive variant** and no ⋯ overflow component. `minHeight` is 44.
- Web buttons: CSS classes `.button-primary`, `.button-secondary`, `.button-ghost` and `.button-link` in `styles.css:363–447`. There's no React Button component, no destructive class (guide: `#B91C1C` with white text) and no shared overflow menu.

**Status chips**
- Mobile: `apps/mobile/src/components/StatusChip.tsx` is tone-only (`neutral|positive|attention|warning`) with **no icon**, and its `attention` tone uses **paleLavender**. The guide says attention is `#FFFBEB`/`#B45309`, and lavender is for brand-selected only.
- Web: `apps/trainer-web/src/components/StatusBadge.tsx` handles onboarding status only, with a dot (no icon).
- **No icon library is installed** (no `lucide-react` or `lucide-react-native`). `AppShell.tsx` uses inline SVG icon components.

**Labels and formatting**
- `packages/core/src/labels.ts` **doesn't exist**. Mobile `apps/mobile/src/trainer/labels.ts` has `statusLabel()` and `typeLabel()`, which only replace `_` with a space (so you get "overdue meal", lowercase), and `shortId()`, which renders `9035c4ad…` UUID fragments. Both are banned outputs.
- `packages/core/src/format.ts` contains only `formatTimeDiff`. Web has `apps/trainer-web/src/lib/format.ts` (`formatIsoDateTime`, `formatLocalDate`, `formatAgeMinutes`, `traineeTimeDiffLabel`) and mobile has `apps/mobile/src/lib/dates.ts`. Today's mobile header uses "Sunday, October 18" (US long format).
- `packages/core/src/exception.ts:140` builds the summary `Required meal still unlogged: ${mealName} (${localDate})`, so ISO dates reach the UI through `summary`.
- There's no `packages/copy` package yet (guide §1.6.9).

**Screen wrapper / pull-to-refresh (mobile)**
- `apps/mobile/src/components/Screen.tsx` already takes optional `refreshing`/`onRefresh` (a `RefreshControl`). But these screens still render a manual **"Refresh"** button: `trainee/ProgressTab.tsx:281`, `trainee/WorkoutTab.tsx:328`, `trainee/NotificationsScreen.tsx:148`, `trainer/AttentionTab.tsx:133`, `trainer/CheckinsTab.tsx:51`, `trainer/ClientsTab.tsx:135` and `trainer/ActivityFeedScreen.tsx:128`.

**Brand / logo**
- The Honest Week four-dot mark is `packages/brand/logo/mark.svg` (also `mark-white.svg` and `mark-dark.svg`): three filled `#1A1248` dots, then a `#FF587D` outlined ring. Mobile uses it as `apps/mobile/assets/brand-mark.png` through `components/BrandMark.tsx`. **Web doesn't use it:** `layout/AppShell.tsx:63–72` shows `/favicon-32.png` plus "FitBud Coach · Active Coaching" with a `live-dot`.

**Tests and capture**
- Web E2E: `apps/trainer-web/e2e/trainer-flows.spec.ts` (Playwright, `pnpm --filter trainer-web test:e2e`). RCA.md says these drive flows through API `fetch`, which is a presence check only. Don't count them as UI evidence.
- Web captures: `apps/trainer-web/scripts/capture-tw-screens.mjs` (render/uniqueness checks only; writes to `.captures/trainer-web` or `$CAPTURE_OUT`). Mobile captures: Expo web plus `apps/mobile/src/dev/captureBridge.ts` (see `/workspace/fitbud-mobile-shots/capture.mjs`).
