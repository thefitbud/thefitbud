import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DEAD_PID_AGE_MS,
  sweepStaleTestDirs,
} from "./tmp-sweep.js";

/** A pid that is not running in this namespace (ESRCH on kill 0). */
function deadPid(): number {
  for (let pid = 2_000_000_000; pid > 1_999_000_000; pid -= 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
  throw new Error("could not find an unused pid for the sweep test");
}

describe("sweepStaleTestDirs", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("keeps a fresh dead-pid dir (below the age floor)", () => {
    root = mkdtempSync(join(tmpdir(), "fitbud-sweep-test-"));
    const pid = deadPid();
    const path = join(root, `fitbud-test-db-${pid}-abcdef`);
    mkdirSync(path);

    const now = Date.now();
    const result = sweepStaleTestDirs({ dir: root, now });

    expect(result.kept).toContain(path);
    expect(result.removed).not.toContain(path);
    expect(existsSync(path)).toBe(true);
  });

  it("sweeps an old dead-pid dir (past the age floor)", () => {
    root = mkdtempSync(join(tmpdir(), "fitbud-sweep-test-"));
    const pid = deadPid();
    const path = join(root, `fitbud-demo-seed-${pid}-xyzXYZ`);
    mkdirSync(path);

    const now = Date.now();
    const mtimeSec = (now - DEFAULT_DEAD_PID_AGE_MS - 60_000) / 1000;
    utimesSync(path, mtimeSec, mtimeSec);

    const result = sweepStaleTestDirs({ dir: root, now });

    expect(result.removed).toContain(path);
    expect(result.kept).not.toContain(path);
    expect(existsSync(path)).toBe(false);
  });
});
