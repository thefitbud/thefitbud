# QA-I2b · foods library 2026.10.9

Branch `claude/W1-library-lane`, 31 Oct 2026. Non-UI task, no frames.

## Numbers (local D1 after `pnpm db:reset`, demo seed loaded)

| Check | Expected | Result |
|---|---|---|
| `manifest.json` `seed_version` / `counts.foods` | 2026.10.9 / 1243 | 2026.10.9 / 1243 |
| sha256 + bytes of the 7 manifest files | match | match (`library-2026-10-9.test.ts`) |
| `SELECT count(*) FROM food_library_items WHERE ownership='global'` | 1243 | 1243 |
| Foods without exactly one default serving | 0 | 0 |
| `library_seed_versions` | 2026.10.9, 1243 foods | 2026.10.9, 1243 foods |
| `food_type` / `cooking_state` outside the D6 sets | none | none |
| `pragma_foreign_key_check` rows | 0 | 0 |
| `02b_food_extras.sql` | comments only | comments only (skipped by `library-seed.ts`: wrangler rejects a file with no statement) |

## Demo seed

The current demo seed used 16 food slugs that 2026.10.9 does not have. Owner decision (31 Oct): remap each to the closest dish, which replaces the post-beta I2e remap for these slugs. The full table is in the PR. Rohan's base plan is 1,745 kcal / 101 g protein (test band 1,700–2,000 kcal, ≥ 90 g).

Release serving changes for foods still in the seed:
- Sprouted moong chaat now defaults to a katori, and black tea is measured by volume. The generator now keeps a metric template amount ("100 g", "100 ml") on the metric serving.
- Greek yogurt is gram-only, so N09's 170 g is capped at 100 units: Farhan 165/170 g, Fatima 155 g. This is pinned as a known limit.

## Checks
`pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:reset`: pass. For the trainer-web e2e, see the PR.
