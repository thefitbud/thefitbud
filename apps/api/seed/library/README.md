# FitBud library seed (v2)

Provenance: bundle `fitbud-library-v2` release **2026.10.2**. The generation pipeline lives outside this repo; these artifacts are the loadable output only.

## Contents

- `sql/01_lookups.sql` … `sql/06_seed_version.sql` — idempotent global library rows (FTS in `05_search.sql`).
- `library-2026.10.2.json` — canonical JSON export for review and tooling.
- `manifest.json` — per-file `sha256` checksums (verify after copy).
- `ATTRIBUTION.md` — in-app attribution text.

## Local load

From the repo root:

```bash
pnpm db:seed:library
```

This runs `00_wipe_legacy_dev.sql`, seed `01`–`06`, `07_post_wipe_dev.sql`, then rebuilds FTS (`05_search.sql` again).

**Note:** `wrangler d1 export` cannot export FTS virtual tables. Drop or exclude `food_search_fts` / `exercise_search_fts` before export and re-run `05_search.sql` after import.

Importing `02_foods.sql` (~15 MB) can take several minutes locally.
