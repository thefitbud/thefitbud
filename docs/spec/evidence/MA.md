# MA evidence

Branch: `cursor/ma-trainee-mobile-0064`  
Base: `cursor/tw-g-history-settings-29d9` @ `8b866cf`  
Stack: API `:8787` + Expo web `:8081` (+ trainer-web `:5173` for banned-strings) · Node 22.x  
Proof: `pnpm --filter @fitbud/mobile typecheck` green · mobile vitest **65** passed · invite landing `GET /i/:token` 200 · substitution unit test · shared day cache

Screenshots: `docs/spec/evidence/MA/` (prior capture still valid for visual proofs). Viewports: iPhone 15 `393×852`, Pixel 7 `412×915`, small Android `360×800`.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TR-01 | 8 | 1 | 9 |
| TR-02 | 6 | 1 | 7 |
| TR-03 | 5 | 2 | 7 |
| TR-04 | 5 | 1 | 6 |
| TR-05 | 6 | 2 | 8 |
| TR-06 | 12 | 3 | 15 |
| TR-07 | 9 | 2 | 11 |
| TR-08 | 6 | 1 | 7 |
| TR-09 | 4 | 2 | 6 |
| TR-26 | 6 | 3 | 9 |
| **Total** | **67** | **18** | **85** |

QA must-fix this run (not on prior FAIL list): locked meals, invite e2e path, Today/Diet shared cache, Something different replace, week `mealsAssigned` denominator — addressed in code + unit/API wiring. TW-G leftovers: tap-targets.css expansion, reactivate empty plan, hide stale Review check-in.

---

## TR-01 · Sign in / account activation

| ID | Result | Proof |
|---|---|---|
| TR-01.1 | PASS | Password sign-in works (`TR-01.png` + aarav login → Today) |
| TR-01.2 | PASS | `TR-01.png` / `TR-01--code.png` — WhatsApp **Coming soon**; email code path |
| TR-01.3 | PASS | `wa_otp` off — Coming soon path only |
| TR-01.4 | PASS | No SMS UI in SignIn/CodeSignIn |
| TR-01.5 | FAIL | Forgot-password UI exists; full reset→sign-in not re-proven this run |
| TR-01.6 | PASS | Invite trainer title path in SignInScreen |
| TR-01.7 | PASS | No test fields in production UI |
| TR-01.8 | PASS | banned-strings Expo hard-fail empty (prior) |
| TR-01.9 | PASS | Signed-out **Have a code?** opens AcceptInvite (`SignInScreen` + `AuthScreen` invite mode) |

---

## TR-02 · Invite acceptance

| ID | Result | Proof |
|---|---|---|
| TR-02.1 | PASS | `GET /i/:token` HTML landing 200 (Anita demo token); deep-link/`?invite=` into AcceptInvite |
| TR-02.2 | PASS | Manual code path + signed-out **Have a code?** |
| TR-02.3 | PASS | Expired-token copy in AcceptInviteScreen |
| TR-02.4 | PASS | AcceptInvite password + email OTP (`purpose: invite`) → `acceptInvitation` with `otpProof`; api-client union response; `e2e/tr-02-invite.spec.ts` |
| TR-02.5 | PASS | Landing card + bullets; code behind “Have a code instead?” |
| TR-02.6 | PASS | banned-strings green |
| TR-02.7 | FAIL | Dedicated empty/error/offline shots not re-captured |

`AddClientForm` now `sendEmail: true` → E-INV to dev mail sink.

---

## TR-03 · Intake form

| ID | Result | Proof |
|---|---|---|
| TR-03.1 | PASS | IntakeScreen FormRenderer field types |
| TR-03.2 | PASS | Autosave draft path |
| TR-03.3 | FAIL | Offline queue not screenshot-proven this run |
| TR-03.4 | PASS | Review step exists |
| TR-03.5 | PASS | `TR-03.png` — section progress |
| TR-03.6 | PASS | banned-strings green |
| TR-03.7 | FAIL | Loading/empty/error/offline not each shot |

---

## TR-04 · Waiting for coach

| ID | Result | Proof |
|---|---|---|
| TR-04.1 | PASS | resolveRoute advances when plan active |
| TR-04.2 | PASS | `TR-04.png` — Joined / Intake sent checked |
| TR-04.3 | PASS | sneha.review trainee-only path |
| TR-04.4 | PASS | PTR via Screen `onRefresh` |
| TR-04.5 | PASS | banned-strings green |
| TR-04.6 | FAIL | Offline/error screenshots not separately captured |

Also: after reactivate with closed horizon, Today shows **Your coach is preparing your plan** (empty state) instead of `X / 0 kcal`.

---

## TR-05 · Reminder setup

| ID | Result | Proof |
|---|---|---|
| TR-05.1 | PASS | Defaults App notifications; quiet hours copy |
| TR-05.2 | PASS | WhatsApp **Coming soon** |
| TR-05.3 | PASS | Flag-off path only |
| TR-05.4 | PASS | OEM sheet Android-only |
| TR-05.5 | PASS | Steps skippable |
| TR-05.6 | FAIL | Preferred workout time persistence not API-proven |
| TR-05.7 | PASS | banned-strings green |
| TR-05.8 | FAIL | State matrix screenshots incomplete |

---

## TR-06 · Today

| ID | Result | Proof |
|---|---|---|
| TR-06.1 | PASS | `nextUp.test.ts` + countdown `in N h M min` |
| TR-06.2 | PASS | Start workout opens active path |
| TR-06.3 | PASS | Rings from `nutrition.ts`; shared cache invalidation with Diet |
| TR-06.4 | PASS | Hero / meal list next meal |
| TR-06.5 | PASS | Past/future gating + locked meals hide actions |
| TR-06.6 | PASS | StepsCard hidden while `steps_enabled` off |
| TR-06.7 | PASS | No streak/%/hydration/version |
| TR-06.8 | PASS | WeeklyConsistency; week `mealsAssigned` = all slots (no “4 of 3”) |
| TR-06.9 | FAIL | Offline cache not separately screenshot-proven |
| TR-06.10 | PASS | No client generate calls |
| TR-06.11 | PASS | Heading **Today** (decision 22 — no time-of-day greeting) |
| TR-06.12 | FAIL | Deepak Dubai timezone not re-captured |
| TR-06.13 | PASS | Screen PTR |
| TR-06.14 | PASS | banned-strings green |
| TR-06.15 | FAIL | Loading/empty/error/offline not each named shot |

Mockup 04: lucide bell + tab icons; week strip in card.

---

## TR-07 · Diet

| ID | Result | Proof |
|---|---|---|
| TR-07.1 | PASS | Eaten as planned; locked meals no longer show it |
| TR-07.2 | PASS | Skip snackbar Undo affordance |
| TR-07.3 | PASS | Photo never blocks confirm |
| TR-07.4 | PASS | Late-log helper + `loggingLocked` from resolved exceptions |
| TR-07.5 | PASS | Shared day cache so Today matches after log |
| TR-07.6 | PASS | No % on Diet |
| TR-07.7 | FAIL | Notification action log-without-open not proven |
| TR-07.8 | PASS | Diet date header (no ISO) |
| TR-07.9 | PASS | DietTab PTR |
| TR-07.10 | PASS | banned-strings green |
| TR-07.11 | FAIL | Loading/empty/error/offline not each shot |

Sync rejections surface via `MealSyncError` / `messageFromSyncResults`.

---

## TR-08 · Something different

| ID | Result | Proof |
|---|---|---|
| TR-08.1 | PASS | Sheet + quick options |
| TR-08.2 | PASS | “Log what I ate” primary |
| TR-08.3 | PASS | Modified meals feed rings |
| TR-08.4 | PASS | **Replace** planned foods on first substitute (`substitution.test.ts` — 629+117 bug) |
| TR-08.5 | PASS | No “deviation” user copy |
| TR-08.6 | PASS | banned-strings green |
| TR-08.7 | FAIL | Full state matrix not captured |

---

## TR-09 · Assigned meal plan

| ID | Result | Proof |
|---|---|---|
| TR-09.1 | PASS | Read-only plan |
| TR-09.2 | FAIL | Diff banner after replacement not demo-captured |
| TR-09.3 | PASS | Day + per-meal kcal/macros |
| TR-09.4 | PASS | Times via `formatHhMmTime` |
| TR-09.5 | PASS | banned-strings green |
| TR-09.6 | FAIL | Empty/error/offline shots incomplete |

---

## TR-26 · Food search and quantity

| ID | Result | Proof |
|---|---|---|
| TR-26.1 | PASS | From your plan / frequent before typing |
| TR-26.2 | PASS | Search suggestions |
| TR-26.3 | PASS | Serving chips; `accessibilityRole="button"` |
| TR-26.4 | PASS | Live macros |
| TR-26.5 | PASS | Offline copy path |
| TR-26.6 | PASS | Custom food unknown → ≥ |
| TR-26.7 | PASS | Sections render |
| TR-26.8 | PASS | banned-strings green |
| TR-26.9 | FAIL | Dedicated loading/empty/error/offline shots incomplete |

INDB recipe portion labels stripped via `cleanFoodLabel`.

---

## Core flows (honest)

| Flow | Result | Notes |
|---|---|---|
| Invite link `/i/:token` | PASS | API HTML landing 200 |
| Invite mail + password/OTP | PASS | `sendEmail: true` + AcceptInvite + e2e spec |
| Activation / sign-in | PASS | Have a code? on signed-out |
| Waiting / preparing plan | PASS | Closed horizon → empty preparing state |
| Today ↔ Diet after log | PASS | `dataCache` invalidate |
| Locked meal logging | PASS | Hide actions + plain-words lock + sync error |
| Something different replace | PASS | Unit test |
| Week grid denominator | PASS | `mealsAssigned = dayMeals.length` |
| Trainee 403 noise | PASS | No `listExceptions`; no trainee device-token register |
| banned-strings | PASS | Prior green; no new enum/% strings introduced |

---

## TW-G leftovers (this run)

| Item | Result |
|---|---|
| iPad tap targets (links, tabs, inputs, workspace, inbox) | PASS `tw-g-ipad.spec.ts` WebKit portrait — 3/3 including workspace+inbox **0 offenders** |
| Reactivate Today empty plan | PASS preparing empty state + closed `effectiveTo` |
| Hide Review check-in post-reactivate | PASS `pendingReviewCheckin` scoped to `reactivatedAt` |
