/**
 * Startup sweep for temp dirs left by interrupted API test runs (task H1 / TS1).
 *
 * Seeded test DBs live in `<tmpdir>/fitbud-demo-seed-<pid>-XXXXXX` and
 * `<tmpdir>/fitbud-test-db-<pid>-XXXXXX` (~60 MB each). A completed run removes them;
 * a killed run (Ctrl-C, SIGTERM, SIGKILL) cannot. /tmp is shared with other checkouts
 * and agents, so this only removes a dir when it is clearly abandoned:
 *  - it matches one of the two prefixes above exactly, is a real directory (not a
 *    symlink) and is owned by the current user, and
 *  - its owning pid is no longer running and the dir is older than `deadPidAgeMs`
 *    (~10 min floor, in case /tmp is shared across pid namespaces), or
 *  - the pid is running but was started after the dir was last modified (from
 *    `/proc/<pid>/stat` field 22) and the dir is older than `maxAgeMs` (pid reused), or
 *  - it is an older-style name without a pid and is older than `maxAgeMs`.
 * A dir whose owner process is alive (e.g. another suite running right now) is kept.
 */
import { lstatSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WITH_PID = /^fitbud-(?:demo-seed|test-db)-(\d+)-[A-Za-z0-9]{6}$/;
const LEGACY = /^fitbud-(?:demo-seed|test-db)-[A-Za-z0-9]{6}$/;

/** Age before pid-reuse / legacy dirs are swept. */
export const DEFAULT_STALE_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Minimum age before a dead-pid dir is swept. Protects against false "dead"
 * signals when /tmp is shared across pid namespaces (pid exists elsewhere).
 */
export const DEFAULT_DEAD_PID_AGE_MS = 10 * 60 * 1000;

/** Linux USER_HZ; starttime in /proc/<pid>/stat is in these ticks. */
const LINUX_CLK_TCK = 100;

export interface SweepOptions {
  dir?: string;
  maxAgeMs?: number;
  /** Override the dead-pid age floor (default {@link DEFAULT_DEAD_PID_AGE_MS}). */
  deadPidAgeMs?: number;
  now?: number;
}

export interface SweepResult {
  removed: string[];
  kept: string[];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Wall-clock boot time in ms, or null when `/proc/stat` is unavailable. */
function linuxBootTimeMs(): number | null {
  try {
    const text = readFileSync("/proc/stat", "utf8");
    for (const line of text.split("\n")) {
      if (line.startsWith("btime ")) {
        const sec = Number(line.slice(6).trim());
        return Number.isFinite(sec) ? sec * 1000 : null;
      }
    }
  } catch {
    // Non-Linux or unreadable.
  }
  return null;
}

/**
 * Process start time in wall-clock ms from `/proc/<pid>/stat` field 22
 * (starttime, ticks after boot). Null when unavailable or unparseable.
 */
function processStartTimeMs(pid: number, bootTimeMs: number): number | null {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, "utf8");
    // Format: pid (comm) state ... — comm may contain spaces/parens, so split after the
    // last ')'. After that: field 3 = state at index 0; field 22 = starttime at index 19.
    const closeParen = text.lastIndexOf(")");
    if (closeParen < 0) return null;
    const fields = text.slice(closeParen + 2).split(/\s+/);
    const startTicks = Number(fields[19]);
    if (!Number.isFinite(startTicks)) return null;
    return bootTimeMs + (startTicks / LINUX_CLK_TCK) * 1000;
  } catch {
    return null;
  }
}

/** Linux only: true when `pid` started after `sinceMs` (so it cannot own an older dir). */
function startedAfter(
  pid: number,
  sinceMs: number,
  bootTimeMs: number | null,
): boolean {
  if (bootTimeMs === null) return false;
  const startMs = processStartTimeMs(pid, bootTimeMs);
  if (startMs === null) return false;
  return startMs > sinceMs + 1000;
}

export function sweepStaleTestDirs(options: SweepOptions = {}): SweepResult {
  const root = options.dir ?? tmpdir();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_STALE_AGE_MS;
  const deadPidAgeMs = options.deadPidAgeMs ?? DEFAULT_DEAD_PID_AGE_MS;
  const now = options.now ?? Date.now();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const bootTimeMs = linuxBootTimeMs();
  const result: SweepResult = { removed: [], kept: [] };

  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return result;
  }

  for (const name of names) {
    const withPid = WITH_PID.exec(name);
    if (!withPid && !LEGACY.test(name)) continue;
    const path = join(root, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue; // Removed concurrently.
    }
    if (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid)) continue;

    const ageMs = now - stat.mtimeMs;
    const old = ageMs > maxAgeMs;
    let stale: boolean;
    if (withPid) {
      const pid = Number(withPid[1]);
      if (pid === process.pid) stale = false;
      else if (!isAlive(pid)) stale = ageMs > deadPidAgeMs;
      else stale = old && startedAfter(pid, stat.mtimeMs, bootTimeMs);
    } else {
      stale = old;
    }

    if (stale) {
      rmSync(path, { recursive: true, force: true });
      result.removed.push(path);
    } else {
      result.kept.push(path);
    }
  }
  return result;
}
