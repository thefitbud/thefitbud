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

## `exercise-base-2026.10.20-v2/` — exercise base 2026.10.20-v2 (locked)
- Source: pipeline output `fitbud/exercise-base/versions/2026.10.20-v2/` (v2, not later versions).
- `exercises.json`, `exercise_library_instructions.{sql,csv}`, `validation_report.json`, `README.md`, `CHANGES.md`, `MEDIA_ATTRIBUTION.md`.
  I2c's `scripts/emit-exercise-base.ts` reads these to emit `sql/03b_exercise_base.sql`.
- Media binaries (`media/`, ~42 MB, 929 images) are NOT committed. The DB stores only env-agnostic keys
  `exercises/<slug>/<n>.<ext>`; the image files are uploaded to R2 per the handoff manifest
  `exercise_media_r2_manifest.csv` (columns: exercise_id, slug, n, local_file, key, content_type, source, licence, attribution).
  Attribution for every image stays in `MEDIA_ATTRIBUTION.md`.
- `exercises.xlsx` omitted (a spreadsheet view of `exercises.json`; no spec uses it).
