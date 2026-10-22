# Local testing guide

How to run FitBud locally and walk through every MVP workflow using the seeded demo data. Setup commands live in the root [README.md](../README.md).

## Quick start

1. Install prerequisites (Node **22.23+**, pnpm **9.15.4**, Git).
2. From the repo root: `pnpm install`, `pnpm setup:local`, `pnpm db:reset`.
3. Terminal A: `pnpm api` (listens on **8787**, bound to `0.0.0.0` for LAN).
4. Terminal B: `pnpm web` (trainer web on `http://127.0.0.1:5173` by default).
5. Terminal C: `pnpm --filter @fitbud/mobile exec expo start` (Expo Go) or `pnpm mobile` (dev client).
6. Sign in on web or mobile with any demo account below (password **`FitBud-demo-2026`**).

Pending invite for accept-flow testing:

- **Token:** `fitbud-demo-anita-invite-pending`
- **Email:** `anita.invite@demo.fitbud.test`

## Demo accounts

All passwords are **`FitBud-demo-2026`**. Emails are `@demo.fitbud.test`.

| Email | Role | Persona state | Use for |
|-------|------|---------------|---------|
| `rahul.coach@demo.fitbud.test` | Trainer | `main_trainer` | Primary coach: home, clients, onboarding review, plans, attention, templates |
| `priya.coach@demo.fitbud.test` | Trainer | `second_trainer` | Second coach roster (Lakshmi, Karan) |
| `anita.invite@demo.fitbud.test` | Invite (not yet a user) | `invite_pending` | Invitation accept → verify → password → intake |
| `vikram.onboarding@demo.fitbud.test` | Trainee | `onboarding_incomplete` | Partial intake, resume onboarding |
| `sneha.review@demo.fitbud.test` | Trainee | `awaiting_review` | Submitted intake waiting for trainer review |
| `aarav.ontrack@demo.fitbud.test` | Trainee | `active_on_track` | Healthy active coaching, logging, check-ins |
| `rohan.slipping@demo.fitbud.test` | Trainee | `slipping` | Needs Attention — slipping adherence |
| `meera.ack@demo.fitbud.test` | Trainee | `acknowledged` | Attention item already acknowledged by trainer |
| `farhan.paused@demo.fitbud.test` | Trainee | `reminders_paused` | Reminders / quiet-hours style paused state |
| `ishita.pushoff@demo.fitbud.test` | Trainee | `notifications_off` | Push disabled trainee |
| `kavya.ended@demo.fitbud.test` | Trainee | `ended` | Ended coaching relationship |
| `nikhil.reactivate@demo.fitbud.test` | Trainee | `reactivation_pending` | Reactivation request in flight |
| `deepak.dubai@demo.fitbud.test` | Trainee | `dubai_meal_times` | Cross-timezone meal-time display vs trainer |
| `lakshmi.foods@demo.fitbud.test` | Trainee | `food_deviations` | Meal logging and “what did you have instead?” from library |
| `karan.dual@demo.fitbud.test` | Trainee (+ trainer) | `dual_role` | Same person coaches and is coached — role picker |
| `nova.coach@demo.fitbud.test` | Trainer | `first_run` | Brand-new trainer: empty roster, no templates or forms (first-run states) |
| `siddharth.yearly@demo.fitbud.test` | Trainee | `maintenance_yearly` | Yearly plan, 8 months of history, prediabetes goal |
| `ananya.newbie@demo.fitbud.test` | Trainee | `honeymoon_beginner` | 5-week beginner, renewal upcoming, open form question |
| `imran.nightshift@demo.fitbud.test` | Trainee | `reactivated_shift` | Paused for ~5 weeks then reactivated (same relationship, history notes); night-shift meal times |
| `pooja.silent@demo.fitbud.test` | Trainee | `silent_lapsed` | Stopped logging: no recent data, overdue check-in, expired renewal |
| `rajesh.senior@demo.fitbud.test` | Trainee | `senior_maintenance` | 61-year-old, knee-friendly plan, open pain ask |
| `fatima.london@demo.fitbud.test` | Trainee | `london_timezone` | Europe/London client: cross-timezone windows |
| `harpreet.ready@demo.fitbud.test` | Trainee | `coaching_ready` | Approved intake, no plan published yet |
| `divya.wedding@demo.fitbud.test` | Trainee | `deadline_wedding` | Deadline goal, festival ask, renewal upcoming |

## Realistic demo world

`pnpm db:reset` (or `pnpm db:seed:local` on an already-migrated DB) builds a deterministic world from [docs/seed/SEED_DESIGN.md](seed/SEED_DESIGN.md). Dates are relative to the reset day in IST, so data is always "fresh"; the same day gives byte-identical SQL. Both commands work from the repo root on Windows PowerShell and Linux/macOS.

- Up to 8 months of history per client: plan versions, subscriptions/renewals, meal and workout logs (sets, loads), weekly/bi-weekly/monthly check-ins with reviews, weigh-ins, trainer notes, coach asks, reminders.
- Every exception the API would detect in its 3-day lookback is pre-seeded, so opening the app creates none.
- Progress photos are intentionally empty (no media assets).
- Original account ids, emails and the password are unchanged.

| Persona | Coach | City | Goal | Tenure | Plan history (workout + diet) |
|---|---|---|---|---|---|
| Aarav Shah | Rahul | Ahmedabad | Lean bulk | 22 wk | W01+N05 → W03+N05 → W02+N05 |
| Rohan Mehta | Rahul | Delhi | Lose 6 kg | 14 wk | W02+N06 |
| Meera Iyer | Rahul | Chennai | PCOS-friendly fat loss | 26 wk | W05+N02 → W01+N02 |
| Farhan Qureshi | Rahul | Bengaluru | Maintain muscle while traveling | 30 wk | W06+N09 |
| Ishita Banerjee | Rahul | Kolkata | Rebuild morning routine | 10 wk | W05+N10 → W01+N10 |
| Kavya Menon | Rahul (ended) | Kochi | Postpartum strength return | 17 wk | W07+N07 |
| Nikhil Kapoor | Rahul (ended) | Gurugram | Restart after travel break | 19 wk | W02+N06 |
| Deepak Nair | Rahul | Dubai | Lose 8 kg | 13 wk | W02+N07 |
| Arjun Kapoor | Rahul | Chandigarh | Build strength | 20 wk | W04+N06 |
| Neha Reddy | Rahul | Hyderabad | Lose 4 kg | 7 wk | W05+N01 |
| Tanvi | Rahul | Jaipur | Stay consistent | 12 wk | W10+N03 |
| Siddharth Jain | Rahul | Indore | Reverse prediabetes | 34 wk | W08+N03 → W01+N03 |
| Ananya Bose | Rahul | Bengaluru | First pull-up | 5 wk | W11+N04 |
| Imran Sheikh | Rahul | Lucknow | Lose 8 kg | 19 wk (with pause) | W10+N06 |
| Pooja Agarwal | Rahul | Noida | Lose post-pregnancy weight | 9 wk | W05+N01 |
| Rajesh Pillai | Rahul | Thiruvananthapuram | Mobility + BP control | 28 wk | W08+N07 |
| Fatima Khan | Rahul | London | Glute & strength focus | 15 wk | W09+N09 |
| Harpreet Singh | Rahul | Ludhiana | Strength + 1.6 km under 6 min | 4 days | — (coaching ready) |
| Divya Nair | Rahul | Mumbai | Lose 5 kg before wedding | 10 wk | W02+N04 → W05+N04 |
| Lakshmi | Priya | Coimbatore | Stabilize weekday meals | 11 wk | W01+N02 |
| Karan | Priya | Mumbai | Coach + train dual role | 9 wk | W02+N07 |

Within the latest 28 days the original personas keep their fixed E2E fixtures (standard plan, Mon/Tue/Thu/Sat); deep history is added before that window.

### Trainer templates and forms

Rahul owns the library below (plus the two legacy E2E templates *Demo strength block* / *Demo Indian meals*); Priya has identical copies; Nova has none.

| Code | Workout template | Code | Diet template |
|---|---|---|---|
| W01 | Beginner Full Body · Gym · 3x (A/B) | N01 | North Indian Veg · Fat Loss |
| W02 | Upper/Lower Hypertrophy · 4x | N02 | South Indian Veg · PCOS-friendly |
| W03 | Push/Pull/Legs · 6x (lean bulk) | N03 | Jain Veg · Metabolic Health |
| W04 | Strength Block · 4x (SBD + OHP) | N04 | Eggetarian · High Protein |
| W05 | Home Dumbbell Fat-Loss · 4x | N05 | Eggetarian Gujarati · Lean Bulk |
| W06 | Hotel Gym Express · 3x 35 min | N06 | North Indian Non-veg · Fat Loss |
| W07 | Postpartum Return to Strength · 3x | N07 | Kerala Non-veg · Fish & Rice |
| W08 | Active Ageing · Knee-friendly · 3x | N08 | Veg (no eggs) · High Protein Bulk |
| W09 | Glute & Lower Focus · 4x | N09 | Travel & Eating-out · Non-veg |
| W10 | Duty-Day Express · 25 min · 3x | N10 | Bengali Fish · Balanced |
| W11 | First Pull-up Program · 3x | N11 | Navratri / Vrat Day |
| W12 | Police Fitness Prep · Strength + Run · 4x | | |

Forms: onboarding **FitBud Intake** (v1, v2) and **Quick intake — returning client**; check-in **Weekly coaching check-in** (v1, v2), **Strength check-in**, **Monthly maintenance review**.

### Seed commands

```sh
pnpm db:reset          # migrate + v2 library + demo world (~2.5 min on Linux)
pnpm db:seed:local     # re-seed demo world only (wipes app data, keeps library)
```

The seed runs locally only (`--remote` is refused). SQL is written to `apps/api/.wrangler/demo-seed.sql` (~37 MB).

## Workflow walkthroughs

### 1. Invite → accept → intake → trainer review → configure → publish plan

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Send / inspect invite | Trainer web | `rahul.coach@demo.fitbud.test` | **Clients** → find pending invite or use token flow docs | Pending invite for Anita visible |
| Accept invite | Mobile | Open invite deep link / token `fitbud-demo-anita-invite-pending` as new user | Complete verify (email OTP in dev mail sink), set password | Lands in trainee onboarding |
| Intake | Mobile | `anita.invite@…` or continue new user | Complete intake sections | Progress saved |
| Incomplete intake | Mobile | `vikram.onboarding@demo.fitbud.test` | Open app | Prompted to finish onboarding |
| Trainer review | Trainer web | `rahul.coach@demo.fitbud.test` | **Clients** → **Sneha** (`sneha.review@…`) → onboarding review | Submitted answers visible; approve or request changes |
| Configure coaching | Trainer web | `rahul.coach@demo.fitbud.test` | Client → **Configure coaching** | Targets, schedule, reminders (WhatsApp rows show Coming soon) |
| Publish plan | Trainer web | `rahul.coach@demo.fitbud.test` | Plan editor → publish | Trainee sees plan on mobile Today |

### 2. Daily trainee logging (meals, substitutions, workouts, late rules)

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Meals | Mobile | `aarav.ontrack@demo.fitbud.test` | **Today** → log prescribed meals | Compliance updates |
| “What did you have instead?” | Mobile | `lakshmi.foods@demo.fitbud.test` | Deviated meal → search library (e.g. chapati) | v2 library food attaches with nutrients |
| Workout | Mobile | `aarav.ontrack@demo.fitbud.test` | **Workout** → log sets / complete | Session saved; syncs when online |
| Late logging | Mobile | `rohan.slipping@demo.fitbud.test` | Log past-day meal/workout | Late rules applied per coaching config |

### 3. Check-in submit and trainer review

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Submit | Mobile | `aarav.ontrack@demo.fitbud.test` | **Check-in** → submit weekly form | Confirmation; trainer notified |
| Review | Trainer web or mobile trainer | `rahul.coach@demo.fitbud.test` | Open client check-in | Responses and trends visible |

### 4. Needs Attention — Acknowledge vs Resolve

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Slipping client | Trainer web | `rahul.coach@demo.fitbud.test` | **Home** → card for **Rohan** | Needs Attention reason shown |
| Acknowledge | Trainer web | `rahul.coach@demo.fitbud.test` | **Acknowledge** on Rohan’s card | State moves to acknowledged pattern |
| Already acked | Trainer web | `rahul.coach@demo.fitbud.test` | **Home** → **Meera** | Shows acknowledged / different actions |
| Resolve | Trainer web | `rahul.coach@demo.fitbud.test` | **Resolve** after follow-up | Item clears from active attention |

### 5. Client-visible notes

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Share note | Trainer web | `rahul.coach@demo.fitbud.test` | Client profile → add **client-visible** note | Saved |
| Read note | Mobile | matching trainee | **Today** or client notes area | Trainee sees trainer note |

### 6. Templates hub

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Browse | Trainer web | `rahul.coach@demo.fitbud.test` | **Templates** → filter global / mine | **10** global v2 templates + trainer copies |
| Apply workout template | Trainer web | `rahul.coach@demo.fitbud.test` | Client plan → apply from library | Exercises copied into plan (E2E covers this) |

### 7. Reminders and quiet hours (what is off)

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Paused reminders | Mobile | `farhan.paused@demo.fitbud.test` | **Settings** → notifications | Reminders paused / quiet behavior |
| Push off | Mobile | `ishita.pushoff@demo.fitbud.test` | Notification settings | Push disabled |
| WhatsApp automation | Any | — | WhatsApp reminder / OTP channels | **Coming soon** (`wa_automation` / `wa_otp` off) |

### 8. WhatsApp handoff (`wa.me` prefill — never auto-sent)

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Ask coach / invite | Mobile trainee or trainer | e.g. `aarav.ontrack@…` | Tap **Message on WhatsApp** / coach contact | Opens `wa.me` with **prefilled** text; user taps Send in WhatsApp |
| Verify | — | — | No FitBud-sent WhatsApp while `wa_automation` is false | No automated utility messages |

### 9. End coaching → reactivate

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Ended | Trainer web | `rahul.coach@demo.fitbud.test` | **Kavya** (`kavya.ended@…`) | Relationship ended; limited trainee access |
| End flow | Trainer web | `rahul.coach@demo.fitbud.test` | End coaching on an active client (E2E) | Status ended |
| Reactivate | Trainer web | `rahul.coach@demo.fitbud.test` | **Nikhil** (`nikhil.reactivate@…`) | Reactivation pending / approve |

### 10. Dual role

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Role picker | Mobile | `karan.dual@demo.fitbud.test` | Sign in → choose **Trainer** or **Trainee** | Different shells per role |
| Trainer quick | Mobile | Karan as trainer | **Attention** tab | Priya’s clients needing review |
| Trainee | Mobile | Karan as trainee | **Today** | Own coaching with Priya |

### 11. Offline sync states

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Go offline | Mobile | `aarav.ontrack@demo.fitbud.test` | Disable network → log meal | Queued locally |
| Reconnect | Mobile | same | Enable network | Sync completes; no duplicate logs (idempotent) |

### 12. Time-zone difference display

| Step | App | Account | Actions | Expected |
|------|-----|---------|---------|----------|
| Meal times | Mobile | `deepak.dubai@demo.fitbud.test` | **Today** meal schedule | Times reflect Dubai vs trainer timezone labeling |

## Email OTP codes (local)

1. Start API with `pnpm api`.
2. Trigger **Sign in with a code** or forgot-password on web or mobile.
3. Open **`GET http://127.0.0.1:8787/dev/mail`** in a browser (or curl).
4. Copy the 6-digit code from the latest message (subject like `Your FitBud code: …`).
5. WhatsApp OTP remains disabled with **Coming soon** copy.

## Intentionally disabled or “Coming soon”

Server flags from `GET /config` (all **false** locally):

| Flag | When false (today) |
|------|---------------------|
| `wa_otp` | OTP is **email only**; WhatsApp option disabled with “Coming soon” |
| `wa_automation` | No FitBud-sent WhatsApp; reminder settings show Coming soon |
| `steps_enabled` | No steps / HealthKit / Health Connect ingestion |

Also off: SMS OTP, in-app chat, automated WhatsApp utility sends, manual timezone edit (TR-20), HealthKit/Health Connect (TR-25).

## Known partial items (honest)

| ID | Gap |
|----|-----|
| TR-06 | Trainee Today rings show as a simple kcal line in the Expo web preview (native rings not yet checked on a real device) |
| TR-11 / TR-12 | Live workout extras (timers, superset UX) partial |
| TR-24 / TR-26 | Minor polish items in trainee flows |
| TR-20 | No manual timezone edit in settings |
| TR-25 | No HealthKit or Health Connect |
| TM-01 | Trainer mobile home intentionally **no KPI tiles** |

## Report bugs

Email **tech@thefitbud.com** with steps, account used, app (web/mobile), and screenshots if possible.
