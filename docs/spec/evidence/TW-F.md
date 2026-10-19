# TW-F evidence

Branch: `cursor/tw-f-templates-libraries-131b` · PR #10  
Base: `cursor/tw-e-activity-checkins-e531`  
Stack: API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof: `pnpm --filter @fitbud/{contracts,core,api-client,api,trainer-web} typecheck` green · trainer-web unit (templates + http-api) **24** · core checkin **6** · Playwright `e2e/tw-f-flows.spec.ts` + `e2e/banned-strings.spec.ts` **7 passed**, 1 skipped (Expo report-only)

Screenshots: `docs/spec/evidence/TW-F/` (also under `/opt/cursor/artifacts/screenshots/`). Capture: `apps/trainer-web/scripts/capture-tw-f.mjs`. Layout notes: `TW-F/layout-notes.json` (no sideways scroll at 1280/768/390 for TW-23).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-23 | 14 | 3 | 17 |
| TW-24 | 9 | 2 | 11 |
| TW-25 | 6 | 3 | 9 |
| TW-26 | 10 | 2 | 12 |
| TW-27 | 7 | 1 | 8 |
| **Total** | **46** | **11** | **57** |

---

## TW-23 · Templates hub

| ID | Result | Proof |
|---|---|---|
| TW-23.1 | PASS | `TW-23.png` — Workouts · Diets · Full plans · Check-ins · Onboarding · Libraries; URLs via e2e `/templates` → workouts |
| TW-23.2 | PASS | `TW-23.png` — All / FitBud bases / Mine + search + New workout template |
| TW-23.3 | PASS | `TW-23.png` / `TW-27.png` — FitBud base cards show Use + Fork to edit |
| TW-23.4 | PASS | `TW-23.png` — Mine cards show Edit + ⋯ |
| TW-23.5 | PASS | e2e + UI copy “Forms in use can't be deleted” on form tabs; plan delete confirm dialog in code |
| TW-23.6 | PASS | `TW-23.png` — no usage counts / Verified / ratings |
| TW-23.7 | PASS | `TW-23-390.png` — hub tabs scroll horizontally (flex-nowrap + overflow-x) |
| TW-23.8 | PASS | Same as .1; Back via browser history / tab NavLinks |
| TW-23.9 | PASS | `TW-23.png` — scope counts All 7 / FitBud bases 5 / Mine 2 |
| TW-23.10 | FAIL | Cards show title · owner · Updated date, but structure line often falls back to “Workout” (detail prefetch not always reflected in capture) |
| TW-23.11 | PASS | `TW-23.png` — Use/Fork vs Edit/⋯ |
| TW-23.12 | PASS | Labels Diets / Full plans; banned-strings green |
| TW-23.13 | PASS | `TW-23--empty.png` (Mine empty copy) · `TW-23--empty-search.png` (“No templates match 'pcod'.”) |
| TW-23.14 | PASS | `TW-23-390.png` |
| TW-23.15 | PASS | `TW-23.png` + e2e — list loads; no “Could not load this list” |
| TW-23.16 | PASS | banned-strings hard-fail green on `/templates` |
| TW-23.17 | FAIL | loading/empty/offline captured (`--loading`, `--empty`, `--offline`); dedicated **error** Retry screenshot not captured this run |

Viewports: `TW-23-1280.png`, `TW-23-768.png`, `TW-23-390.png` — no sideways scroll.

---

## TW-24 · Onboarding form builder

| ID | Result | Proof |
|---|---|---|
| TW-24.1 | PASS | `TW-24.png` / `--mine.png` — type select includes six MVP types; builder helpers tested |
| TW-24.2 | PASS | `TW-24.png` — Up / Down / Duplicate / Delete on each question |
| TW-24.3 | PASS | `TW-24.png` — live phone preview pane |
| TW-24.4 | PASS | `TW-24--mine.png` — Save version on Mine fork; API creates version |
| TW-24.5 | PASS | `TW-24.png` — two panes + phone preview |
| TW-24.6 | PASS | `TW-24.png` — label, help, required, type, Highlight for coach |
| TW-24.7 | PASS | Type select options + `onboardingBuilder` / unit tests |
| TW-24.8 | PASS | `TW-24--mine.png` — Draft · will save as vN + Save version |
| TW-24.9 | PASS | Choice validation ≥2 options in `buildFields`; duplicate-label warning in UI |
| TW-24.10 | PASS | banned-strings green |
| TW-24.11 | FAIL | loading/error/offline not each captured as named TW-24 state shots this run |

---

## TW-25 · Check-in form builder

| ID | Result | Proof |
|---|---|---|
| TW-25.1 | PASS | e2e fork CTA on base; fork modal + Mine editor path |
| TW-25.2 | FAIL | Trainee dynamic form wired (`GET /checkins/:id/form` + Expo `CheckinScreen`) but **not verified in a browser/Expo session** this run |
| TW-25.3 | FAIL | Measurement → measurement records is API/core (`linkedMeasurementsForCheckin`); not browser-proven here |
| TW-25.4 | PASS | `TW-25.png` — two-pane builder + phone preview after load |
| TW-25.5 | PASS | Builder offers Measurement / Progress photos / Scale 1–5 add actions + field types |
| TW-25.6 | PASS | No sleep/HRV fields in UI |
| TW-25.7 | PASS | `TW-25.png` — FitBud base read-only + Fork to edit |
| TW-25.8 | PASS | banned-strings green |
| TW-25.9 | FAIL | Dedicated TW-25 loading/empty/error/offline evidence shots incomplete |

---

## TW-26 · Libraries

| ID | Result | Proof |
|---|---|---|
| TW-26.1 | PASS | `TW-26.png` — sticky thead + Load more (25/page) |
| TW-26.2 | PASS | No default reps/load columns; e2e asserts absent |
| TW-26.3 | PASS | `TW-26--foods.png` — basis + macros + servings count |
| TW-26.4 | PASS | Archive confirm dialog (not hard delete wording) in UI |
| TW-26.5 | PASS | `TW-26.png` — required columns + sticky header |
| TW-26.6 | PASS | e2e + `TW-26.png` |
| TW-26.7 | PASS | `TW-26--foods.png` |
| TW-26.8 | PASS | Food drawer fields in code (basis, nutrients, servings “1 katori”, aliases); drawer not opened in PNG |
| TW-26.9 | PASS | Global overflow “Duplicate to mine”; Archive for Mine |
| TW-26.10 | PASS | Empty-search copy in code; paging via Load more (`TW-26.png`) |
| TW-26.11 | PASS | banned-strings green |
| TW-26.12 | FAIL | loading/error/offline library states not each screenshot-proven |

Viewports: `TW-26-390.png`.

---

## TW-27 · Use and fork

| ID | Result | Proof |
|---|---|---|
| TW-27.1 | PASS | Use modal copy + `applyPlanTemplate` → draft editor route (e2e/modal) |
| TW-27.2 | PASS | `TW-27--fork.png` / `--after-fork.png` + e2e lands on `/templates/workouts/:id` |
| TW-27.3 | PASS | `TW-27.png` — client list without Kavya/Nikhil; draft copy text |
| TW-27.4 | PASS | e2e / navigation to `/clients/.../plan/.../edit` after Create draft |
| TW-27.5 | PASS | `TW-27--fork.png` — “Copy of …” + FitBud base won’t change |
| TW-27.6 | PASS | `TW-27--after-fork.png` — template editor after fork |
| TW-27.7 | PASS | banned-strings green |
| TW-27.8 | FAIL | Modal error/offline states not separately screenshot-proven |

---

## Notes

- Structure summaries on hub cards (days · exercises) depend on async `getPlanTemplate` prefetch; captures often show type label only → TW-23.10 FAIL.
- TW-25 trainee end-to-end (Expo sees new questions) implemented in code but not browser-verified → FAIL.
- Aliases for foods stored via notes (`Aliases: …`) until library API exposes `aliases[]` on create/update.
