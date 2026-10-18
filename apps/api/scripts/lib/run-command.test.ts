import { describe, expect, it } from "vitest";
import { formatCommand, failedSpawnExitCode } from "./run-command.js";

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
      failedSpawnExitCode({ status: 0, output: [null, "", ""], pid: 1, signal: null, stderr: null, stdout: null, error: undefined }, "pnpm", []),
    ).toBeNull();
  });

  it("returns exit code when status is non-zero", () => {
    expect(
      failedSpawnExitCode(
        { status: 2, output: [null, "", ""], pid: 1, signal: null, stderr: null, stdout: null, error: undefined },
        "tsx",
        ["scripts/db-reset.ts"],
      ),
    ).toBe(2);
  });

  it("returns 1 when spawn error is set", () => {
    expect(
      failedSpawnExitCode(
        {
          status: null,
          output: [null, "", ""],
          pid: 0,
          signal: null,
          stderr: null,
          stdout: null,
          error: new Error("spawn tsx ENOENT"),
        },
        "tsx",
        [],
      ),
    ).toBe(1);
  });
});
