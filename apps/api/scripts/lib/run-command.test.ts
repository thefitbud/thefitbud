import type { SpawnSyncReturns } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { formatCommand, failedSpawnExitCode } from "./run-command.js";

function mockSpawnResult(
  partial: Partial<SpawnSyncReturns<string>>,
): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, "", ""],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    ...partial,
  };
}

describe("formatCommand", () => {
  it("joins command and args", () => {
    expect(formatCommand("pnpm", ["db:reset"])).toBe("pnpm db:reset");
  });

  it("quotes arguments with spaces", () => {
    expect(formatCommand("echo", ["hello world"])).toBe('echo "hello world"');
  });
});

describe("failedSpawnExitCode", () => {
  it("returns null on success", () => {
    expect(
      failedSpawnExitCode(mockSpawnResult({ status: 0 }), "pnpm", []),
    ).toBeNull();
  });

  it("returns exit code when status is non-zero", () => {
    // The failure is reported on stderr; the Z12-35 console gate needs the test to expect it.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      failedSpawnExitCode(
        mockSpawnResult({ status: 2 }),
        "tsx",
        ["scripts/db-reset.ts"],
      ),
    ).toBe(2);
    expect(errors).toHaveBeenCalledWith("Command failed (exit 2): tsx scripts/db-reset.ts");
    errors.mockRestore();
  });

  it("returns 1 when spawn error is set", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      failedSpawnExitCode(
        mockSpawnResult({
          status: null,
          pid: 0,
          error: new Error("spawn tsx ENOENT"),
        }),
        "tsx",
        [],
      ),
    ).toBe(1);
    expect(errors).toHaveBeenCalledWith("Command failed to start: tsx");
    expect(errors).toHaveBeenCalledWith("spawn tsx ENOENT");
    errors.mockRestore();
  });
});
