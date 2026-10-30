# CHANGES: 2026.10.21-v3 (previous version kept in versions/2026.10.20-v2/)

## Count
- 1,362 exercises (was 1,371). 9 duplicate CSV rows were merged into their library entries (`pipeline/curation/merge_duplicates.tsv`; old slugs in `redirects.csv`). **This merge needs your confirmation.**

## Names
- 525 display names were cleaned: standard spelling (Dumbbell), Push-up style, '- Medium Grip'-style suffixes dropped, Title Case.
- Every previous name is kept as an alias.
- Result: 0 duplicate display names and 0 alias collisions.

## Steps
- Every step set passes `lib/steps_check.py`: equipment, force direction, body position, switching sides, no placeholders, 3-6 steps, no duplicate steps, plus wording and cardio checks.
- 952 FitBud-written step sets were written and validated one row at a time:
  - 844 from the writer
  - 108 hand-written after the writer failed or after quality review
- 161 of the 410 source step sets failed the validator:
  - 40 were edited (for example, the push-up "36 inches" sentence was removed and "switch sides" steps were added)
  - 121 were replaced with FitBud-written steps
- Steps by source: free_exercise_db 281, wger 8, fitbud_written 1,073. All 1,073 FitBud-written step sets are flagged for trainer review.
- Steps use our own wording; no M&S text.
- Descriptions: each curated row has its own one-sentence description.

## Links
- Every exercise has a `youtube_search_url`, built from its final display name (in json, xlsx and `exercise_links.csv`).

## Validation
- 0 errors, 0 warnings. The step validator gives 0 flags across all 1,362 exercises.
