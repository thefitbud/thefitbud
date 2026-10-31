import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/run-command.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/run-command.js")>();
  return { ...actual, runCommandSync: vi.fn() };
});

import { runCommandSync } from "./lib/run-command.js";
import { parseDeployArgs, runDeployEnv, wranglerArgs } from "./deploy-env.js";

const run = vi.mocked(runCommandSync);

describe("parseDeployArgs", () => {
  it("parses action, env and flags", () => {
    expect(parseDeployArgs(["deploy", "--env", "staging", "--yes"])).toEqual({
      action: "deploy",
      env: "staging",
      yes: true,
      dryRun: false,
    });
    expect(parseDeployArgs(["migrate", "--env=production", "--dry-run"])).toEqual({
      action: "migrate",
      env: "production",
      yes: false,
      dryRun: true,
    });
  });

  it("ignores the `--` that pnpm forwards before script arguments", () => {
    expect(parseDeployArgs(["deploy", "--env", "staging", "--", "--dry-run"])).toEqual({
      action: "deploy",
      env: "staging",
      yes: false,
      dryRun: true,
    });
  });

  it("refuses a second --env so a staging script cannot target production", () => {
    expect(() =>
      parseDeployArgs(["deploy", "--env", "staging", "--", "--env", "production", "--yes"]),
    ).toThrow(/more than once/);
    expect(() =>
      parseDeployArgs(["migrate", "--env", "staging", "--env=production"]),
    ).toThrow(/more than once/);
  });

  it("refuses --env without a value", () => {
    expect(() => parseDeployArgs(["deploy", "--env"])).toThrow(/needs a value/);
    expect(() => parseDeployArgs(["deploy", "--env", "--yes"])).toThrow(/needs a value/);
    expect(() => parseDeployArgs(["deploy", "--env="])).toThrow(/needs a value/);
  });

  it("rejects unknown env names, actions and flags", () => {
    expect(() => parseDeployArgs(["deploy", "--env", "local"])).toThrow(/Unknown env "local"/);
    expect(() => parseDeployArgs(["deploy", "--env", "prod"])).toThrow(/Unknown env/);
    expect(() => parseDeployArgs(["deploy"])).toThrow(/Unknown env ""/);
    expect(() => parseDeployArgs(["seed", "--env", "staging"])).toThrow(/Unknown action/);
    expect(() => parseDeployArgs(["deploy", "--env", "staging", "--remote"])).toThrow(
      /Unknown argument/,
    );
  });
});

describe("wranglerArgs", () => {
  it("builds the exact Wrangler argv per env", () => {
    expect(wranglerArgs(parseDeployArgs(["deploy", "--env", "staging"]))).toEqual([
      "wrangler", "deploy", "--env", "staging",
    ]);
    expect(wranglerArgs(parseDeployArgs(["deploy", "--env", "production", "--dry-run"]))).toEqual([
      "wrangler", "deploy", "--dry-run", "--env", "production",
    ]);
    expect(wranglerArgs(parseDeployArgs(["migrate", "--env", "staging"]))).toEqual([
      "wrangler", "d1", "migrations", "apply", "fitbud-staging", "--env", "staging", "--remote",
    ]);
    expect(wranglerArgs(parseDeployArgs(["migrate", "--env", "production"]))).toEqual([
      "wrangler", "d1", "migrations", "apply", "fitbud-prod", "--env", "production", "--remote",
    ]);
  });
});

describe("runDeployEnv", () => {
  afterEach(() => {
    run.mockReset();
    vi.restoreAllMocks();
  });

  it.each([
    [["deploy", "--env", "staging"], "pnpm exec wrangler deploy --env staging"],
    [["deploy", "--env", "production"], "pnpm exec wrangler deploy --env production"],
    [
      ["migrate", "--env", "staging"],
      "pnpm exec wrangler d1 migrations apply fitbud-staging --env staging --remote",
    ],
    [
      ["migrate", "--env", "production"],
      "pnpm exec wrangler d1 migrations apply fitbud-prod --env production --remote",
    ],
  ])("refuses %j without --yes and prints the command", (argv, printed) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runDeployEnv(argv, "/api")).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(errors.mock.calls.flat().join("\n")).toContain(printed);
  });

  it("runs the remote command with --yes", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runDeployEnv(["migrate", "--env", "production", "--yes"], "/api")).toBe(0);
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "wrangler", "d1", "migrations", "apply", "fitbud-prod", "--env", "production", "--remote"],
      { cwd: "/api" },
    );
  });

  it("runs a deploy dry run without --yes", () => {
    expect(runDeployEnv(["deploy", "--env", "staging", "--dry-run"], "/api")).toBe(0);
    expect(run).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "wrangler", "deploy", "--dry-run", "--env", "staging"],
      { cwd: "/api" },
    );
  });

  it("logs the command before running it with --yes", () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runDeployEnv(["deploy", "--env", "staging", "--yes"], "/api")).toBe(0);
    expect(logs.mock.calls.flat().join("\n")).toContain("pnpm exec wrangler deploy --env staging");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("only prints for a migrate dry run, even with --yes", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runDeployEnv(["migrate", "--env", "production", "--yes", "--dry-run"], "/api")).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a second --env end to end without calling Wrangler", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      runDeployEnv(["migrate", "--env", "staging", "--", "--env", "production", "--yes"], "/api"),
    ).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("only prints for a migrate dry run", () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runDeployEnv(["migrate", "--env", "staging", "--dry-run"], "/api")).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(logs.mock.calls.flat().join("\n")).toContain(
      "pnpm exec wrangler d1 migrations apply fitbud-staging --env staging --remote",
    );
  });

  it("exits 1 on an unknown env without calling Wrangler", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runDeployEnv(["deploy", "--env", "dev", "--yes"], "/api")).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });
});
