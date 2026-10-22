import type { SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";
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
    expect(
      failedSpawnExitCode(
        mockSpawnResult({ status: 2 }),
        "tsx",
        ["scripts/db-reset.ts"],
      ),
    ).toBe(2);
  });

  it("returns 1 when spawn error is set", () => {
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
  });
});
