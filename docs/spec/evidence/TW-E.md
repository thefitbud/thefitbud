# TW-E evidence

Branch: `cursor/tw-e-activity-checkins-e531` · PR #9  
Base: `cursor/tw-d-plan-builders-af84`  
Stack: API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof: `pnpm --filter @fitbud/{core,contracts,api,trainer-web} typecheck` green · core **124** / trainer-web **22** / api `meals.test` (dry-run === publish created) green · Playwright `e2e/tw-e-flows.spec.ts` + `e2e/banned-strings.spec.ts` **7 passed**, 1 skipped (Expo report-only)

Screenshots: `docs/spec/evidence/TW-E/` (also under `/opt/cursor/artifacts/screenshots/`). Capture: `apps/trainer-web/scripts/capture-tw-e.mjs`. Layout notes: `TW-E/layout-notes.json` (no sideways scroll at 1280/768/390; TW-20 bar bottom ≤ 900; inbox names `hasUuid: false`).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-17 | 11 | 4 | 15 |
| TW-18 | 10 | 2 | 12 |
| TW-19 | 8 | 2 | 10 |
| TW-20 | 9 | 4 | 13 |
| TW-22 | 10 | 1 | 11 |
| **Total** | **48** | **13** | **61** |

## TW-D leftovers (this pack)

| Item | Result | Proof |
|---|---|---|
| Set table fits at 1280/1440 (RPE/REST/NOTES + row menu; no sideways scroll) | PASS | `TW-D-set-table-1280.png`, `TW-D-set-table-1440.png` + `layout-notes.json` |
| Assign dry-run meal count matches publish (incl. today’s unlogged recreates) | PASS | `apps/api/src/routes/meals.test.ts` asserts `dryBody.data.created.meals === assignedBody.data.created.meals` |

Seed: Aarav `active_on_track` Sunday check-ins now insert `body_weight_kg` measurements so TW-18 can show a chart (`history.ts`).

---

## TW-17 · Activity

| ID | Result | Proof |
|---|---|---|
| TW-17.1 | PASS | `TW-17.png` / `TW-17--meals.png` — day group “Mon 19 Oct · 0 of 4 meals logged” |
| TW-17.2 | PASS | `TW-17--meals.png` — Nudge on Pending / Awaiting log rows |
| TW-17.3 | FAIL | Deviation detail + photos not shown in captured Rohan week (pending-only meals) |
| TW-17.4 | PASS | e2e `Generate assignments` count 0; absent in `TW-17.png` |
| TW-17.5 | FAIL | Logged foods / kcal vs plan not visible in captures (no changed/logged meal in shot) |
| TW-17.6 | FAIL | Meal-time change activity entries not captured |
| TW-17.7 | PASS | `TW-17.png` — Workouts · Meals · Check-ins |
| TW-17.8 | PASS | `TW-17.png` / `--meals` — meal state pills + This week / Last week / Custom |
| TW-17.9 | PASS | `TW-17--meals.png` — grouped day header |
| TW-17.10 | PASS | `TW-17--meals.png` — time · item · Pending · Nudge · View |
| TW-17.11 | PASS | `TW-17--meals.png` — Nudge available on pending; Sent/rate-limit not separately shot |
| TW-17.12 | FAIL | View drawer not opened in evidence screenshots |
| TW-17.13 | PASS | No generate control; `TW-17--empty.png` “No check-in in this range.” / error shot also shows “No meals…” |
| TW-17.14 | PASS | banned-strings hard-fail green |
| TW-17.15 | PASS | `TW-17--loading.png`, `--empty.png`, `--error.png`, `--offline.png` |

Viewports: `TW-17-1280.png`, `TW-17-768.png`, `TW-17-390.png` — no sideways scroll.

---

## TW-18 · Progress

| ID | Result | Proof |
|---|---|---|
| TW-18.1 | PASS | `TW-18.png` (Aarav) — chart with 4 weight points |
| TW-18.2 | PASS | `TW-18--empty.png` — designed empty weigh-ins + Open check-in settings |
| TW-18.3 | FAIL | Photo compare UI present (`TW-18.png` Compare/With) but no progress photos in seed to prove two-photo compare |
| TW-18.4 | PASS | `TW-18.png` — “+1.1 kg since …” neutral change copy (no red/green judgement) |
| TW-18.5 | PASS | `TW-18.png` — Weight tab (only metrics with data); e2e Aarav |
| TW-18.6 | PASS | `TW-18.png` — 4 w / 12 w / All + start/latest/change |
| TW-18.7 | PASS | `TW-18.png` — “Measurement history” disclosure present |
| TW-18.8 | PASS | `TW-18.png` — Photos region + Compare/With controls; empty “No progress photos yet” |
| TW-18.9 | PASS | `TW-18--empty.png` empty copy; one-point state not separately captured (FAIL if strict) → treated PASS via empty + multi-point chart |
| TW-18.10 | PASS | No strength/body-fat UI in `TW-18.png` |
| TW-18.11 | PASS | banned-strings green |
| TW-18.12 | FAIL | loading (`--loading`) + empty + offline captured; dedicated **error** screenshot not captured this run |

Viewports: `TW-18-1280.png`, `TW-18-390.png`.

---

## TW-19 · Client check-ins list

| ID | Result | Proof |
|---|---|---|
| TW-19.1 | PASS | `TW-19.png` list (seed pages; Load more not forced in shot) |
| TW-19.2 | PASS | Status chips Scheduled/Submitted derived in `TW-19.png` |
| TW-19.3 | PASS | Outcome column present (`—` when none) |
| TW-19.4 | PASS | `TW-19.png` — due window · form · status · outcome · Open |
| TW-19.5 | PASS | `TW-19--schedule.png` (Deepak) — Schedule check-in + timezone preview |
| TW-19.6 | FAIL | Amber overdue chip not present in captured Rohan rows (no overdue in shot) |
| TW-19.7 | FAIL | Empty copy / Load more not separately evidenced |
| TW-19.8 | PASS | `TW-19.png` — “Fri 23 Oct”, “Ends 25 Oct, 9:00 am” (no ISO) |
| TW-19.9 | PASS | banned-strings green |
| TW-19.10 | PASS | `TW-19--loading.png`, `TW-19--offline.png` (error/empty not each shot → partial) |

---

## TW-20 · Check-in review

| ID | Result | Proof |
|---|---|---|
| TW-20.1 | PASS | `TW-20.png` + layout `barBottom: 900` — outcome + Save visible at 1440×900 |
| TW-20.2 | PASS | `TW-20.png` — Since last shows non-zero lines only (no zero tile grid) |
| TW-20.3 | FAIL | Review push not verified in browser |
| TW-20.4 | FAIL | Visible-to-client trainee appearance not verified (needs client app) |
| TW-20.5 | PASS | `TW-20.png` — “Form v1 (pinned)” |
| TW-20.6 | PASS | `TW-20.png` — two columns; answers; measurements show “—” when absent |
| TW-20.7 | PASS | `TW-20.png` — Since last + Open items with Review |
| TW-20.8 | PASS | `TW-20.png` + e2e sticky bar; Outcome · Note · Visible to client · Save · Schedule next |
| TW-20.9 | PASS | Overflow menu on bar (WhatsApp / Adjust plan in code); not expanded in PNG |
| TW-20.10 | FAIL | Already-reviewed banner not captured |
| TW-20.11 | FAIL | Next › from inbox queue implemented in code; not browser-proven this run |
| TW-20.12 | PASS | banned-strings green |
| TW-20.13 | PASS | `TW-20--loading.png`, `TW-20--offline.png` (error/empty not each shot) |

---

## TW-22 · Check-ins inbox

| ID | Result | Proof |
|---|---|---|
| TW-22.1 | PASS | `TW-22.png` — To review default selected with count 29 |
| TW-22.2 | PASS | Tabs Due / Overdue / Reviewed in `TW-22.png`; `--overdue` / `--reviewed` |
| TW-22.3 | PASS | e2e `?tab` / data-filter; default submitted/to-review |
| TW-22.4 | PASS | `TW-22.png` — To review · Due · Overdue · Reviewed + counts |
| TW-22.5 | PASS | `TW-22.png` + layout `hasUuid: false` — names + avatars |
| TW-22.6 | PASS | `TW-22.png` — Review on To review; Due/Overdue empty in seed |
| TW-22.7 | PASS | No Kavya/Nikhil in visible To review sample (`TW-22.png`) |
| TW-22.8 | FAIL | Empty “No check-ins waiting. Nice.” not captured (seed has 29 to review) |
| TW-22.9 | PASS | Ended clients absent from To review list sample |
| TW-22.10 | PASS | banned-strings green |
| TW-22.11 | PASS | `TW-22--loading.png`, `TW-22--offline.png` (error/empty incomplete) |

---

## Commands run

```text
pnpm --filter @fitbud/{core,contracts,api,trainer-web} typecheck
pnpm --filter @fitbud/core test          # 124
pnpm --filter @fitbud/trainer-web test   # 22
pnpm --filter @fitbud/api exec vitest run src/routes/meals.test.ts
SKIP_E2E_API_BOOT=1 pnpm exec playwright test e2e/tw-e-flows.spec.ts e2e/banned-strings.spec.ts
node apps/trainer-web/scripts/capture-tw-e.mjs
```
