# Trainee Today: progress card redesign
How it's built: only the ring card is replaced. Each HTML page overlays the new card on the current 04-trainee-today-ios.png in the same slot (y 176–414 pt), so the rest of Today is pixel-identical. Rendered at 393×852 @2x with Playwright (render.mjs). Fonts and tokens come from docs/spec/mockups/html.

## Critique of the current card
See ../review.md #1.

## Options
- **A: three rings only** (Workout, Meals, Steps). Big and clear. Nutrition drops to a single text line with a Diet link. Simplest, but it loses the macro detail coaches set.
- **B: kcal ring + macro bars + status chips.** Follows TR-07 decision 3 exactly. Nutrition-first, but workout and meals become small chips, and the ring is still about food.
- **C: recommended.** A row of three tappable 44pt+ tiles: Workout (one segment), Meals (segmented, one segment per planned meal, e.g. 2 of 5) and Steps (continuous), each in its own lavender tile with the label and count outside the ring. Below that, a "Food today" strip: 460 of 1,850 kcal on one indigo bar, plus Protein, Carbs and Fat as "24 of 110 g" text.
  - Colours: indigo, navy and teal from the tokens. Each metric is also separated by position, label, segment shape and a done checkmark, so it's colour-blind safe.
  - States: empty, partial, done (green tile and check) and rest day (dashed neutral ring, "Recovery · Next: Mon").
  - No %, streaks or "left".

Files: sbs-today-rings.png (current vs C), options-today-rings.png (A/B/C), states-today-rings.png, plus option-*.html/png and gen.py.
