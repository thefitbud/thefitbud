/**
 * Startup sweep for temp dirs left by interrupted API test runs (task H1).
 *
 * Seeded test DBs live in `<tmpdir>/fitbud-demo-seed-<pid>-XXXXXX` and
 * `<tmpdir>/fitbud-test-db-<pid>-XXXXXX` (~60 MB each). A completed run removes them;
 * a killed run (Ctrl-C, SIGTERM, SIGKILL) cannot. /tmp is shared with other checkouts
 * and agents, so this only removes a dir when it is clearly abandoned:
 *  - it matches one of the two prefixes above exactly, is a real directory (not a
 *    symlink) and is owned by the current user, and
 *  - its owning pid is no longer running, or the pid is running but was started after
 *    the dir was last modified and the dir is older than `maxAgeMs` (pid reused), or
 *  - it is an older-style name without a pid and is older than `maxAgeMs`.
 * A dir whose owner process is alive (e.g. another suite running right now) is kept.
 */
import { lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WITH_PID = /^fitbud-(?:demo-seed|test-db)-(\d+)-[A-Za-z0-9]{6}$/;
const LEGACY = /^fitbud-(?:demo-seed|test-db)-[A-Za-z0-9]{6}$/;

export const DEFAULT_STALE_AGE_MS = 2 * 60 * 60 * 1000;

export interface SweepOptions {
  dir?: string;
  maxAgeMs?: number;
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

/** Linux only: true when `pid` started after `sinceMs` (so it cannot own an older dir). */
function startedAfter(pid: number, sinceMs: number): boolean {
  try {
    return statSync(`/proc/${pid}`).ctimeMs > sinceMs + 1000;
  } catch {
    return false;
  }
}

export function sweepStaleTestDirs(options: SweepOptions = {}): SweepResult {
  const root = options.dir ?? tmpdir();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_STALE_AGE_MS;
  const now = options.now ?? Date.now();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
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

    const old = now - stat.mtimeMs > maxAgeMs;
    let stale: boolean;
    if (withPid) {
      const pid = Number(withPid[1]);
      if (pid === process.pid) stale = false;
      else if (!isAlive(pid)) stale = true;
      else stale = old && startedAfter(pid, stat.mtimeMs);
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
