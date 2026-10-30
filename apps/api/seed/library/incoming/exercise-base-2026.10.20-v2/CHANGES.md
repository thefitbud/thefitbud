# CHANGES: 2026.10.20-mvp → 2026.10.20-v2

The previous version is kept unchanged in `versions/2026.10.20-mvp/`. Everything below was produced by the pipeline (`pipeline/run_all.sh`). No data was edited by hand.

## Pipeline
- New stage `pipeline/04b_text.py`: ordered steps, one-sentence description, display names and aliases. It writes `interim/base_final.json` and `interim/naming_report.json`.
- `05_emit.py`: version 2026.10.20-v2. Adds new fields and xlsx columns, the naming and naming_conflicts sheets, and `exercise_library_instructions.csv/.sql`.
- `06_validate.py` now also checks:
  - step rows match the steps, numbered 1..n
  - steps_source and name_source use allowed values
  - every fitbud_written exercise is flagged
  - every wger step set has a licence
  - each exercise has 2-6 steps
  - the description is one sentence
  - no alias equals the name and no alias is duplicated
- `run_all.sh` saves the outputs of the previous version before writing the new one. `04_media.py` reuses media cached in `sources/media_cache/` instead of downloading it again. `lib/fb.py` finds the 10.3 library seed in `seed/previous/`.

## Data (1,371 exercises)
- Steps by source: free_exercise_db 399, wger 12 (CC BY-SA 4.0: 10, CC BY-SA 3.0: 2), fitbud_written 960 (pattern template 934, library-specific 26).
- Flagged for trainer review (`steps_review_required`): 960.
- Step rows: 6,600. Steps per exercise: 2 steps ×2, 3 ×100, 4 ×142, 5 ×1,034, 6 ×93.
- Name source: free_exercise_db 412, wger 55, library 14, user_csv 890. 402 exercises were renamed (see the xlsx `naming` sheet). Naming conflicts: 0. Duplicate names: 0. Aliases that equal another exercise's name: 0.
- Validation: 0 errors. 1 warning: 2 exercises have only 2 steps (Side Neck Stretch and Triceps Stretch, from free-exercise-db).

## Known issues for review
- Many free-exercise-db names are less tidy than the old library names, for example "Pushups" and "Barbell Bench Press - Medium Grip". Some wger names have typos or odd casing, for example "Dumbell Tate Press" and "knee push-ups". The old names are kept as aliases.
- Some free-exercise-db steps are long and keep their original wording and errors. For example, "Pushups" says hands "about 36 inches apart".
- The pattern-template steps are generic. One example is plyometric steps that mention "catch the ball". All of these are flagged for trainer review.
