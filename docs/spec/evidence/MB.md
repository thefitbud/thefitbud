# MB evidence

Branch: `cursor/mb-trainee-workout-progress-c688`  
Base: `cursor/ma-trainee-mobile-0064`  
Stack: API `:8787` + Expo web `:8081` (+ trainer-web `:5173` for banned-strings) · Node 22.x  
Proof: `pnpm --filter @fitbud/mobile typecheck` green · mobile vitest **73** passed · core whatsapp tests · `openapi.test.ts` green (includes `GET /i/{token}`) · Expo banned-strings hard-fail empty

Screenshots: `docs/spec/evidence/TR-10.png` … `TR-23.png` (+ viewport variants). Viewports: iPhone 15 `393×852`, Pixel 7 `412×915`, small Android `360×800`.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TR-10 | 6 | 3 | 9 |
| TR-11 | 4 | 5 | 9 |
| TR-12 | 4 | 2 | 6 |
| TR-13 | 6 | 3 | 9 |
| TR-14 | 5 | 3 | 8 |
| TR-15 | 5 | 2 | 7 |
| TR-18 | 5 | 2 | 7 |
| TR-23 | 3 | 2 | 5 |
| **Total** | **38** | **22** | **60** |

MA leftovers in this PR: OpenAPI `GET /i/{token}`; meal log actions gated on `lockStateKnown` (no brief "Eaten as planned" before locks load).

---

## TR-10 · Workout overview

| ID | Result | Proof |
|---|---|---|
| TR-10.1 | PASS | `TR-10.png` / `WorkoutTab` week strip Mon–Sun |
| TR-10.2 | FAIL | Offline start not separately screenshot-proven (outbox start exists; network refetch still used when online) |
| TR-10.3 | PASS | Overflow **Not today** + reason chips (`WorkoutTab.tsx`) |
| TR-10.4 | FAIL | Late-log banner / lock-after-resolve not e2e-proven this run |
| TR-10.5 | PASS | `TR-10.png` — human **Completed** chip + Mon; no ISO·status |
| TR-10.6 | PASS | Screen `onRefresh`; no Refresh button |
| TR-10.7 | PASS | Same as TR-10.6 |
| TR-10.8 | PASS | banned-strings Expo hard-fail empty |
| TR-10.9 | FAIL | Loading/empty/error/offline not each named shot |

---

## TR-11 · Active workout

| ID | Result | Proof |
|---|---|---|
| TR-11.1 | FAIL | Optimistic Done path in code; &lt;100 ms not measured in capture (demo day already completed) |
| TR-11.2 | PASS | Rest timer defaults 90 s (`DEFAULT_REST_SECONDS` / ActiveWorkoutScreen) |
| TR-11.3 | FAIL | Modified values not re-proven in live capture this run |
| TR-11.4 | PASS | RPE 1–10 chips in ActiveWorkoutScreen finish path |
| TR-11.5 | FAIL | Kill-and-resume not device-proven |
| TR-11.6 | FAIL | Airplane-mode session not screenshot-proven |
| TR-11.7 | PASS | `TR-11.png` — **This workout is already done · View summary** (never 0 of 0) |
| TR-11.8 | PASS | banned-strings green |
| TR-11.9 | FAIL | Full state matrix not each shot |

---

## TR-12 · Workout summary

| ID | Result | Proof |
|---|---|---|
| TR-12.1 | PASS | `TR-12.png` — no "Session captured" / gamification |
| TR-12.2 | PASS | `TR-12.png` — 60 min · 1 of 1 exercises · 1 of 1 sets |
| TR-12.3 | PASS | `TR-12.png` — **This week · 1 of 4 workouts** |
| TR-12.4 | PASS | Duration bounded; not 0/0; coral accent; **Rahul will see this.** |
| TR-12.5 | PASS | banned-strings green |
| TR-12.6 | FAIL | Offline "Saved on phone…" state not separately captured |

---

## TR-13 · Progress

| ID | Result | Proof |
|---|---|---|
| TR-13.1 | PASS | `TR-13.png` — sparkline with multiple weight points (76.8 kg) |
| TR-13.2 | PASS | `measurement.create` outbox + localPayload (`ProgressTab`) |
| TR-13.3 | FAIL | Compare UI not fully exercised in capture |
| TR-13.4 | PASS | Neutral trend copy (+1.1 kg, not red) |
| TR-13.5 | PASS | Single **Progress** title (`showHeader={false}`) |
| TR-13.6 | PASS | PTR; no Refresh button |
| TR-13.7 | PASS | Same as TR-13.6 |
| TR-13.8 | PASS | banned-strings green |
| TR-13.9 | FAIL | Loading/error/offline not each named shot (`TR-13--empty.png` is not a true empty) |

---

## TR-14 · Check-in

| ID | Result | Proof |
|---|---|---|
| TR-14.1 | PASS | `TR-14.png` — form fields from pinned template (wellbeing, notes, weight, photo) |
| TR-14.2 | PASS | Weight stepper prefilled **76.8 kg** |
| TR-14.3 | FAIL | Offline submit queue not screenshot-proven |
| TR-14.4 | FAIL | Reviewed outcome + visible coach note not re-opened in capture (API has reviewed rows) |
| TR-14.5 | PASS | No "when ready" / review-time promise; intro uses Due copy |
| TR-14.6 | PASS | `TR-14.png` — **Due Wed 21 Oct, 11:59 pm** (no Due·due / ISO) |
| TR-14.7 | PASS | banned-strings green |
| TR-14.8 | FAIL | Loading/empty/error/offline not each shot |

Weight answers still create linked measurement records on submit (server `linkedMeasurementsForCheckin`).

---

## TR-15 · Notifications inbox

| ID | Result | Proof |
|---|---|---|
| TR-15.1 | PASS | 30-day filter in NotificationsScreen; empty inbox `TR-15.png` |
| TR-15.2 | FAIL | Tap→exact route not live-proven for every type (unit coverage in `routing.test.ts`) |
| TR-15.3 | PASS | Mark read + Mark all read wired |
| TR-15.4 | PASS | PTR; no Refresh button |
| TR-15.5 | PASS | Same as TR-15.4 |
| TR-15.6 | PASS | banned-strings green |
| TR-15.7 | FAIL | Offline/error states not each shot (`TR-15--empty.png` = empty only) |

---

## TR-18 · Ask coach on WhatsApp

| ID | Result | Proof |
|---|---|---|
| TR-18.1 | PASS | `TR-18.png` — Ask Rahul about **Lunch · Tue 13 Oct** |
| TR-18.2 | PASS | Preview has https `/go/meal/…` + wa.me via `whatsappHref`; API `trainerWhatsappE164` = +919000000001 |
| TR-18.3 | FAIL | AskedCoachMarker on item not screenshot-proven |
| TR-18.4 | PASS | `POST /coach-asks` 201; trainer open asks list includes it (API probe) |
| TR-18.5 | PASS | `buildAskCoachMessage` test ≤140 chars excluding URL |
| TR-18.6 | PASS | banned-strings green |
| TR-18.7 | FAIL | No-number / offline states not each shot |

Text-only prefill; never auto-send. Open WhatsApp is neutral secondary (`variant="whatsapp"`).

---

## TR-23 · Deep-link router and item unavailable

| ID | Result | Proof |
|---|---|---|
| TR-23.1 | PASS | `routing.test.ts` maps every trainee §4 type to an exact route |
| TR-23.2 | FAIL | Installed-app Universal Link open not device-proven (https `/go/` built) |
| TR-23.3 | PASS | `TR-23.png` — **This item isn't available anymore** + **Go to Today** |
| TR-23.4 | PASS | banned-strings green |
| TR-23.5 | FAIL | Resolving spinner / other states not each shot |

---

## Core flow notes

| Flow | Result | Notes |
|---|---|---|
| Start → log sets → summary | PARTIAL | Demo Aarav workouts already completed; active path shows done guard (`TR-11.png`); summary capture enriched (`TR-12.png`). Fresh start needs an assigned day. |
| Check-in + weight → trainer | PARTIAL | Form + weight prefill proven; submit→trainer inbox not re-run end-to-end this capture. |
| Notification deep link | PARTIAL | Unit tests per type; inbox empty in seed so tap path thin. |
| Ask coach wa.me | PASS | Prefill + trainer number from relationship API; ask recorded for trainer. |
