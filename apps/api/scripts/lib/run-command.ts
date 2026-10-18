import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";

export type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: SpawnSyncOptions["stdio"];
};

/** Human-readable command for error messages. */
export function formatCommand(command: string, args: string[] = []): string {
  const parts = [command, ...args];
  return parts
    .map((part) => {
      if (/[\s"]/u.test(part)) {
        return `"${part.replace(/"/gu, '\\"')}"`;
      }
      return part;
    })
    .join(" ");
}

export function spawnOptions(
  options: RunCommandOptions = {},
): SpawnSyncOptions {
  return {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32",
  };
}

/**
 * Returns a process exit code for a failed spawn, or null when the child succeeded.
 */
export function failedSpawnExitCode(
  result: SpawnSyncReturns<Buffer | string>,
  command: string,
  args: string[] = [],
): number | null {
  if (result.error) {
    console.error(`Command failed to start: ${formatCommand(command, args)}`);
    console.error(result.error.message);
    return 1;
  }
  if (result.status !== 0) {
    console.error(
      `Command failed (exit ${String(result.status)}): ${formatCommand(command, args)}`,
    );
    if (result.signal) {
      console.error(`Signal: ${result.signal}`);
    }
    const stderr = result.stderr;
    if (stderr && (typeof stderr === "string" ? stderr.length : stderr.byteLength)) {
      console.error(
        typeof stderr === "string" ? stderr : stderr.toString("utf8"),
      );
    }
    return result.status ?? 1;
  }
  return null;
}

/** Run a subprocess; exit the current process on failure. */
export function runCommandSync(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {},
): void {
  const result = spawnSync(command, args, spawnOptions(options));
  const code = failedSpawnExitCode(result, command, args);
  if (code !== null) {
    process.exit(code);
  }
}

/** Run a shell command line; exit the current process on failure. */
export function execCommandSync(
  commandLine: string,
  options: RunCommandOptions = {},
): void {
  const result = spawnSync(commandLine, {
    ...spawnOptions(options),
    shell: true,
  });
  const code = failedSpawnExitCode(result, commandLine, []);
  if (code !== null) {
    process.exit(code);
  }
}
