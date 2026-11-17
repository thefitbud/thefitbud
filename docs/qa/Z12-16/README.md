# Z12-16 · Asked drawer + pain

Captures at 1440×900 against locked frames in `docs/design/mockups/png/`.
Demo: `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`.
Re-run: `TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-16/capture.mjs`.

| Frame | Viewport | Capture | Grade | Notes |
|---|---|---|---|---|
| `182-trainer-web-asked-drawer-web.png` | 1440×900 | `182-trainer-web-asked-drawer-web-1440x900.png` | **CLOSE** | Avatar + Asked coach chip, title, meal source card (Meal/Planned/Topic), helper, ink Reply on WhatsApp + Mark done. Seed lunch foods/date differ from frame sample; Planned line uses live prescription servings. |
| `183-trainer-web-asked-pain-web.png` | 1440×900 | `183-trainer-web-asked-pain-web-1440x900.png` | **CLOSE** | Coral Pain chip + “Pain topic. Reply today…” callout, workout source card, same footer actions. Seed uses Rajesh / Strength A (not frame’s Ishita / Lower body A). Topic label is “Pain” (`labelFor`); no free-text reason (“knee pain on lunges”) — CoachAsk has no reason field (D-W12b-1). |

design-review tool ran (`docs/qa/Z12-16/design-review.md`); ImageMagick not available for pixel scores — graded by eye.
