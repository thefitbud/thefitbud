# 05 · Notification specification

Copied **verbatim** from guide §4, lines 4194–4591. While `wa_automation` is off, every FitBud-sent WhatsApp message (W-*) is built but **never sent** (see 01-product-rules.md).

<!-- BEGIN VERBATIM notifications -->
# 4. Notification specification

**Conventions:**
- Copy uses `{coach}`, `{meal}`, `{workout}` and similar placeholders, resolved server-side in the recipient's locale.
- The payload is always the existing safe payload: `notificationId`, `notificationType`, `domainEntityType`, `domainEntityId`, `createdAt`. Health detail never goes in the payload. The title and body may name the meal label ("Lunch") but never foods, weights or photos.
- Lock-screen privacy: when "Hide details on lock screen" is on (OQ-22), the body becomes "You have something to log in FitBud."
- **Contract mapping:**

  | Guide id | Existing type |
  |---|---|
  | P-MEAL | `meal_reminder` |
  | P-WO | `workout_reminder` |
  | P-CHK, P-CHK-LATE | `checkin_reminder` |
  | P-EOD | `daily_summary` |
  | P-NUDGE | `activity_nudge` |
  | P-RENEW | `subscription_renewal_reminder` (trainer-side today; trainee-side is optional) |

  New types (API-CHG in `packages/contracts/src/notification.ts`): `plan_published`, `checkin_reviewed`, `coach_answered`, `reminders_paused`, `relationship_ended`, **`trainer_note_shared`** (P-NOTE, D20), **`reactivation_requested`** (P-REACT, D21), and the trainer types `trainer_ask_coach`, `trainer_checkin_submitted`, `trainer_intake_submitted`, `trainer_critical_digest`, `trainer_renewal`, **`trainer_meal_times_changed`** (T-MEALTIME, D24) and **`admin_whatsapp_budget`** (A-WABUDGET, D17).
  WhatsApp sends aren't notification-table pushes. They're logged in `whatsapp_messages` and the budget ledger (§4.5), linked to the notification that triggered them.
- **Android channels:** `meal`, `workout`, `checkin`, `summary`, `coach` (nudges, reviews, answers), `plan`, and `coach_alerts` (trainer).
- **Feature flags (§1.6.11):** every FitBud-started WhatsApp message is behind `wa_otp` (W-OTP) or `wa_automation` (all other W-* templates). **Both are off today.** While they're off, only push, the inbox, email and user-tapped `wa.me` links are used.
- **System emails** (E-OTP, E-INV, E-PWD, E-ALERT) are sent from `SYSTEM_EMAIL_FROM` (default `FitBud <tech@thefitbud.com>`, configurable, D30).
- **Action category ids** must not contain `:` or `-` (Expo constraint, [R61]). Use `meal_actions`, `workout_actions`, `checkin_actions`.

## 4.1 Trainee push notifications

#### P-MEAL

| Field | Spec |
|---|---|
| Trigger | Meal time passes: **the trainee's own meal time when set (TR-24, D24)**, otherwise the plan slot time |
| Condition (all pass) | Meal unlogged, meal rule on, category on, not quiet, under cap |
| Channel | Push (`meal`). WhatsApp **W-FB** fallback when push is unavailable or logging is inconsistent (§4.5). |
| Timing | meal time +40 min (30–45), in the trainee's timezone |
| Copy EN (title · body) | "Lunch isn't logged yet" · "Tap if you ate as planned. Changed something? Open to log it." |
| Hinglish sample | "Lunch log nahi hua" · "Plan ke hisaab se khaya? Ek tap mein log karo." |
| Actions | **Eaten as planned** (background, outbox) · **Snooze 30 min** (once) |
| Deep link | `/meal/:id` |
| Caps and opt-out | 1 per meal plus 1 after snooze. Merged within 30 min ("Lunch and Snack aren't logged yet"). Back-off applies. Category toggle in TR-16. |

#### P-WO

| Field | Spec |
|---|---|
| Trigger | Anchor +75 min |
| Condition (all pass) | Required workout today, not started or logged |
| Channel | Push (`workout`) |
| Timing | preferred, learned or 18:00 anchor, +75 min |
| Copy EN (title · body) | "Time for {workout}?" · "If you've already trained, log it in a tap. If today's not the day, that's okay too." |
| Hinglish sample | "{workout} ka time?" · "Workout ho gaya toh log kar lo. Aaj nahi ho paaya toh bhi theek hai." |
| Actions | **Start** · **Not today** (skip sheet) |
| Deep link | `/workout/:id` |
| Caps and opt-out | 1 a day. Folded into P-EOD if past 21:30. |

#### P-EOD

| Field | Spec |
|---|---|
| Trigger | `min(lastMeal+60, 21:30)` |
| Condition (all pass) | ≥1 required item unlogged |
| Channel | Push (`summary`) |
| Timing | once |
| Copy EN (title · body) | "2 things left today" · "Dinner and your workout. Log what you did, then rest easy." |
| Hinglish sample | "Aaj ke 2 kaam baaki" · "Dinner aur workout. Jo kiya woh log karo, phir aaram." |
| Actions | **Log now** |
| Deep link | `/today` |
| Caps and opt-out | 1 a day. None after 22:00. Nothing when complete. |

#### P-CHK

| Field | Spec |
|---|---|
| Trigger | Due date |
| Condition (all pass) | Not submitted |
| Channel | Push (`checkin`) |
| Timing | the due day at preferred time, or 18:00 |
| Copy EN (title · body) | "Weekly check-in is ready" · "About 3 minutes. {coach} will review it." |
| Hinglish sample | "Weekly check-in ready hai" · "Sirf 3 minute. {coach} review karenge." |
| Actions | **Start check-in** |
| Deep link | `/checkin/:id` |
| Caps and opt-out | 1. Defers through quiet hours. |

#### P-CHK-LATE

| Field | Spec |
|---|---|
| Trigger | Window end +12 h |
| Condition (all pass) | Still not submitted |
| Channel | Push (`checkin`) |
| Timing | inside 07:00–21:30 |
| Copy EN (title · body) | "Your check-in can still go in" · "Late is fine. {coach} would love the update." |
| Hinglish sample | "Check-in abhi bhi bhej sakte ho" · "Late chalega, {coach} ko update mil jayega." |
| Actions | **Start check-in** |
| Deep link | `/checkin/:id` |
| Caps and opt-out | 1, never repeated |

#### P-NUDGE

| Field | Spec |
|---|---|
| Trigger | Trainer taps Nudge |
| Condition (all pass) | Item unresolved, relationship active |
| Channel | Push (`coach`) |
| Timing | immediately, or 07:00 if quiet |
| Copy EN (title · body) | "{coach}: quick reminder about {item}" · "Log it when you can." |
| Hinglish sample | "{coach} ka reminder: {item}" · "Jab time mile, log kar dena." |
| Actions | **Open** (plus **Eaten as planned** for meals) |
| Deep link | the item |
| Caps and opt-out | 1 per item per 4 h. 3 per trainer per hour. Counts toward the daily cap at top priority. |

#### P-PLAN

| Field | Spec |
|---|---|
| Trigger | Plan published with Notify on |
| Condition (all pass) | Active |
| Channel | Push (`plan`) |
| Timing | immediately (defer through quiet hours) |
| Copy EN (title · body) | "Your plan is updated" · "{coach} made changes from {date}. See what's new." |
| Hinglish sample | "Aapka plan update hua" · "{date} se naye changes. Dekh lo kya badla." |
| Actions | **See changes** |
| Deep link | `/plan/diet` or `/workout` |
| Caps and opt-out | 1 a day (merge multiple) |

#### P-CHK-REV

| Field | Spec |
|---|---|
| Trigger | Trainer saves the review |
| Condition (all pass) | n/a |
| Channel | Push (`coach`) |
| Timing | immediately (defer) |
| Copy EN (title · body) | "{coach} reviewed your check-in" · "Tap to see." When a **visible** note is attached: "{coach} reviewed your check-in and left a note" (this replaces P-NOTE for that note, D20). |
| Hinglish sample | "{coach} ne check-in dekh liya" · "Unka note dekho." |
| Actions | **See review** |
| Deep link | `/checkin/:id` |
| Caps and opt-out | Merged with other coach events within 30 min |

#### I-ANS

| Field | Spec |
|---|---|
| Trigger | Ask marked answered |
| Condition (all pass) | n/a |
| Channel | **Inbox only** by default |
| Timing | n/a |
| Copy EN (title · body) | "{coach} answered your question about {item}" |
| Hinglish sample | "{coach} ne {item} wale sawaal ka jawab diya" |
| Actions | n/a |
| Deep link | the item |
| Caps and opt-out | No push unless the coach-category push is on and the cap allows |

#### P-PAUSE

| Field | Spec |
|---|---|
| Trigger | Back-off pause starts |
| Condition (all pass) | n/a |
| Channel | Inbox, plus a Today card (no push) |
| Timing | n/a |
| Copy EN (title · body) | "Meal reminders paused for a week" · "They didn't seem to help. Turn them back on anytime." |
| Hinglish sample | "Meal reminders ek hafte ke liye band" · "Chahiye toh wapas on kar lo." |
| Actions | **Turn back on** |
| Deep link | `/settings/reminders` |
| Caps and opt-out | n/a |

#### P-NOTE

| Field | Spec |
|---|---|
| Trigger | The trainer saves a note with **Visible to client** on (TW-34), outside a check-in review |
| Condition (all pass) | Relationship active, the note is still visible at send time, coach category on |
| Channel | Push (`coach`) plus inbox, and the note appears on Today ("From your coach") |
| Timing | immediately (defer through quiet hours). Several notes within 15 min merge. |
| Copy EN (title · body) | "{coach} has a note for you!" · "Tap to read." (The note text is never shown on the lock screen.) Merged: "{coach} left 2 notes for you" |
| Hinglish sample | "{coach} ka aapke liye ek note hai!" · "Padhne ke liye tap karo." |
| Actions | **Read** |
| Deep link | `/today?note=:id` (`/go/note/:id`) |
| Caps and opt-out | Max 2 a day. Counts as informational in the cap priority. Editing or re-sharing within 24 h doesn't push again. |

#### P-REACT

| Field | Spec |
|---|---|
| Trigger | The trainer sends a reactivation request (TW-30) |
| Condition (all pass) | The request is pending, and the relationship is ended |
| Channel | Push (`coach`) plus inbox |
| Timing | immediately (defer) |
| Copy EN (title · body) | "{coach} wants to restart coaching with you" · "Tap to review." |
| Hinglish sample | "{coach} aapke saath coaching phir shuru karna chahte hain" · "Dekhne ke liye tap karo." |
| Actions | **Review** |
| Deep link | `/go/reactivate/:requestId` |
| Caps and opt-out | 1 per request. A reminder after 3 days, inbox only. |

#### P-END

| Field | Spec |
|---|---|
| Trigger | Relationship ended |
| Condition (all pass) | n/a |
| Channel | Push (`coach`) |
| Timing | immediately (defer) |
| Copy EN (title · body) | "Coaching with {coach} has ended" · "Your history stays in FitBud." |
| Hinglish sample | "{coach} ke saath coaching khatam" · "Aapki history FitBud mein safe hai." |
| Actions | **Open** |
| Deep link | `/today` |
| Caps and opt-out | 1 |


**Notification actions (Expo):**
- `meal_actions`: `eaten_as_planned` (opensAppToForeground false) and `snooze_30` (false).
- `workout_actions`: `start` (true) and `not_today` (true).
- `checkin_actions`: `start` (true).
- Background actions write to the SQLite outbox and request a background sync. If the outbox can't be reached (the iOS app was killed), the action opens the app and completes the action on launch.

## 4.2 WhatsApp messages (D17)

FitBud uses the **Meta WhatsApp Cloud API** directly ([R93]), with no BSP, for messages FitBud starts. **This is fully built and switched off** (`wa_otp` and `wa_automation`, §1.6.11), because there's no business SIM or WhatsApp Business account yet. Everything a person sends from their own WhatsApp stays a free `wa.me` link, which works today regardless of the flags.

**FitBud never sends a message on anyone's behalf (D31).** Part A messages are prefilled; the person reviews them and presses Send in their own WhatsApp. They're text only, with no voice notes. Trainer prefills are **trainer-signed text**: written as the trainer and editable before sending. Part B messages are always signed as FitBud.

**A. Person-sent, via `wa.me` (free, no template, no FitBud cost):**

| ID | Trigger | Sender | Template EN | Hinglish sample | Link |
|---|---|---|---|---|---|
| **W-INV** | Invite created | Trainer taps, then presses Send | "Hi {name}, I've set up your coaching on FitBud. Join here: {inviteUrl}" | "Hi {name}, maine FitBud pe aapki coaching set ki hai. Yahan join karo: {inviteUrl}" | invite |
| **W-INV-R** | Remind on a pending invite | Trainer taps | "Hi {name}, just a reminder to join FitBud so we can start: {inviteUrl}" | "Hi {name}, FitBud join kar lo taaki shuru karein: {inviteUrl}" | invite |
| **W-RE-M** | Home Re-engage, day 3 (**the only re-engagement message**, D10 and D31) | Trainer taps, edits if they like, then presses Send | "Hi {name}, haven't seen your logs for a couple of days. All okay? Pick up with today's plan whenever you're ready: {todayLink}" | "Hi {name}, 2 din se logs nahi dikhe. Sab theek? Jab ready ho, aaj ke plan se shuru karo: {todayLink}" | `/go/today` |
| **W-ASK** | Trainee asks about an item (TR-18) | Trainee taps | "Hi {coach}, question about my {item} ({date}): {topic}. {link}" | (same, short) | the item |

**B. FitBud-started, via the Cloud API (paid, Meta-approved templates from the registry §4.6, budget-guarded §4.5, built and flag-gated):**

| ID | Flag | Meta category | Trigger and eligibility | Timing | Template EN (variables in braces) | Button | Caps |
|---|---|---|---|---|---|---|---|
| **W-OTP** | `wa_otp` | **Authentication** (≈ ₹0.136) | Code sign-in, forgot password, or invite verification (§3.1a) | Immediately | Meta's fixed authentication text: "{code} is your verification code. For your security, do not share this code. This code expires in 10 minutes." [R79] | **Copy code** (the only button allowed, because Meta requires it) | Rate limits in §3.1a. Exempt from the daily cap. Blocked at the hard cap (email still goes). |
| **W-FB** | `wa_automation` | **Utility** (≈ ₹0.136) | A required item is unlogged **and** (push unavailable: permission off, no valid token, or 2 failed deliveries) **or** (inconsistent logging: the ignorer state, or < 50% of required items logged in 7 days), **and** opted in | Push time + 60 min (or the push time when push is unavailable), never in quiet hours or after 22:00 | "Your {item} for {date} is not logged yet in FitBud. Open: {link}" | None | **1 a day** across all W-* utility messages. The most important item only. |
| **W-CHK** | `wa_automation` | **Utility** | Check-in due, push unopened by 18:00, opted in, **normal mode** | 18:00–20:00 | "Your weekly check-in for {coach} is due on {date}. Open: {link}" | None | Within the daily cap |
| **W-PLAN** | `wa_automation` | **Utility** | A new plan version was published for an opted-in trainee and P-PLAN went unopened for 2 h, **normal mode** | Next allowed hour | "{coach} published your updated plan, starting {date}. Open: {link}" | None | Within the daily cap. At most 1 per plan version. |
| **W-RENEW** | `wa_automation` | **Utility** | The coaching end or renewal date is 3 days away, or today, for an opted-in trainee, **normal mode** | 10:00 | "Your coaching with {coach} is scheduled to end on {date}. Details: {link}" (informational only: no price, offer or call to renew) | None | Within the daily cap. At most 2 per period. |

**There's no automated re-engagement template.** The earlier W-RE is removed. Day-3 re-engagement is only the trainer-signed W-RE-M prefill (D31). That also closes OQ-27.

**Template rules (Q27: strictly utility):**
- **No buttons and no calls to action** on utility templates: no URL buttons and no quick replies. The deep link appears as plain text in the body. The only button anywhere is the authentication **Copy code** that Meta requires.
- Every utility body states a fact about **something the user already has**: a specific item, date, check-in, plan version or coaching period. There's no persuasive framing.
- Templates are submitted in English (`en`). Hinglish copy is used only in `wa.me` links, because a Hinglish template would need a separate approval.
- Every reminder template's footer reads "Reply STOP to stop WhatsApp reminders." ([R44] [R45]).
- The link is always the https `/go/` link (D3).
- Every template is **pre-approved by Meta** and tracked in the registry (§4.6). The server refuses to send a template that isn't `approved`.
- The copy lint and the review checklist are in §4.6. Utility templates that read as promotional may be recategorised as marketing [R92] [R100].

**Inbound handling (the webhook):**
- **STOP**, "stop", "unsubscribe" or "band karo" set `whatsappOptIn.granted=false` immediately. FitBud replies once with a free-form service message: "You won't get WhatsApp reminders from FitBud anymore. Turn them back on in the app anytime."
- **Any other inbound message** gets a single auto-reply per 24 h (a free service message): "This number only sends FitBud reminders and codes. To talk to {coach}, message them here: {coachWaMe}." No inbound content is stored beyond the 24 h dedupe key (decision F).
- Delivery statuses (sent, delivered, read, failed) and the `pricing` object (billable, category) update `whatsapp_messages` and the ledger (§4.5).
- An "Invalid WhatsApp user" style error marks the number `whatsappUnreachable`, so W-* stops and OTPs go by email only.

## 4.3 Trainer notifications (web bell and trainer mobile push)

| ID | Trigger | Copy EN | Deep link | Caps |
|---|---|---|---|---|
| **T-ASK** | Trainee creates an ask | "{client} asked about {item}" | `/?ask=:id` (TM: `/coach/ask/:id`) | Merged per 15 min ("3 clients asked you on WhatsApp") |
| **T-CHK** | Check-in submitted | "{client} sent their check-in" | `/clients/:rid/check-ins/:id` | Merged per 15 min |
| **T-INTAKE** | Intake submitted | "{client} finished their intake" | `/clients/:rid/onboarding` | n/a |
| **T-CRIT** | New Critical exception(s) | "2 clients need attention" | `/` | At most 1 an hour, in trainer quiet hours |
| **T-RENEW** | Renewal enters due or expired | "{client}'s coaching renews today" | `/clients/:rid/configure` | Once per state change |
| **T-DIGEST** (P2) | 08:00 local | "Today: 4 need attention, 2 check-ins to review" | `/` | 1 a day, opt-in |
| **T-MEALTIME** | Trainee changes meal times (TR-24, D24) | "{client} changed her meal times · Lunch 1:30 → 2:30 pm" | `/clients/:rid/plan` (TM: `/coach/activity?rid=`) | Merged per 15 min. Also an activity entry (TW-17, TM-09). |
| **T-NOTE-SEEN** (bell only, P2) | The client opens a visible note | "{client} read your note" | `/clients/:rid` | Bell only, no push |
| **A-WABUDGET** (admins) | The WhatsApp spend crosses a threshold (§4.5) | "WhatsApp spend: ₹402 of ₹500 this month (80%)" / "WhatsApp paused: hard cap ₹1,000 reached" | admin email plus bell | Once per threshold per month |

## 4.4 Opt-out matrix

| Control | Owner | Effect |
|---|---|---|
| OS notification permission | Trainee | All pushes stop. The engine marks "Notifications off" for the trainer. |
| Category switches (TR-16) | Trainee | The category stops. Nudges for that category also stop (nudges respect client preferences). |
| Quiet hours (TR-17) | Trainee | Expire or defer, per type |
| Reminder rules per client (TW-11) | Trainer | Automatic reminders for that category stop. Nudges remain possible. |
| **`wa_otp` flag off (today)** | System (§1.6.11) | No W-OTP. Codes go by email only. The UI shows WhatsApp as disabled "Coming soon". |
| **`wa_automation` flag off (today)** | System (§1.6.11) | No W-FB, W-CHK, W-PLAN or W-RENEW. No opt-in is collected (TR-05 and TR-16 show "Coming soon"). Reminders are push and inbox only. `wa.me` links still work. |
| WhatsApp opt-in (TR-05, TR-16) | Trainee | W-FB, W-CHK, W-PLAN and W-RENEW stop. `wa.me` chats are ordinary WhatsApp, outside FitBud. W-OTP is sent only when the user requests a code. |
| Reply **STOP** on WhatsApp | Trainee | The same as turning the opt-in off, immediately. A confirmation is sent once (a free service message). |
| WhatsApp budget soft mode (spend ≥ ₹500) | System (§4.5) | W-CHK, W-PLAN and W-RENEW pause. W-FB is limited to required items. W-OTP continues. |
| WhatsApp hard cap (spend ≥ ₹1,000) | System (§4.5) | **No FitBud-started WhatsApp** until the 1st of next month. Reminders are push-only. OTPs go by email only. Admins are alerted, and trainers see "paused" in TW-31. |
| Meal times (TR-24) | Trainee | P-MEAL and W-FB follow the trainee's times. |
| Note visibility (TW-34) | Trainer | Only visible notes reach the trainee (P-NOTE). Making a note private removes it, with no notification. |
| Back-off | System | Visible to both. The trainee can override it. |
| Relationship ended | Trainer | Everything stops except P-END. |

## 4.5 WhatsApp budget, cap enforcement and alerts (D17)

**Flag note:** all of this section is built and tested now but inert while `wa_otp` and `wa_automation` are off. A flag-off send returns `{skipped: 'flag_off'}` **before** any reservation, so no ledger rows are written. Budget alerts (A-WABUDGET) go to `ADMIN_ALERT_EMAILS` (default `tech@thefitbud.com`, configurable, OQ-28 decided) from `SYSTEM_EMAIL_FROM`.

**Budget:** ₹500 a month for the first 50 trainers, with a **hard cap of ₹1,000**. Both are config values (`WA_MONTHLY_BUDGET_INR`, `WA_HARD_CAP_INR`), changed without a deploy. The month is a calendar month in IST and resets at 00:00 IST on the 1st.

**Rate card (config, India, from 1 Oct 2026):**

| Category | Meta rate | With 18% GST | Used by |
|---|---|---|---|
| Authentication | ₹0.115 | **₹0.1357** | W-OTP |
| Utility | ₹0.115 | **₹0.1357** | W-FB, W-CHK, W-PLAN, W-RENEW |
| Marketing | ₹0.8631 | ₹1.0185 | not used (only if Meta reclassifies a template) |
| Service (free-form replies) | free (1,000 a month per number) | n/a | STOP confirmation, auto-reply |

Sources: Meta pricing [R77] and the 1 Oct 2026 India coverage [R78]. **Utility templates are now billed even inside an open 24-hour window**, so every W-* reminder is assumed billable. Store the rates in paise in config and update them from Meta's rate card each quarter.

**What the budget buys** (planning numbers):

| Budget level | Messages at ₹0.1357 | Example for 50 trainers × 15 clients = 750 trainees |
|---|---|---|
| ₹500 | ≈ 3,680 a month | ≈ 120 WhatsApp reminders a day, i.e. about 16% of trainees getting one a day, plus about 100 OTPs a month |
| ₹1,000 | ≈ 7,370 a month | ≈ 245 a day |

With password as the default login, OTPs are expected to be a few percent of spend. Reminders to trainees with push off or inconsistent logging are the bulk of it.

**Budget modes:**

| Mode | Month-to-date spend (actual + reserved) | Allowed FitBud-started WhatsApp | Everything else |
|---|---|---|---|
| **Normal** | < ₹500 | W-OTP, W-FB, W-CHK, W-PLAN, W-RENEW | Unchanged |
| **Soft** | ₹500 – < ₹1,000 | W-OTP, plus W-FB for **required** items only | W-CHK, W-PLAN and W-RENEW fall back to push and inbox. The trainer's Home Re-engage (`wa.me`) is unaffected. |
| **Hard cap** | ≥ ₹1,000 | **None** | Reminders are push-only (inbox if push is unavailable). OTPs go **by email only**, and the sign-in UI says "Sent to your email". The TW-31 WhatsApp block shows "paused until 1 {month}". |

**Enforcement (the server, `apps/api/src/domain/whatsapp-budget.ts`):**
1. **Reserve before sending:** in one D1 transaction, read the month-to-date `SUM(cost_paise)` (actual plus reserved), check the mode for this kind, and insert a ledger row `reserved` with the estimated cost. If the check fails, nothing is sent and the caller falls back.
2. Send via Cloud API `POST /{phone-number-id}/messages` (a template message [R93]) and store the returned message id (`wamid`).
3. **Settle from the webhook:** the status webhook's `pricing` object (billable, category) sets the row to `billed` at the category's rate, or `not_billed` (cost 0). A failed send releases the reservation.
4. Reservations with no webhook after 24 h are kept as billed (conservative).
5. **Monthly reconciliation:** compare the ledger with WhatsApp Manager analytics or the invoice. Webhooks report the category, not the rupee amount. Differences above 5% raise an admin alert.

**Ledger table `whatsapp_ledger`:** id, month_key (YYYY-MM in IST), kind (`otp`, `fb`, `chk`, `plan`, `renew`), template_name, category, wamid, trainee_user_id nullable, relationship_id nullable, est_cost_paise, cost_paise, state (`reserved`, `billed`, `not_billed`, `failed`), created_at, settled_at.

**Alerts (A-WABUDGET):** sent to the admin recipients (`ADMIN_ALERT_EMAILS`, default `tech@thefitbud.com`, configurable list; OQ-28 decided 17 Oct) by email plus the admin bell, **once per threshold per month**:
- 50% of budget (₹250);
- 80% of budget (₹400);
- 100% of budget (₹500): "Soft mode on";
- 90% of the hard cap (₹900);
- 100% of the hard cap (₹1,000): "WhatsApp paused until the 1st".

There's also a daily spike alert when one day's spend is more than 3 times the 7-day average (possible abuse or a bug), and the OTP send rate is watched for abuse.

**Eligibility recap for reminder templates:** `wa_automation` on **and** the template `approved` in the registry **and** opted in (and not STOP, not `whatsappUnreachable`) **and** (push unavailable **or** inconsistent logging) **and** no W-* reminder today **and** the mode allows the kind **and** not in quiet hours or after 22:00 in the trainee's timezone.

**Admin view (P2):** a simple internal page or a weekly email with the month-to-date spend, the mode, messages by kind, and the delivered and read rates. Trainers never see rupee amounts.

**Acceptance criteria:**
- [ ] No W-* reminder is sent when the reservation would cross the mode limit, and the fallback is push.
- [ ] At ₹1,000, OTP emails still go and WhatsApp OTPs don't.
- [ ] Each threshold alert fires exactly once a month.
- [ ] The ledger settles from webhooks, and failed sends cost 0.
- [ ] Changing `WA_HARD_CAP_INR` in config takes effect without a deploy.
- [ ] STOP opts out within one webhook round trip.
- [ ] With either flag off, the matching send returns `skipped: flag_off`, writes no ledger row and uses the fallback.
- [ ] A template whose registry status isn't `approved` is refused even with the flag on.

## 4.6 WhatsApp template registry, approval and copy lint (D17)

Every Cloud API template must be **approved by Meta in advance**, and Meta can later pause or disable one for quality. FitBud keeps a registry so code only sends what's approved, and so copy changes go through review. It's built now (behind the flags) so the templates can be submitted the day the WhatsApp Business account exists.

**Table `whatsapp_templates`:**

| Column | Notes |
|---|---|
| `id`, `key` | `key` is the guide id: `W-OTP`, `W-FB`, `W-CHK`, `W-PLAN`, `W-RENEW` |
| `name` | The Meta template name, lowercase with underscores, versioned (for example `fitbud_item_not_logged_v1`) |
| `category` | `utility` or `authentication`. **Never `marketing`.** |
| `language` | `en` |
| `body`, `footer`, `variables` | `variables` is a JSON list of name and sample pairs, transactional facts only (`item`, `date`, `coach`, `link`) |
| `buttons` | Empty for utility. `copy_code` for authentication. |
| `version` | An integer. Editing an approved body creates a new version that must be approved again. |
| `status` | `draft` → `submitted` → `approved`, or `rejected`, `paused` or `disabled` |
| `meta_template_id`, `quality_rating`, `rejection_reason` | From Meta |
| `submitted_at`, `approved_at`, `last_synced_at`, `owner` | Audit |

**Status sync:** subscribe to the WhatsApp Business Account webhook's template status updates [R100] and update `status`, `quality_rating` and `rejection_reason`. Also run a daily reconcile job. A change to `paused`, `disabled` or `rejected` raises an E-ALERT email to `ADMIN_ALERT_EMAILS`, and sends of that key fall back immediately.

**Send-time rule:** `sendTemplate(key, …)` resolves the **latest `approved` version** for the key. If there's none, it returns `{skipped: 'template_not_approved'}`. The code never builds template text inline.

**Copy lint** (a unit test over the registry seed file, failing CI):
1. The category must be `utility` or `authentication`.
2. Banned words and phrases (case-insensitive): offer, discount, free, sale, deal, hurry, limited, exclusive, upgrade, buy, "don't miss", "we miss you", "come back", "last chance", "special".
3. No `!`, no emoji, no `%`, no prices or ₹ amounts, and no superlatives.
4. The body must contain at least one transactional variable (`{item}`, `{date}`, `{checkin}` or `{plan}`) and the `{link}` variable as plain text.
5. No buttons on utility templates.
6. Signed as FitBud: nothing written as the trainer ("I", "my plan for you"). The trainer is named only as `{coach}`.
7. The footer is exactly "Reply STOP to stop WhatsApp reminders."
8. The body is 160 characters or less, excluding variables.
9. The language is `en`.

**Review checklist** (before submitting to Meta, ticked in the PR):
- [ ] It's about one specific thing the user already has or agreed to (an item, check-in, plan or coaching period).
- [ ] It reads as a notice, not a nudge to buy, return or upgrade.
- [ ] Variables carry facts only. No free text from trainers goes into templates.
- [ ] The sample values contain no personal health detail (decision F).
- [ ] The lint passes, and the registry row is `draft` with an owner.
- [ ] After approval, the registry shows `approved` before the flag is turned on.
<!-- END VERBATIM notifications -->
