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
