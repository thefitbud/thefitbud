/**
 * Z14-4: `PRAGMA optimize` after every D1 migration, so the query planner has
 * the statistics it needs (FitBud Tech's index audit, W14 diagnosis #1).
 */
export const PRAGMA_OPTIMIZE = "PRAGMA optimize";

/**
 * The `--command` value for `wrangler d1 execute`. On Windows `runCommandSync`
 * spawns through the shell, which would split the statement at its space, so
 * it is quoted there; elsewhere the argument is passed as-is.
 */
export function optimizeSql(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `"${PRAGMA_OPTIMIZE}"` : PRAGMA_OPTIMIZE;
}

const LOCAL_D1 = ["fitbud", "--local", "--persist-to", ".wrangler/state"];

/** `pnpm db:migrate:local`: argv after `pnpm` for each step, in order. */
export function localMigrateCommands(platform: NodeJS.Platform = process.platform): string[][] {
  return [
    ["exec", "wrangler", "d1", "migrations", "apply", ...LOCAL_D1],
    ["exec", "wrangler", "d1", "execute", ...LOCAL_D1, "--command", optimizeSql(platform)],
  ];
}
