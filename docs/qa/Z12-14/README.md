# Z12-14 · Intake form builder + libraries

Captures at 1440×900 against locked frames 170, 172, 173. Demo trainer
`rahul.coach@demo.fitbud.test`.

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| 170 intake builder | `170-trainer-web-intake-form-builder-web-1440x900.png` | **CLOSE** | Question list + right Question panel; Preview + Publish vN; ink primary. Seed form is “Quick intake — returning client” (Mine), not FitBud standard intake. Meta is `Onboarding form · N questions` (no sections in the onboarding field model — follow-up). |
| 172 foods library | `172-trainer-web-library-foods-web-1440x900.png` | **CLOSE** | Food + Serving · kcal; list + drawer macros use `calculateServingNutrients` (serving-scaled, not raw per-100g). Source filter; FitBud base note; ink Make my copy. Segment/pill touch targets ≥44px. Outer Templates chrome from TemplatesHub (Z12-13; out of files_owned). Used in always “—” (no usage API — D-W12b-1). Segment counts omitted (no total count API). Sample titles/kcal differ from frame. |
| 173 exercises library | `173-trainer-web-library-exercises-web-1440x900.png` | **CLOSE** | Exercise / Equipment / Source columns; Source filter; equipment pills ≥44px; “Logged by clients, not in library” card. Card is honest empty (no free-text library feed API — D-W12b-1). Outer Templates chrome from hub. |

## Checks

- Unit: `OnboardingTemplateBuilderPage.test.tsx`, `LibrariesPanel.test.tsx` pass (incl. non-100g serving scale: 150 g → 398 kcal)
- `pnpm --filter @fitbud/trainer-web lint` pass
- `pnpm --filter @fitbud/trainer-web typecheck` pass
- e2e TW-24 / TW-26 expectations updated for list+panel and new columns
- design-review tool: skip — "design-review tool not on main yet" (spec until Z11-1); eye grades above

## Scripts

```bash
TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-14/capture.mjs
```

## Decide-and-note

- Publish wording uses `Publish v{next}` for trainer-owned drafts (frame); global stays Fork to edit.
- Preview opens a modal phone preview; right pane stays the Question editor.
- Source filter is client-side on the loaded page (API has no ownership query — follow-up).
- Logged-by-clients card is present with honest empty copy; no invented free-text rows.
- Kcal / macro drawer values are rounded whole numbers for frame parity.
- List + drawer macros are serving-scaled via `calculateServingNutrients` (same pick as BuilderLibraryList: first serving with `conversionScaled`), not raw per-100g.
