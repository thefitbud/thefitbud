# Incoming locked library artifacts (D-W1-7, option a)

These folders hold LOCKED release artifacts produced by the library pipeline outside this repo.
Do not edit them. Nothing here is loaded by `library-seed.ts` yet: I2b/I2c copy or read them into
`apps/api/seed/library/` and wire them in. The 2026.10.2 files in `apps/api/seed/library/` are unchanged.

## `2026.10.9/` — foods library release 2026.10.9 (locked)
- Source: pipeline output `fitbud/library/seed/` (manifest `seed_version` = `2026.10.9`).
- `manifest.json`, `library-2026.10.9.json` (JSON export), `sql/01_lookups.sql` … `sql/06_seed_version.sql`.
- Every file's sha256 and byte size match `manifest.json` (verified when committed).
- `ATTRIBUTION.md`: data attribution from the library review (I2b target: `apps/api/seed/library/ATTRIBUTION.md`).
- `02b_food_extras.sql` and `08_post_seed.sql` are not pipeline artifacts; I2b (and I2f) author them.

## `exercise-base-2026.10.21-v3/` — exercise base 2026.10.21-v3 (locked by Firoz, 22 Oct 2026)
- Source: pipeline output `fitbud/exercise-base/` (top level = 2026.10.21-v3; supersedes 2026.10.20-v2).
- `exercises.json` (1,362 exercises, each with `youtube_search_url`), `exercise_library_instructions.{sql,csv}`,
  `exercise_links.csv`, `validation_report.json` (1,362 exercises, 919 media files, no errors), `README.md`, `CHANGES.md`,
  `MEDIA_ATTRIBUTION.md`. I2c's `scripts/emit-exercise-base.ts` reads these to emit `sql/03b_exercise_base.sql`.
- `media/`: the exercise drawings (919 files: 918 PNG + 1 JPG, ~42 MB total, largest ~0.4 MB) are part of the lock and
  committed here. They are uploaded to R2 under env-agnostic keys `exercises/<slug>/<n>.<ext>`; attribution for every
  image is in `MEDIA_ATTRIBUTION.md`.
- Not included: `exercises.xlsx` (spreadsheet view of `exercises.json`), pipeline inputs/sources/versions, `redirects.csv`; no spec uses them.

Note: D-W1-7 in `docs/specs/batches/W1.md` (PR #73) names `exercise-base-2026.10.20-v2`; the locked version is v3.
