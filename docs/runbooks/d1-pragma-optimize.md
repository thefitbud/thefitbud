# D1 · PRAGMA optimize (Z14-4)

**Who:** Firoz. Agents never run remote commands (AGENTS.md).

## Why

D1 is SQLite. Without `PRAGMA optimize` it has no table statistics, so the query planner can pick a poor index; FitBud Tech's audit (W14 diagnosis #1) found the current-plan lookup scanning every plan version because of this. `PRAGMA optimize` collects statistics only where they are missing or stale. It changes no rows and is safe to repeat.

## From now on: automatic

`db:migrate:staging` and `db:migrate:production` run `PRAGMA optimize` on the same database right after the migrations apply (`apps/api/scripts/deploy-env.ts`). Without `--yes` they print both commands. `db:migrate:local` (and so `db:reset`) does the same locally. Nothing to remember after a normal migrate.

## Once, by hand

Staging and production have never been optimized. Run it once on each:

- [ ] **Staging**, after migration `0042_index_hygiene` is applied (the next `db:migrate:staging --yes` after Z14-4 merges does both, so this step is only needed if you migrated some other way):

  ```bash
  cd apps/api
  pnpm exec wrangler d1 execute fitbud-staging --env staging --remote --command "PRAGMA optimize"
  ```

- [ ] **Production**, at the next production deploy, after `db:migrate:production --yes` (which already runs it), or by hand:

  ```bash
  cd apps/api
  pnpm exec wrangler d1 execute fitbud-prod --env production --remote --command "PRAGMA optimize"
  ```

Expected output: `1 command executed successfully` with an empty result. If it fails, the migrations are unaffected; run it again later.
