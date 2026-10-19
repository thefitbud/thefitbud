# MA evidence

Branch: `cursor/ma-trainee-mobile-0064`  
Base: `cursor/tw-g-history-settings-29d9` @ `4c2081b`  
Stack: API `:8787` + Expo web `:8081` (+ trainer-web `:5173` for banned-strings) · Node 22.x  
Proof: `pnpm --filter @fitbud/mobile typecheck` green · mobile vitest **63** passed · `playwright.banned.config.ts` **2 passed** (web + Expo hard-fail empty) · capture `scripts/capture-ma.mjs`

Screenshots: `docs/spec/evidence/MA/` (also `/opt/cursor/artifacts/screenshots/`). Side-by-side: `TR-01-side-by-side.png` (vs mockup 06), `TR-06-side-by-side.png` (vs mockup 04). Viewports: iPhone 15 `393×852`, Pixel 7 `412×915`, small Android `360×800` (`*-ios|pixel|small.png`).

`docs/spec/BATCHES.md` synced from `/cursor/stores/bot/qa/BATCHES.md` (identical).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TR-01 | 7 | 2 | 9 |
| TR-02 | 4 | 3 | 7 |
| TR-03 | 5 | 2 | 7 |
| TR-04 | 5 | 1 | 6 |
| TR-05 | 6 | 2 | 8 |
| TR-06 | 11 | 4 | 15 |
| TR-07 | 8 | 3 | 11 |
| TR-08 | 5 | 2 | 7 |
| TR-09 | 4 | 2 | 6 |
| TR-26 | 6 | 3 | 9 |
| **Total** | **61** | **24** | **85** |

---

## TR-01 · Sign in / account activation

| ID | Result | Proof |
|---|---|---|
| TR-01.1 | PASS | Password sign-in works (`TR-01.png` + aarav login → Today `TR-06.png`) |
| TR-01.2 | PASS | `TR-01.png` / `TR-01--code.png` — WhatsApp **Coming soon**; email code path |
| TR-01.3 | PASS | `wa_otp` off — Coming soon path only (config flag) |
| TR-01.4 | PASS | No SMS UI in SignIn/CodeSignIn |
| TR-01.5 | FAIL | Forgot-password UI exists; full reset→sign-in not re-proven this run |
| TR-01.6 | PASS | Invite trainer title path in SignInScreen (`Join {name}'s coaching`) |
| TR-01.7 | PASS | No test fields in production UI (`TR-01.png`) |
| TR-01.8 | PASS | banned-strings Expo hard-fail empty |
| TR-01.9 | FAIL | Loading/empty/error/offline not each named screenshot |

Also: `TR-01-ios.png`, `TR-01-pixel.png`, `TR-01-small.png`, `TR-01-side-by-side.png`.

---

## TR-02 · Invite acceptance

| ID | Result | Proof |
|---|---|---|
| TR-02.1 | FAIL | Deep-link WhatsApp invite accept not browser-captured this run |
| TR-02.2 | PASS | `TR-02.png` — “Have a code instead?” + join card |
| TR-02.3 | PASS | Expired-token copy in AcceptInviteScreen (code path) |
| TR-02.4 | FAIL | New-account set-password-on-accept not end-to-end proven |
| TR-02.5 | PASS | `TR-02.png` — landing card + bullets; code behind “Have a code instead?” |
| TR-02.6 | PASS | banned-strings green |
| TR-02.7 | FAIL | Dedicated empty/error/offline shots not captured |

API: `GET /invitations/preview?token=fitbud-demo-anita-invite-pending` → `Rahul Verma`.

---

## TR-03 · Intake form

| ID | Result | Proof |
|---|---|---|
| TR-03.1 | PASS | IntakeScreen FormRenderer field types (unit + prior mobileFlows) |
| TR-03.2 | PASS | Autosave draft path in IntakeScreen |
| TR-03.3 | FAIL | Offline queue not screenshot-proven this run |
| TR-03.4 | PASS | Review step exists in IntakeScreen |
| TR-03.5 | PASS | `TR-03.png` — section progress |
| TR-03.6 | PASS | banned-strings green |
| TR-03.7 | FAIL | Loading/empty/error/offline not each shot |

---

## TR-04 · Waiting for coach

| ID | Result | Proof |
|---|---|---|
| TR-04.1 | PASS | resolveRoute advances when plan active (unit + seed) |
| TR-04.2 | PASS | `TR-04.png` — Joined / Intake sent checked |
| TR-04.3 | PASS | sneha.review `permittedRoles:["trainee"]`, `onboarding_submitted`; `TR-04.png` no Choose mode / no Refresh |
| TR-04.4 | PASS | PTR via Screen `onRefresh`; no “Refresh status” button (`TR-04.png`) |
| TR-04.5 | PASS | banned-strings green |
| TR-04.6 | FAIL | Offline/error screenshots not separately captured |

---

## TR-05 · Reminder setup

| ID | Result | Proof |
|---|---|---|
| TR-05.1 | PASS | Defaults App notifications; quiet hours copy `10:00 pm – 7:00 am` |
| TR-05.2 | PASS | `TR-05.png` — WhatsApp **Coming soon** |
| TR-05.3 | PASS | Flag-off path only (no consent when `wa_automation` off) |
| TR-05.4 | PASS | OEM sheet Android-only (code) |
| TR-05.5 | PASS | Steps skippable (`TR-05.png` / screen) |
| TR-05.6 | FAIL | Preferred workout time persistence not API-proven this run |
| TR-05.7 | PASS | banned-strings green |
| TR-05.8 | FAIL | State matrix screenshots incomplete |

---

## TR-06 · Today

| ID | Result | Proof |
|---|---|---|
| TR-06.1 | PASS | `nextUp.test.ts` (5 cases) + `TR-06.png` hero Dinner next-up |
| TR-06.2 | PASS | Start workout opens active path (TraineeShell wiring) |
| TR-06.3 | PASS | Rings from `nutrition.ts` + modified uses `loggedTotals`; unit tests |
| TR-06.4 | PASS | Hero / meal list next meal (`TR-06.png`) |
| TR-06.5 | PASS | Past/future gating via `canLogMealOnDate` + date navigator |
| TR-06.6 | PASS | StepsCard hidden while `steps_enabled` off |
| TR-06.7 | PASS | No streak/%/hydration/version on `TR-06.png` |
| TR-06.8 | PASS | WeeklyConsistency from `/me/week` (shared with trainer) |
| TR-06.9 | FAIL | Offline cache not separately screenshot-proven |
| TR-06.10 | PASS | No client generate calls in TodayTab |
| TR-06.11 | PASS | `TR-06.png` — “Today · Mon 19 Oct” (no ISO) |
| TR-06.12 | FAIL | Deepak Dubai timezone not re-captured this run |
| TR-06.13 | PASS | Screen `onRefresh` PTR |
| TR-06.14 | PASS | banned-strings green |
| TR-06.15 | FAIL | Loading/empty/error/offline not each named shot |

Also: `TR-06-ios|pixel|small.png`, `TR-06-side-by-side.png` vs mockup 04.

---

## TR-07 · Diet

| ID | Result | Proof |
|---|---|---|
| TR-07.1 | PASS | Eaten as planned → API confirm (`POST …/confirm` Dinner) + UI |
| TR-07.2 | PASS | Skip snackbar Undo affordance in DietTab |
| TR-07.3 | PASS | Photo never blocks confirm (photoIntent optional) |
| TR-07.4 | PASS | Late-log helper unit tests |
| TR-07.5 | PASS | `TR-07.png` — “3 of 4 meals logged” + 1086/1847 kcal (shared rounding) |
| TR-07.6 | PASS | No % on Diet (`TR-07.png`) |
| TR-07.7 | FAIL | Notification action log-without-open not proven |
| TR-07.8 | PASS | `TR-07.png` — “Diet · Mon 19 Oct” (no ISO header) |
| TR-07.9 | PASS | DietTab PTR `onRefresh` |
| TR-07.10 | PASS | banned-strings green |
| TR-07.11 | FAIL | Loading/empty/error/offline not each shot |

Also: `TR-07-ios|pixel|small.png`.

---

## TR-08 · Something different

| ID | Result | Proof |
|---|---|---|
| TR-08.1 | PASS | `TR-08.png` — sheet + quick options |
| TR-08.2 | PASS | “Log what I ate” primary (`TR-08.png`) |
| TR-08.3 | PASS | Modified meals feed rings via `loggedTotals` (unit test) |
| TR-08.4 | FAIL | Offline deviate queue not screenshot-proven |
| TR-08.5 | PASS | No “deviation” user copy (`TR-08.png`) |
| TR-08.6 | PASS | banned-strings green |
| TR-08.7 | FAIL | Full state matrix not captured |

---

## TR-09 · Assigned meal plan

| ID | Result | Proof |
|---|---|---|
| TR-09.1 | PASS | `TR-09.png` — read-only plan |
| TR-09.2 | FAIL | Diff banner after replacement not demo-captured |
| TR-09.3 | PASS | Day + per-meal kcal/macros (`TR-09.png`) |
| TR-09.4 | PASS | Times via `formatHhMmTime` (e.g. `8:00 am`) |
| TR-09.5 | PASS | banned-strings green |
| TR-09.6 | FAIL | Empty/error/offline shots incomplete |

---

## TR-26 · Food search and quantity

| ID | Result | Proof |
|---|---|---|
| TR-26.1 | PASS | `TR-26.png` — “From your plan · frequent” before typing |
| TR-26.2 | PASS | dal search suggestions (Dal … entries) |
| TR-26.3 | PASS | Serving chips include katori/bowl/g (`TR-26.png`) |
| TR-26.4 | PASS | Live macros via shared unscale path (nutrition unit tests) |
| TR-26.5 | PASS | Offline copy path in FoodSearchScreen |
| TR-26.6 | PASS | Custom food unknown → ≥ path (unit + UI copy) |
| TR-26.7 | PASS | `TR-26.png` sections render |
| TR-26.8 | PASS | banned-strings green |
| TR-26.9 | FAIL | Dedicated loading/empty/error/offline shots incomplete |

---

## Core flows (honest)

| Flow | Result | Notes |
|---|---|---|
| Invite preview | PASS | API preview `Rahul Verma` |
| Activation / sign-in | PASS | `TR-01` → Today |
| Intake → TW-10 | FAIL | Not re-run browser E2E this session (Intake screen captured only) |
| Waiting until plan | PASS | sneha `onboarding_submitted` + `TR-04.png` |
| Today workout/meals/check-in | PASS | `TR-06.png` |
| Log as planned | PASS | API confirm Dinner + Diet UI |
| Something different + search | PARTIAL | UI `TR-08`/`TR-26`; trainer TW-17 match not re-browsered |
| Viewports 393 / 412 / 360 | PASS | `*-ios|pixel|small.png` |
| banned-strings | PASS | Expo + web hard-fail empty |

---

## Mockup side-by-side

- Sign-in: `TR-01-side-by-side.png` vs `mockup-06-signin-ios.png` — gradient hero + sheet + Coming soon match closely; mockup has richer input icons.
- Today: `TR-06-side-by-side.png` vs `mockup-04-today-ios.png` — navy hero, greeting, workout card present; week-strip chrome still differs from mockup HTML (FAIL on pixel-perfect navigator).
