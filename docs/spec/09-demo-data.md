# 09 · Demo data and how to reach each state

Sources: `fitbud-twcheck/checklist.md` (trainer web, verbatim tables below) and `fitbud-mobile-shots/index.md` (mobile). The seed is deterministic, so these IDs stay stable after `pnpm db:reset`.

**App:** http://localhost:5173 (Vite dev, proxies `/api/*` to API http://127.0.0.1:8787)
**Repo:** `/workspace/thefitbud-run`, branch `cursor/stage1-foundation-a3da` @ `7f74108`
**Source of truth:** `/workspace/fitbud-guide/parts/p01–p05.md` (TW-01…TW-34, plus TW-09a). Route→screen mapping is from `apps/trainer-web/src/App.tsx`, `TemplatesHub.tsx` and `apps/trainer-web/scripts/capture-tw-screens.mjs`.
**Default login:** `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026` (all demo passwords are the same). Desktop viewport: 1440×900, unless a check says otherwise.
**How to mark:** use PASS/FAIL per check ID, each with an evidence screenshot (see `README.md`). Do not use ✅/❌/⚠️ marks.

## Demo entity IDs (local D1, deterministic seed)

| Entity | ID |
|---|---|
| Rohan (slipping) relationship | `c422296e-ed7b-4196-a2b4-647096af3002` |
| Meera (acknowledged) relationship | `40248941-017c-48ea-b3df-7cc877c3533b` |
| Sneha (awaiting review) relationship | `6a68b615-c47c-4bfc-a7f8-550becf7878a` |
| Vikram (onboarding incomplete) relationship | `2fe7a6d8-4c61-443d-9614-18b4210186ee` |
| Aarav (on track) relationship | `30e514e1-e3f4-4dac-ae4b-5f45e72c3df6` |
| Deepak (Dubai) relationship | `f2a64fdb-96ad-46f3-a95e-99151b4a25f1` |
| Farhan (reminders paused) relationship | `778a793a-d04e-44bc-b7aa-187f70573275` |
| Ishita (push off) relationship | `0a72ab36-f042-46dc-bceb-67725d78b46a` |
| Kavya (ended) relationship | `b9f01670-8acc-45f6-adab-d7728bca88a6` |
| Nikhil (ended, reactivation) relationship | `8919b5c0-73fa-495a-958e-e9333a41f4e7` |
| Lakshmi (Priya's client, not Rahul's) | `66bb4846-308b-4bb1-9e3f-c41f234cbbdf` |
| Pending invitation (Anita) | `06b54e81-016c-4220-a9a8-31195324669b` (token `fitbud-demo-anita-invite-pending`) |
| Rohan active exception (missed workout, critical) | `95af751f-156c-44ac-a945-ec30870134ae` |
| Meera acknowledged exception ("Missed lunch") | `f588b76a-62a3-42bb-bf85-0570ea52c9eb` |
| Rohan resolved exception | `fa80cb4f-f852-403e-9c91-318a9944f238` |
| Rohan plan / effective version | plan `b93731fe-d057-43dd-9c60-e472837bb587`, version `04aa1ecd-1723-481c-8ed5-93cb97f8eca3` (no draft exists at seed time) |
| Rohan submitted check-in | `744e2975-255c-4469-9f9a-6da0a853c8f2` |
| Deepak submitted check-in | `85cce5da-c7be-4131-85c1-1a9ee6a34bd9` |
| Open coach ask (Ishita, portion size) | `b532e1ca-7fea-4563-8d50-4468bc66f586` |
| Workout template: "Demo strength block" (mine) / "Beginner home…" (base) | `cb44ac29-6ed6-45c7-a371-d56584df0650` / `e7cd8217-8045-5d9e-8d53-5501ea93c56a` |
| Diet template: "Demo Indian meals" (mine) / "South Indian vegetarian" (base) | `e1c7e062-9478-4378-949a-dfea84a7bfa8` / `92918a3a-49bc-574f-b1b5-311684b40adf` |
| Onboarding form "Default onboarding" (global) | `10111111-1111-4111-8111-111111111111` |
| Check-in form "Weekly check-in" (global) | `c1000001-0000-4000-8000-000000000001` |
| Combined (full plan) template | none seeded. Create one with Templates → Full plans → New |

Shorthand below: `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002`.

## Hard-to-reach screens and states (not reachable as rahul.coach out of the box)

| Screen / state | How to reach it |
|---|---|
| TW-01 sign-in, code sign-in, forgot password | Sign out (Settings → Sign out) or use incognito. OTP codes: `GET http://127.0.0.1:8787/dev/mail?to=rahul.coach@demo.fitbud.test` (subject "Your FitBud code: NNNNNN"). Verified working. |
| TW-01 trainee-only message | Sign in on web as `sneha.review@demo.fitbud.test` (or any trainee). |
| TW-01 dual role | `karan.dual@demo.fitbud.test` has trainee and trainer roles. Web should go into his trainer workspace. |
| TW-02 natural first run | No seeded trainer lacks a display name, so use the dev preview `/welcome?capture=welcome`. A real first run needs a brand-new trainer account (there's no trainer signup on web). |
| Second-trainer view / forbidden | `priya.coach@demo.fitbud.test` sees Lakshmi (`66bb4846-…`) and Karan (`2f866122-3aea-4017-87bf-43c0555feb2f`). Rahul opening those ids shows TW-33 Forbidden/Not found. |
| Invite acceptance (token `fitbud-demo-anita-invite-pending`), signup, intake | **Trainee mobile only** (TR-01/TR-02/TR-03). Trainer web has no accept-invite route. The web side is TW-08 (`/invitations/06b54e81-…`). |
| TW-13/TW-16 client-mode builder and assign modal | Needs a draft: `R/plan` → **Adjust plan** (creates a local draft). Then `R/plan?assign=1`. |
| TW-15 diet scope | Only inside Publish for a nutrition-only change (needs a draft and an edit). |
| TW-27 full-plan template | None seeded. Create with Templates → Full plans → New, or check Use/Fork on Workouts bases. |
| TW-30 end flow | Destructive. Cancel at the type-to-confirm step, or run `pnpm db:reset` afterwards. |
| Reset all demo state | `cd /workspace/thefitbud-run && PATH=/workspace/.tools/node22/bin:$PATH pnpm db:reset` (stop the API first, then restart it). |


## Mobile accounts used in the 18 Oct captures

| ID | Account | Route (capture bridge) |
|---|---|---|
| TM-01 | rahul.coach@demo.fitbud.test | trainer_shell › tab attention |
| TM-02 | rahul.coach@demo.fitbud.test | tab clients |
| TM-03 | rahul.coach@demo.fitbud.test | clients › first client status |
| TM-04 | rahul.coach@demo.fitbud.test | attention › first exception |
| TM-05 | rahul.coach@demo.fitbud.test | tab checkins |
| TM-06 | rahul.coach@demo.fitbud.test | checkins › first check-in |
| TM-07 | rahul.coach@demo.fitbud.test | tab more |
| TM-08 | karan.dual@demo.fitbud.test | role_select (dual role) |
| TM-09 | rahul.coach@demo.fitbud.test | clients › Activity |
| TR-01 | (signed out) | auth (password mode) |
| TR-01b | (signed out) | auth › "Sign in with a code instead" |
| TR-01c | (signed out) | auth › code mode › Send code (code sent) |
| TR-01d | (signed out) | auth › "Forgot password?" |
| TR-02 | anita.invite (test invite token) | accept_invite (needsAccountLink) |
| TR-03 | vikram.onboarding@demo.fitbud.test | intake |
| TR-04 | sneha.review@demo.fitbud.test | role_select → Trainee → waiting_review |
| TR-05 | aarav.ontrack@demo.fitbud.test | trainee_shell › overlay reminder_setup |
| TR-06 | deepak.dubai@demo.fitbud.test | trainee_shell › tab today |
| TR-06 | farhan.paused@demo.fitbud.test | trainee_shell › tab today |
| TR-06 | meera.ack@demo.fitbud.test | trainee_shell › tab today |
| TR-06 | rohan.slipping@demo.fitbud.test | trainee_shell › tab today |
| TR-06 | aarav.ontrack@demo.fitbud.test | trainee_shell › tab today |
| TR-07 | rohan.slipping@demo.fitbud.test | trainee_shell › tab diet |
| TR-07 | lakshmi.foods@demo.fitbud.test | trainee_shell › tab diet |
| TR-08 | lakshmi.foods@demo.fitbud.test | tab diet › Something different sheet |
| TR-09 | aarav.ontrack@demo.fitbud.test | overlay meal_plan |
| TR-10 | aarav.ontrack@demo.fitbud.test | tab workout › See workout overview |
| TR-11 | aarav.ontrack@demo.fitbud.test | active workout (capture start) |
| TR-12 | aarav.ontrack@demo.fitbud.test | workout summary (capture stub) |
| TR-13 | aarav.ontrack@demo.fitbud.test | tab progress |
| TR-14 | aarav.ontrack@demo.fitbud.test | tab today › open check-in |
| TR-15 | aarav.ontrack@demo.fitbud.test | overlay notifications |
| TR-16 | farhan.paused@demo.fitbud.test | tab more › overlay reminder_settings |
| TR-16 | ishita.pushoff@demo.fitbud.test | tab more › overlay reminder_settings |
| TR-16 | aarav.ontrack@demo.fitbud.test | tab more › overlay reminder_settings |
| TR-17 | aarav.ontrack@demo.fitbud.test | overlay quiet_hours |
| TR-18 | aarav.ontrack@demo.fitbud.test | overlay ask_coach (meal_assignment, Lunch) |
| TR-19 | aarav.ontrack@demo.fitbud.test | overlay sync |
| TR-20 | aarav.ontrack@demo.fitbud.test | tab more |
| TR-21 | aarav.ontrack@demo.fitbud.test | overlay widget_tips |
| TR-22 | nikhil.reactivate@demo.fitbud.test | ended coaching |
| TR-22 | kavya.ended@demo.fitbud.test | ended coaching |
| TR-23 | aarav.ontrack@demo.fitbud.test | overlay deep_link (unavailable) |
| TR-24 | deepak.dubai@demo.fitbud.test | overlay meal_times |
| TR-24 | aarav.ontrack@demo.fitbud.test | overlay meal_times |
| TR-25 | aarav.ontrack@demo.fitbud.test | overlay steps_settings |
| TR-26 | aarav.ontrack@demo.fitbud.test | overlay food_search |

Captured 2026-10-18 (IST) from `/workspace/thefitbud-run` @ `7f74108` (branch cursor/stage1-foundation-a3da), Expo web on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`, API on 127.0.0.1:8787 (proxied by Metro at `/__fitbud_api`).

- iOS profile: Playwright "iPhone 15" UA, viewport 393×852 @3x (1179×2556 PNG)
- Android profile: Playwright "Pixel 7" UA, viewport 412×915 @2.625x (1082×2402 PNG)
- Navigation via the app's built-in capture bridge (`apps/mobile/src/dev/captureBridge.ts`); the app uses a state router, so "route" = internal AppRoute / tab / overlay, not a URL.
- Variants (`--<account>`) are extra state captures with other demo accounts.
- Screens are viewport-only (RN-web scrolls inside ScrollViews, so fullPage adds nothing).


## Known demo-data problems (fixed in Batch 0)

### Pre-observed issues (checklist, verbatim) (from a headless smoke run at 10:42 IST, before any checklist pass)
- **Home Needs attention showed only Ishita** (Rohan and Meera were missing as attention rows). `GET /exceptions/attention?groupBy=relationship` groups only the first 20 items (default `limit=20`). Today's evaluation created ~108 overdue-meal items per client, so Ishita's 20 fill the page. This hits G6 / TW-04 #3.
- Raw dates and enums visible: "Required meal still unlogged: Breakfast (2026-09-21)", "Asked about portion_size", "Renewal expired · 2026-10-15", Overview "Effective since 2026-09-22T00:00:00.000Z".
- Home still shows the greeting "Good to see you, rahul coach" (the guide says H1 "Today" plus count tiles).
- Overview recent activity shows negative relative times ("-10h ago").
- The age chip read "1m" (time since detection, because exceptions were re-detected at API start), not the age of the oldest open item.
- The check-in inbox (`view=submitted`) API returns items for the ended Kavya and Nikhil; verify TW-22 #4 in the UI.

