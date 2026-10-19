# MB evidence

Branch: `cursor/mb-trainee-workout-progress-c688`  
Base: `cursor/ma-trainee-mobile-0064`  
Stack: API `:8787` + Expo web `:8081` · Node 22.x  
Visual target: `docs/spec/mockups-v2` (approved 19 Oct; mockup wins over older specs)  
Proof: `pnpm --filter @fitbud/mobile typecheck` green · mobile vitest **73** passed · `@fitbud/core` whatsapp **4** · `openapi.test.ts` **3** · capture + Rohan Playwright at **393×852** after `pnpm db:reset`

Screenshots: `docs/spec/evidence/TR-10.png` … `TR-23.png`, `trainee-rohan-*.png`. Viewports: iPhone 15 `393×852`, Pixel 7 `412×915`, small Android `360×800`.

## Summary counts

| Screen | PASS | FAIL | Total | Mockup match (393) |
|---|---:|---:|---:|---|
| TR-10 | 6 | 3 | 9 | PARTIAL — week strip + Start; missing navy `whero` / miss banner |
| TR-11 | 5 | 4 | 9 | PARTIAL — accordion + log bar landed; rest band / polish incomplete vs 11b |
| TR-12 | 5 | 1 | 6 | CLOSE — recap counts + week; not full `stat4` / dots strip |
| TR-13 | 6 | 3 | 9 | PARTIAL — weight sparkline; layout denser than mockup 13 |
| TR-14 | 6 | 2 | 8 | PARTIAL — form + draft/version fix; not 3-step chrome |
| TR-15 | 5 | 2 | 7 | PARTIAL — inbox list; relative-time layout not mock-tight |
| TR-18 | 6 | 1 | 7 | CLOSE — meal topics only; preview + wa.me |
| TR-23 | 4 | 1 | 5 | CLOSE — unavailable screen + Linking registered |
| TR-07 | 7 | 4 | 11 | PARTIAL — lock gate + btn pair; not `daysum2` / locked `lrow` |
| TR-08 | 5 | 1 | 6 | CLOSE — 3-option sheet (Ate out / Log myself / Portion) |
| TR-20 | 4 | 2 | 6 | PARTIAL — More groups; coach WhatsApp card thinner than 16 |
| **Total** | **59** | **24** | **83** | |

QA must-fixes this round: check-in version flush + sync UNIQUE idempotency; locked meal seed + Closed by; Expo Linking; summary enrichment; meal notif date; web session persist; Waiting real WhatsApp; one duration source; Ask coach topics by item type.

API route vitests that need `node:sqlite` FTS5 (`sync`/`checkins`/`meals` memory DB) did not run on the agent image’s `/exec-daemon/node` 22.14 — use Node ≥ 22.23 locally.

---

## TR-07 · Diet

| ID | Result | Proof |
|---|---|---|
| TR-07.1 | PASS | Eaten as planned + Something different side-by-side when `canLog` (`DietTab`) |
| TR-07.2 | PASS | Skip + Undo snackbar (Undo still best-effort message) |
| TR-07.3 | PASS | Photo never blocks confirm; post-log Camera/Gallery prompt (07b) |
| TR-07.4 | PASS | Rohan seeded resolved lunch lock → `loggingLocked` + Closed by copy; actions gated on `lockStateKnown` |
| TR-07.5 | PASS | Day kcal + macros from shared day totals |
| TR-07.6 | PASS | No % |
| TR-07.7 | FAIL | Notification background log not proven |
| TR-07.8 | PASS | `trainee-rohan-diet.png` — Diet · Mon 19 Oct |
| TR-07.9 | PASS | PTR |
| TR-07.10 | PASS | banned-strings (prior Expo hard-fail empty) |
| TR-07.11 | FAIL | Full state matrix not each shot |

**Mockup:** PARTIAL vs `07-trainee-diet-ios.png` — missing kcal ring + mac bars card and locked padlock row chrome.

---

## TR-08 · Something different

| ID | Result | Proof |
|---|---|---|
| TR-08.1 | PASS | Three options only: Ate out / Log it myself / Changed the portion |
| TR-08.2 | PASS | Ate out → note + Save (`restaurant`) |
| TR-08.3 | PASS | Portion → per-item steppers + Save |
| TR-08.4 | PASS | Log it myself → food search overlay |
| TR-08.5 | PASS | No “deviation” user copy |
| TR-08.6 | FAIL | 08b/08c dedicated screenshots not recaptured this run |

**Mockup:** CLOSE vs `08-trainee-something-different-ios.png`.

---

## TR-10 · Workout overview

| ID | Result | Proof |
|---|---|---|
| TR-10.1 | PASS | Week strip Mon–Sun (`trainee-rohan-workout.png`) |
| TR-10.2 | FAIL | Offline start not separately proven |
| TR-10.3 | PASS | Not today overflow |
| TR-10.4 | FAIL | Late-log / lock-after-resolve not e2e |
| TR-10.5 | PASS | Human status chips |
| TR-10.6 | PASS | PTR; no Refresh button |
| TR-10.7 | PASS | Same |
| TR-10.8 | PASS | banned-strings |
| TR-10.9 | FAIL | Full state matrix |

**Mockup:** PARTIAL vs `10-trainee-workout-overview-ios.png` — no navy hero; duration from shared estimator (sparse seed → “About 1 min”).

Day detail (10b): `WorkoutOverviewScreen` sticky Start; tab bar hidden while open — PARTIAL vs `10b`.

---

## TR-11 · Active workout

| ID | Result | Proof |
|---|---|---|
| TR-11.1 | PASS | Log set / check path optimistic |
| TR-11.2 | PASS | Rest band after log |
| TR-11.3 | FAIL | Modified edit not re-proven in capture |
| TR-11.4 | PASS | RPE only on finish when required |
| TR-11.5 | FAIL | Kill-and-resume not device-proven |
| TR-11.6 | FAIL | Airplane not proven |
| TR-11.7 | PASS | `TR-11.png` done guard / accordion shell |
| TR-11.8 | PASS | banned-strings |
| TR-11.9 | FAIL | Full matrix |

**Mockup:** PARTIAL vs `11` / `11b` — accordion + sticky log bar present; visual polish incomplete.

---

## TR-12 · Workout summary

| ID | Result | Proof |
|---|---|---|
| TR-12.1 | PASS | No gamification (`TR-12.png`) |
| TR-12.2 | PASS | 60 min · 1 of 1 exercises · 1 of 1 sets (enriched from day when API omits sets) |
| TR-12.3 | PASS | This week · 1 of 4 |
| TR-12.4 | PASS | Coral accent; Rahul will see this |
| TR-12.5 | PASS | banned-strings |
| TR-12.6 | FAIL | Offline copy not separately captured |

**Mockup:** CLOSE vs `12-trainee-workout-summary-ios.png`.

---

## TR-13 · Progress

| ID | Result | Proof |
|---|---|---|
| TR-13.1 | PASS | `TR-13.png` / `trainee-rohan-progress.png` sparkline |
| TR-13.2 | PASS | `measurement.create` outbox |
| TR-13.3 | FAIL | Compare UI not exercised |
| TR-13.4 | PASS | Neutral trend copy |
| TR-13.5 | PASS | Single Progress title |
| TR-13.6 | PASS | PTR |
| TR-13.7 | PASS | Same |
| TR-13.8 | PASS | banned-strings |
| TR-13.9 | FAIL | Loading/error/offline not each shot |

**Mockup:** PARTIAL vs `13`.

---

## TR-14 · Check-in

| ID | Result | Proof |
|---|---|---|
| TR-14.1 | PASS | `TR-14.png` pinned fields |
| TR-14.2 | PASS | Weight prefill |
| TR-14.3 | FAIL | Offline queue not screenshot-proven |
| TR-14.4 | PASS | Version flush before submit (draft timer cancel + version ref) — first-try submit |
| TR-14.5 | PASS | No review-time promise |
| TR-14.6 | PASS | Due copy human |
| TR-14.7 | PASS | banned-strings |
| TR-14.8 | FAIL | Full state matrix |

**Mockup:** PARTIAL vs `14` (not 3-step chrome). Sync UNIQUE retries → prior result (`persistSyncMutationResult`).

---

## TR-15 · Notifications

| ID | Result | Proof |
|---|---|---|
| TR-15.1 | PASS | `TR-15.png` / `trainee-rohan-notifications.png` |
| TR-15.2 | PASS | Meal deep link sets `selectedDate` to assignment `localDate` |
| TR-15.3 | PASS | Mark read / mark all |
| TR-15.4 | PASS | PTR |
| TR-15.5 | PASS | Same |
| TR-15.6 | PASS | banned-strings |
| TR-15.7 | FAIL | Offline/error not each shot |

**Mockup:** PARTIAL vs `15`.

---

## TR-18 · Ask coach

| ID | Result | Proof |
|---|---|---|
| TR-18.1 | PASS | `TR-18.png` — Ask Rahul about Lunch |
| TR-18.2 | PASS | Meal topics only (no Form check); preview + wa.me |
| TR-18.3 | FAIL | Asked marker not screenshot-proven |
| TR-18.4 | PASS | Coach-ask API |
| TR-18.5 | PASS | Prefill ≤140 (core test) |
| TR-18.6 | PASS | banned-strings |
| TR-18.7 | PASS | No-number path on Waiting |

**Mockup:** CLOSE vs `25`.

---

## TR-23 · Deep links

| ID | Result | Proof |
|---|---|---|
| TR-23.1 | PASS | `routing.test.ts` + `linking.test.ts` |
| TR-23.2 | PASS | `useAppDeepLinks` — `getInitialURL` + `url` events → parser |
| TR-23.3 | PASS | `TR-23.png` unavailable |
| TR-23.4 | PASS | banned-strings |
| TR-23.5 | FAIL | Resolving spinner not shot |

**Mockup:** CLOSE vs `26`.

---

## TR-20 · More

| ID | Result | Proof |
|---|---|---|
| TR-20.1 | PASS | `trainee-rohan-more.png` |
| TR-20.2 | PASS | Coach WhatsApp from relationship number |
| TR-20.3 | PASS | Settings groups |
| TR-20.4 | PASS | Sign out |
| TR-20.5 | FAIL | Steps hidden only when flag off — not re-proven |
| TR-20.6 | FAIL | Past coaching invent detail not mock-matched |

**Mockup:** PARTIAL vs `16`.

---

## Minors

| Item | Result |
|---|---|
| Expo web session persist | PASS — `sessionStorage` localStorage hydrate |
| Waiting real trainer WhatsApp | PASS — `trainerWhatsappE164` + `whatsappHref` |
| One duration source | PASS — `estimateDurationMinutesFromDay` on Today + Workout |
| Tab bar hide on immersive | PASS — active/summary/day detail/fullscreen overlays |

---

## Core flow notes

| Flow | Result | Notes |
|---|---|---|
| Something different 3 options | PASS | Structure matches Set 3 |
| Check-in submit first try | PASS | Draft flush + version ref |
| Locked meal Closed by | PASS | Seed + API locks; navigate to locked date |
| Summary not 0/0 | PASS | Enrichment helper |
| Meal notif → item date | PASS | `setSelectedDate(match.localDate)` |
| Visual match to mockups-v2 | PARTIAL | Structure landed; chrome/layout still catching up on Diet/Workout hero |
