/**
 * Decide what to do with local Wrangler request traces before `wrangler dev`.
 *
 * Interactive terminals can keep the traces, delete only the observability
 * folder, or start this run with tracing off. CI, tests, and other
 * non-interactive runs (including `pnpm dev` under Turbo) never prompt.
 * `FITBUD_LOCAL_TRACES=keep|fresh|off` selects the mode and skips the prompt.
 */
import {
  lstatSync,
  readdirSync,
  rmSync,
  type Dirent,
  type Stats,
} from "node:fs";
import path from "node:path";

export const TRACE_MODES = ["keep", "fresh", "off"] as const;
export type TraceMode = (typeof TRACE_MODES)[number];

export const TRACE_MODE_ENV = "FITBUD_LOCAL_TRACES";

/**
 * Wrangler 4 enables local request-trace capture by default. Setting this to
 * "false" opts out for the current process only (remote/prod config is untouched).
 */
export const LOCAL_OBSERVABILITY_ENV = "X_LOCAL_OBSERVABILITY";

/** Over this size, suggest deleting the local traces folder. */
export const TRACE_WARN_BYTES = 500 * 1024 * 1024;

const STATE_SEGMENTS = [".wrangler", "state"] as const;
const OBSERVABILITY_SEGMENTS = ["v3", "observability"] as const;

export function observabilityDir(apiRoot: string): string {
  return path.resolve(apiRoot, ...STATE_SEGMENTS, ...OBSERVABILITY_SEGMENTS);
}

export function observabilityFolderLabel(apiRoot: string, dir: string): string {
  const relative = path.relative(path.resolve(apiRoot), path.resolve(dir));
  return relative === "" ? path.resolve(dir) : relative;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`Cannot format byte size ${String(bytes)}.`);
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = units[unitIndex];
  if (unit === undefined) {
    throw new Error("Missing byte unit.");
  }
  if (unitIndex === 0) {
    return `${String(Math.trunc(value))} B`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

export function traceSizeWarning(
  bytes: number,
  folderLabel: string,
): string | undefined {
  if (bytes <= TRACE_WARN_BYTES) return undefined;
  return `Warning: local request traces are ${formatBytes(bytes)}, over 500 MB. Choose fresh to delete only ${folderLabel}.`;
}

export function directorySizeBytes(dir: string): number {
  const root = lstatOrUndefined(dir);
  if (!root) return 0;
  if (root.isSymbolicLink()) return 0;
  if (!root.isDirectory()) return root.isFile() ? root.size : 0;

  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (isEnoent(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      // Do not follow links. A symlink could point outside this folder.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        total += fileSizeOrZero(full);
      }
    }
  }
  return total;
}

export function readTraceModeEnv(
  value: string | undefined,
): { kind: "unset" } | { kind: "set"; mode: TraceMode } {
  if (value === undefined || value.trim() === "") return { kind: "unset" };
  const normalized = value.trim().toLowerCase();
  if (isTraceMode(normalized)) return { kind: "set", mode: normalized };
  throw new Error(
    `${TRACE_MODE_ENV} must be keep, fresh, or off (received ${JSON.stringify(value)}).`,
  );
}

export function parseInteractiveChoice(answer: string): TraceMode | undefined {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "" || normalized === "k" || normalized === "keep") {
    return "keep";
  }
  if (normalized === "f" || normalized === "fresh") return "fresh";
  if (normalized === "o" || normalized === "off") return "off";
  return undefined;
}

export function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  if (value === undefined || value.trim() === "") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false";
}

export function isInteractiveTerminal(options: {
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (isCiEnvironment(options.env)) return false;
  if (options.env.VITEST === "true" || options.env.VITEST === "1") return false;
  return options.stdinIsTTY === true && options.stdoutIsTTY === true;
}

export function wranglerCommandFromArgv(argv: readonly string[]): string[] {
  const separator = argv.indexOf("--");
  if (separator === -1) {
    throw new Error(
      "Pass the wrangler dev command after --. Example: tsx scripts/local-traces.ts -- wrangler dev src/index.ts --local --persist-to .wrangler/state --ip 0.0.0.0",
    );
  }
  const command = argv.slice(separator + 1);
  if (command.length === 0 || command[0] === undefined || command[0] === "") {
    throw new Error("Missing wrangler command after --.");
  }
  return command;
}

/** The dev command must persist into apps/api/.wrangler/state, where traces live. */
export function assertPersistToLocalState(
  command: readonly string[],
  apiRoot: string,
): void {
  const persistIndex = command.indexOf("--persist-to");
  const persistValue = persistIndex === -1 ? undefined : command[persistIndex + 1];
  if (persistValue === undefined || persistValue === "" || persistValue.startsWith("-")) {
    throw new Error(
      "The wrangler dev command must include --persist-to .wrangler/state so traces stay in the folder this script manages.",
    );
  }
  const resolved = path.resolve(apiRoot, persistValue);
  const expected = path.resolve(apiRoot, ...STATE_SEGMENTS);
  if (resolved !== expected) {
    throw new Error(
      `Refusing to start wrangler with --persist-to ${persistValue}. Local traces are only managed for .wrangler/state.`,
    );
  }
}

export function childEnvForMode(
  mode: TraceMode,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const childEnv = { ...env };
  if (mode === "off") {
    childEnv[LOCAL_OBSERVABILITY_ENV] = "false";
  }
  return childEnv;
}

/**
 * Delete only `<apiRoot>/.wrangler/state/v3/observability`.
 * Returns false when that folder is already absent.
 */
export function deleteObservabilityFolder(apiRoot: string): boolean {
  const dir = observabilityDir(apiRoot);
  assertDeletableObservabilityDir(apiRoot, dir);
  const stat = lstatOrUndefined(dir);
  if (!stat) return false;
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to delete symlink at ${dir}.`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to delete non-directory at ${dir}.`);
  }
  rmSync(dir, { recursive: true, force: false });
  return true;
}

export type LocalTracesRunOptions = {
  apiRoot: string;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
  command: readonly string[];
  /** Used by tests to simulate a huge traces folder without writing one. */
  readSize?: (dir: string) => number;
  prompt?: () => Promise<string>;
  log?: (message: string) => void;
  startDev: (options: {
    command: readonly string[];
    env: NodeJS.ProcessEnv;
  }) => void;
};

export async function runLocalTraces(
  options: LocalTracesRunOptions,
): Promise<TraceMode> {
  const log = options.log ?? ((message: string) => console.log(message));
  const dir = observabilityDir(options.apiRoot);
  assertPersistToLocalState(options.command, options.apiRoot);

  const readSize = options.readSize ?? directorySizeBytes;
  const bytes = readSize(dir);
  const label = observabilityFolderLabel(options.apiRoot, dir);
  log(`Local request traces: ${formatBytes(bytes)} (${label})`);
  const warning = traceSizeWarning(bytes, label);
  if (warning) log(warning);

  const envMode = readTraceModeEnv(options.env[TRACE_MODE_ENV]);
  let mode: TraceMode;
  if (envMode.kind === "set") {
    mode = envMode.mode;
    log(`Using ${TRACE_MODE_ENV}=${mode}.`);
  } else if (!options.interactive) {
    mode = "keep";
    log(
      `Non-interactive: keeping local traces. Set ${TRACE_MODE_ENV}=keep|fresh|off to choose.`,
    );
  } else {
    const prompt = options.prompt;
    if (!prompt) {
      throw new Error("Interactive local traces selection needs a prompt.");
    }
    log("keep — leave the folder and keep recording traces (default)");
    log("fresh — delete only this observability folder, then start");
    log("off — start wrangler with tracing off for this run");
    mode = await promptUntilValid(prompt, log);
    log(`Local traces: ${mode}.`);
  }

  if (mode === "fresh") {
    const deleted = deleteObservabilityFolder(options.apiRoot);
    log(
      deleted
        ? `Deleted local traces folder ${label}.`
        : `Local traces folder is already absent (${label}).`,
    );
  } else if (mode === "off") {
    log(
      `Starting wrangler with local tracing off for this run (${LOCAL_OBSERVABILITY_ENV}=false).`,
    );
  }

  options.startDev({
    command: options.command,
    env: childEnvForMode(mode, options.env),
  });
  return mode;
}

async function promptUntilValid(
  prompt: () => Promise<string>,
  log: (message: string) => void,
): Promise<TraceMode> {
  let answer = await readPrompt(prompt);
  let mode = parseInteractiveChoice(answer);
  while (mode === undefined) {
    log("Please enter keep, fresh, or off.");
    answer = await readPrompt(prompt);
    mode = parseInteractiveChoice(answer);
  }
  return mode;
}

async function readPrompt(prompt: () => Promise<string>): Promise<string> {
  try {
    return await prompt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Stopped before choosing local traces (${message}).`);
  }
}

function assertDeletableObservabilityDir(apiRoot: string, dir: string): void {
  const root = path.resolve(apiRoot);
  const expected = observabilityDir(root);
  const resolved = path.resolve(dir);
  if (resolved !== expected) {
    throw new Error(`Refusing to delete unexpected path: ${resolved}`);
  }
  const stateDir = path.resolve(root, ...STATE_SEGMENTS);
  const relative = path.relative(stateDir, resolved);
  if (relative !== path.join(...OBSERVABILITY_SEGMENTS) || relative.startsWith("..")) {
    throw new Error(`Refusing to delete unexpected path: ${resolved}`);
  }
  // Reject a symlink at the traces folder or any existing parent inside the repo
  // so a link cannot redirect the delete outside `.wrangler/state/v3/observability`.
  const segments: string[] = [...STATE_SEGMENTS, ...OBSERVABILITY_SEGMENTS];
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = lstatOrUndefined(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to delete through symlink: ${current}`);
    }
  }
}

function fileSizeOrZero(file: string): number {
  const stat = lstatOrUndefined(file);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return 0;
  return stat.size;
}

function lstatOrUndefined(target: string): Stats | undefined {
  try {
    return lstatSync(target);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return isErrno(error) && error.code === "ENOENT";
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isTraceMode(value: string): value is TraceMode {
  return (TRACE_MODES as readonly string[]).includes(value);
}
