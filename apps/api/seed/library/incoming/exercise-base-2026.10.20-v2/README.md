# FitBud exercise base (2026.10.20-v2)

Previous version: `versions/2026.10.20-mvp/` (all outputs and media). What changed: `CHANGES.md`.

This base combines the user's CSV with the FitBud library (353 entries, stable ids and slugs kept) and removes duplicates. It uses the library's controlled vocabularies.

## Outputs
- `exercises.json`: all exercises. Each one has its facts, steps/cues/mistakes with provenance, relations, media (with licence and author), `bysa_text` (wger CC BY-SA text, kept separate), source matches, the AI review (verdict and confidence), `review_flags` and `needs_human_review`.
- Each exercise also has `name_source` (free_exercise_db | wger | library | user_csv), `description` (one sentence, FitBud wording built from the facts), `steps` (ordered, numbered from 1), `steps_source` (free_exercise_db | wger | fitbud_written), `steps_licence` (licence, author, source URL) and `steps_review_required` (true for every fitbud_written exercise). `instructions` holds the rows for `exercise_library_instructions`.
- `exercise_library_instructions.csv` / `.sql`: one row per step, cue and mistake (kind, position from 1, text, lang, provenance), ready for the table in `library/schema/0021_library_v2.sql`.
- `exercises.xlsx`: sheets summary, exercises (name, name_source, aliases, description, step_1..step_6, steps_source, steps_licence, steps_review_required come first; the last two columns are for human review), naming (every rename), naming_conflicts, media, csv_match_report (one row per CSV line), open_sources_only, no_drawing, vocab (including the CSV→FitBud maps).
- `media/<slug>/`: drawings with commercial-use licences only (CC BY-SA 3.0/4.0 in this build). Attribution is in `MEDIA_ATTRIBUTION.md`.
- `validation_report.json`: required fields, vocabulary values, duplicate ids/slugs/names, broken media paths, licence/attribution, dangling relations, orphan files.

## Re-run
```
./pipeline/run_all.sh            # uses cached sources in sources/
./pipeline/run_all.sh --refetch  # refreshes the wger API data and the Commons category index
```
Steps: 01_fetch (wger) → 02_commons_index (Commons drawings plus per-file licence) → 03_build (CSV clean, dedupe, match, union, relations) → 04_media (Everkinetic → wger → Commons → parent-movement "variant"; media/ is rebuilt, reusing files cached in sources/media_cache/) → 04b_text (steps, description, display names) → 05_emit → 06_validate (exits 1 on errors).
Inputs: `input/user_exercises.csv`, `/workspace/fitbud/library/seed/library-2026.10.3.json`, and the local copies of free-exercise-db and Everkinetic under `/workspace/fitbud/sources/x/`. Requires python3 and openpyxl. run_all.sh first copies the current outputs to `versions/<old version>/` if the version is changing. The library seed 2026.10.3 is read from `library/seed/` or `library/seed/previous/`.

## Provenance rules
- CSV: facts only (name, muscles, equipment, type, level). Its text is not used. The CSV appears to be listing data derived from Muscle & Strength.
- Steps, in this order: (1) free-exercise-db (Unlicense) for high-confidence matches. Its text is split or merged into 3-6 ordered steps, and calorie, tip and intro sentences are removed. (2) wger, only when the text licence allows commercial use (CC BY-SA 3.0/4.0, CC BY 4.0, CC0) and the description is a real step list. The licence and author are recorded, and CC BY-SA steps need attribution and share-alike. (3) Otherwise FitBud-written steps in our own words: the library's own steps (`ai_authored:specific`) or the movement-pattern template (`ai_authored:pattern`), flagged `steps_fitbud_written_trainer_review`. Library entries whose source steps were judged thin keep the library's steps.
- Display name, in this order: free-exercise-db name → wger name (high-confidence match) → library name → cleaned CSV name. All other names are kept as aliases. Slugs and ids do not change. If two exercises would get the same canonical name, the second one falls back to its next name and this is listed in naming_conflicts.
- Description: one sentence built from the facts (pattern, equipment, muscles) in FitBud's own words.
- Cues and mistakes are FitBud-authored, by pattern.
- No text was taken from M&S, ExRx, ACE or other proprietary sites. Excluded images: free-exercise-db, ExerciseDB/Gym Visual, MuscleWiki, M&S, wger photos and AI-generated images, unlicensed files.
- Verdicts are rule-based (`ai:fitbud-reviewer-rules`), not a human review. Confidence values are heuristic estimates.
