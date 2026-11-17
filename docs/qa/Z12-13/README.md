# Z12-13 · Templates hub, mine empty, use and fork

Captures at 1440×900 against locked frames 168, 169, 174, 175. Demo trainer
`rahul.coach@demo.fitbud.test`. Frame 169 Mine empty stubbed via Playwright
route (seed has Rahul diet templates).

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| 168 templates hub | `168-trainer-web-templates-web-1440x900.png` | **CLOSE** | Unified table + Type/Owner/Status filters + ink New template. Owner chips and Use column match. Used by always "—" (no usage API — D-W12b-1 follow-up). Status always Published (no draft/archived on plan/form template summaries). Quiet Libraries link kept for Z12-14 routes. Row meta uses live structure summary when detail has loaded; sample titles differ from frame. |
| 169 mine empty | `169-trainer-web-templates-mine-empty-web-1440x900.png` | **MATCH** | Nutrition + Owner: Mine empty card; icon tile; "Show FitBud base" / "Clear filters"; filter chrome kept. |
| 174 use | `174-trainer-web-template-use-web-1440x900.png` | **CLOSE** | Client select with avatar initials + "Ready to coach"; "Open draft"; X close; ink primary. Copy uses first name (frame uses "him"). Seed client Ananya, not Vikram. |
| 175 fork | `175-trainer-web-template-fork-web-1440x900.png` | **MATCH** | Title "Make your own copy"; Name field; draft copy; Cancel + ink "Make copy". Default name `{title} - {trainer first}`. |

## Checks

- Unit: `TemplatesHub.test.tsx` (table, mine empty, use, fork) pass
- `rawEnumGuard` templates routes pass
- `pnpm --filter @fitbud/trainer-web lint` pass
- `pnpm --filter @fitbud/trainer-web typecheck` pass
- design-review tool: skip — "design-review tool not on main yet" (spec until Z11-1); eye grades above

## Scripts

```bash
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-13/capture.mjs
```

## Decide-and-note

- Type filter labels follow locked frames (Nutrition / Intake form / Check-in form), not older TW-23 "Diets / Onboarding" tab names.
- Full-plan (combined) templates appear under All (and `/templates/full-plans`); not a type chip.
- Status/Used-by columns present for layout; values honest given API (Published / —). Draft or Archived status filter empties the list.
- Fork entry on FitBud bases is overflow "Make your own copy" (frame Use column only shows Use).
- New template: type-specific when a type filter is on; menu when All.
