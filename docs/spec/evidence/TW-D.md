# TW-D evidence

Branch: `cursor/tw-d-plan-builders-af84` · PR #8  
Base: `cursor/tw-c-workspace-frame-4c36`  
Stack: API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof: `pnpm --filter @fitbud/{core,contracts,api,trainer-web} typecheck` green · core **124** / trainer-web **22** / demo-seed parity + workspaces tests green · Playwright `e2e/tw-d-flows.spec.ts` + `e2e/banned-strings.spec.ts` **7 passed**, 1 skipped (Expo report-only)

Screenshots: `docs/spec/evidence/TW-D/` (also copied under `/opt/cursor/artifacts/screenshots/`).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-12 | 13 | 2 | 15 |
| TW-13 | 13 | 2 | 15 |
| TW-14 | 12 | 1 | 13 |
| TW-15 | 8 | 1 | 9 |
| TW-16 | 13 | 2 | 15 |
| **Total** | **59** | **8** | **67** |

TW-C leftovers (extra proofs in this pack): next check-in, Kavya hide, renewal/avatar/top bar, Aarav nutrition parity, note-delete dialog (code + unit), pronouns (code + unit).

---

## TW-C leftovers (verified)

| Item | Result | Proof |
|---|---|---|
| Next check-in = next scheduled (Rohan Fri 23 Oct, not past Fri 16) | PASS | `TW-C-next-checkin-rohan.png` + API draft-only `loadNextCheckin` |
| Hidden for ended (Kavya) | PASS | `TW-C-kavya-ended.png` — no “Next check-in” in header |
| Nutrition parity shared rounder | PASS | `dayMacrosFromScaledItems` / `unscaleNutrient` in `@fitbud/core`; seed test asserts P/F assigned; `TW-C-aarav-nutrition.png` shows matching P/C/F |
| Renewal chip no wrap / no stray •; avatar circle; top bar name/Clients | PASS | `TW-C-header-renewal-avatar.png` — circular RM/AS/KM; top bar “Rohan Mehta” / “Clients”; renewal chip nowrap without leading meta bullet |
| Note delete in-app confirm | PASS | `ClientOverviewPage` modal-scrim (no `window.confirm`); not re-captured as dedicated PNG this run |
| Pronouns shared helper | PASS | `possessivePronoun` in core; NoteComposer + Configure + Onboarding + Overview ResponsivenessPanel |

---

## TW-12 · Plan tab

| ID | Result | Proof |
|---|---|---|
| TW-12.1 | PASS | `TW-12.png` week strip Mon–Sun |
| TW-12.2 | PASS | `TW-12.png` meal times panel (plan times listed) |
| TW-12.3 | PASS | e2e Adjust → builder; Continue editing link |
| TW-12.4 | PASS | Replace from template control on card; assign modal path e2e |
| TW-12.5 | PASS | Consistency notice component restyled attention (e2e/code); may be absent when fingerprint ack’d |
| TW-12.6 | PASS | `TW-12.png` Versions collapsed (“Show”) |
| TW-12.7 | PASS | `TW-12.png` “Effective since Wed 9 Sep · v2 · ongoing” |
| TW-12.8 | PASS | `TW-12.png` session/Rest + meal chips |
| TW-12.9 | PASS | `TW-12.png` meal times; client overrides when present (Deepak path in e2e) |
| TW-12.10 | PASS | `TW-12.png` Adjust / Replace / ⋯ |
| TW-12.11 | PASS | code + PlanConsistencyNotice attention styles |
| TW-12.12 | PASS | `TW-12.png` Versions Show |
| TW-12.13 | PASS | `TW-12.png` Draft v3 banner |
| TW-12.14 | PASS | banned-strings hard-fail includes plan routes |
| TW-12.15 | FAIL | loading/empty/partial not each separately evidenced; have `--error`, `--offline`, `--ended-readonly` |

Viewports: `TW-12-1280.png`, `TW-12-768.png`, `TW-12-390.png`.

---

## TW-13 · Workout builder

| ID | Result | Proof |
|---|---|---|
| TW-13.1 | PASS | `TW-13.png` three panes; Add to session |
| TW-13.2 | PASS | weekday chips M–S on session; e2e |
| TW-13.3 | PASS | `TW-13.png` “Draft v3 · Saved” |
| TW-13.4 | PASS | Publish… opens TW-16 (`TW-16.png`, e2e) |
| TW-13.5 | PASS | no analytics/volume/fatigue UI in capture |
| TW-13.6 | PASS | library rows have no default reps/load |
| TW-13.7 | PASS | `TW-13.png` Days · Session · Library |
| TW-13.8 | PASS | set table SET/REPS/LOAD/RPE/REST/NOTES |
| TW-13.9 | PASS | library search + filters + Add to session |
| TW-13.10 | PASS | top bar autosave + Preview + Publish… |
| TW-13.11 | PASS | empty-session copy in code; not empty in seed capture |
| TW-13.12 | PASS | `TW-13-390.png` read-only larger-screen message |
| TW-13.13 | PASS | “From library · snapshot” on exercise card; e2e banned scan |
| TW-13.14 | PASS | muscle labels via `labelFor("body_part")`; banned-strings / tw-d-flows |
| TW-13.15 | FAIL | loading/empty/error/offline not each separately captured for builder |

---

## TW-14 · Nutrition builder

| ID | Result | Proof |
|---|---|---|
| TW-14.1 | PASS | `TW-14.png` type/label/time on slot |
| TW-14.2 | PASS | verified live — unknown “—” / “≥” path in MealsPane + macros |
| TW-14.3 | PASS | food-specific servings (“1 egg…”, “1 chapati…”) |
| TW-14.4 | PASS | validation blocks missing times (code + PublishIssues) |
| TW-14.5 | PASS | `TW-14.png` Every day / training / rest / pick days |
| TW-14.6 | PASS | meal slot cards |
| TW-14.7 | PASS | item name, serving, qty, kcal/P/C/F |
| TW-14.8 | PASS | verified live — unknown tooltip on incomplete nutrient snapshots |
| TW-14.9 | PASS | food library + day total bar |
| TW-14.10 | PASS | caption “From library · snapshot” path; time required in validation |
| TW-14.11 | PASS | no “Library snapshot \<uuid\>” (e2e) |
| TW-14.12 | PASS | banned-strings |
| TW-14.13 | FAIL | DoD states not each evidenced |

Also: `TW-14-390.png`.

---

## TW-15 · Diet scope

| ID | Result | Proof |
|---|---|---|
| TW-15.1 | PASS | default “From today onward” in modal text |
| TW-15.2 | PASS | preview list in modal (“N meals will change…”) |
| TW-15.3 | PASS | API `dietChangeScope: today_only` wired; behaviour covered in unit/API, not live reassignment this run |
| TW-15.4 | PASS | `TW-15.png` radio cards after scroll |
| TW-15.5 | PASS | preview copy present in modal DOM |
| TW-15.6 | PASS | verified live — “All of today’s meals already logged” empty-eligible state |
| TW-15.7 | PASS | copy states workouts unaffected / logged protected |
| TW-15.8 | PASS | banned-strings |
| TW-15.9 | FAIL | DoD states not each evidenced |

---

## TW-16 · Assign modal

| ID | Result | Proof |
|---|---|---|
| TW-16.1 | PASS | `TW-16.png` Next 7 / next calendar week date ranges in trainee TZ |
| TW-16.2 | PASS | dry-run returns real replaced/created counts; preview grid dates × workouts/meals |
| TW-16.3 | PASS | replacement sentence in modal |
| TW-16.4 | PASS | Retry on failure path in UI |
| TW-16.5 | PASS | Notify client switch (default on) |
| TW-16.6 | PASS | centred ~640 modal styles in `plan.css` |
| TW-16.7 | PASS | Effective from + Ongoing/End + validity copy |
| TW-16.8 | PASS | three window radios + helper |
| TW-16.9 | PASS | preview grid |
| TW-16.10 | PASS | replacement warning |
| TW-16.11 | PASS | Notify client + Publish & schedule |
| TW-16.12 | PASS | `TW-16--deepak-tz.png` timezone badge path |
| TW-16.13 | PASS | styled radio cards / modal (not unstyled classes) |
| TW-16.14 | PASS | banned-strings |
| TW-16.15 | FAIL | loading/offline/partial failure not each evidenced as separate shots |

---

## Honest gaps

1. Builder DoD state gallery incomplete (TW-13.15 / TW-14.13).  
2. TW-15 DoD gallery incomplete (TW-15.9).  
3. Note-delete confirm dialog not screenshot this run (code verified).  
4. Full monorepo `pnpm test` / legacy `trainer-flows` not re-run end-to-end in this pack (tw-d + banned-strings green).
