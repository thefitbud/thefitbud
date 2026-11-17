# Z12-6 · Client overview + week nav

Captures against locked frames 03, 03-full, 03b (1440×900) and 192 (1024×768).
Demo trainer `rahul.coach@demo.fitbud.test`, Rohan overview. Body work only
(D-W12b-3): week ‹ ›, `· week N`, drop raw kcal prose, Recent activity absolute
dates + status. Header / WhatsApp / iPad meta deferred to Z12-53.

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| 03 this week | `03-trainer-web-client-rohan-1440x900.png` | **CLOSE** | Week arrows + `· week N` aligned with header; Today selected; rings without raw kcal prose; day ‹ ›. Seed counts/titles differ from sample frame. Header wrap / WhatsApp → Z12-53. |
| 03-full | `03-trainer-web-client-rohan-full-1440x900.png` | **CLOSE** | Same as 03; Recent activity absolute civil dates + semantic status (Missed / Reviewed / Pending). No raw `P/C/F` line under rings. |
| 03b prev week | `03b-trainer-web-client-overview-prev-week-1440x900.png` | **CLOSE** | `Week N` title, date range, This week pill, Wed selected. Past-day rings omitted — week API only returns trainee-today macros (D-W12b-1 follow-up). |
| 192 iPad | `192-ipad-client-ipad-1024x768.png` | **CLOSE** | Week arrows + week N at 1024×768. Header meta wrap / WhatsApp label / iPad side-column copy → Z12-53 (D-W12b-3). |

## Checks

- `ClientOverviewPage.test.tsx` (22) pass
- `pnpm --filter @fitbud/trainer-web lint` pass
- `pnpm --filter @fitbud/trainer-web typecheck` pass
- design-review tool: skip — "design-review tool not on main yet" (spec until Z11-1); eye grades above

## Scripts

```bash
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-6/capture.mjs
```

## Decide-and-note

- Week index matches `WorkspaceHeader`’s `relationshipWeek` (elapsed ms), not Monday-diff from start; past weeks subtract the Monday offset so `· week N` stays in sync with the header.
- Trainee-local today comes from `todayNutrition.date` after load so IST/UTC date-line does not leave browser-today selected without rings.
- Past-day / past-week nutrition rings need a day-scoped week API (or meal macros on the day strip) — noted as follow-up under D-W12b-1; UI still navigates days and shows meal counts in the nutrition label.
