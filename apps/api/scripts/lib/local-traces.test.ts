import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TRACE_MODE_ENV,
  TRACE_WARN_BYTES,
  LOCAL_OBSERVABILITY_ENV,
  childEnvForMode,
  deleteObservabilityFolder,
  directorySizeBytes,
  formatBytes,
  isInteractiveTerminal,
  observabilityDir,
  parseInteractiveChoice,
  readTraceModeEnv,
  runLocalTraces,
  traceSizeWarning,
  wranglerCommandFromArgv,
} from "./local-traces.js";

const apiPackageJson = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const devCommand = [
  "wrangler",
  "dev",
  "src/index.ts",
  "--local",
  "--persist-to",
  ".wrangler/state",
  "--ip",
  "0.0.0.0",
];

function makeApiRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "fitbud-traces-"));
}

function writeStateFile(apiRoot: string, relativePath: string, contents: string): void {
  const full = path.join(apiRoot, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

describe("formatBytes", () => {
  it("formats byte units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(TRACE_WARN_BYTES)).toBe("500.0 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  });
});

describe("traceSizeWarning", () => {
  it("suggests fresh only when the folder is over 500 MB", () => {
    expect(traceSizeWarning(TRACE_WARN_BYTES, ".wrangler/state/v3/observability")).toBeUndefined();
    expect(traceSizeWarning(TRACE_WARN_BYTES + 1, ".wrangler/state/v3/observability")).toMatch(
      /over 500 MB/,
    );
    expect(traceSizeWarning(TRACE_WARN_BYTES + 1, ".wrangler/state/v3/observability")).toMatch(
      /fresh/,
    );
  });
});

describe("trace mode selection", () => {
  it("defaults an unset env to keep and accepts only keep, fresh, or off", () => {
    expect(readTraceModeEnv(undefined)).toEqual({ kind: "unset" });
    expect(readTraceModeEnv("  ")).toEqual({ kind: "unset" });
    expect(readTraceModeEnv("FRESH")).toEqual({ kind: "set", mode: "fresh" });
    expect(() => readTraceModeEnv("wipe")).toThrow(/FITBUD_LOCAL_TRACES/);
  });

  it("treats Enter as keep and accepts short answers", () => {
    expect(parseInteractiveChoice("")).toBe("keep");
    expect(parseInteractiveChoice(" K ")).toBe("keep");
    expect(parseInteractiveChoice("fresh")).toBe("fresh");
    expect(parseInteractiveChoice("o")).toBe("off");
    expect(parseInteractiveChoice("nope")).toBeUndefined();
  });

  it("asks only on an interactive terminal outside CI and tests", () => {
    const tty = { stdinIsTTY: true, stdoutIsTTY: true, env: {} };
    expect(isInteractiveTerminal(tty)).toBe(true);
    expect(isInteractiveTerminal({ ...tty, stdinIsTTY: false })).toBe(false);
    expect(isInteractiveTerminal({ ...tty, stdoutIsTTY: undefined })).toBe(false);
    expect(isInteractiveTerminal({ ...tty, env: { CI: "true" } })).toBe(false);
    expect(isInteractiveTerminal({ ...tty, env: { CI: "0" } })).toBe(true);
    expect(isInteractiveTerminal({ ...tty, env: { VITEST: "true" } })).toBe(false);
  });
});

describe("wrangler command", () => {
  it("reads the command after --", () => {
    expect(wranglerCommandFromArgv(["node", "local-traces.ts", "--", ...devCommand])).toEqual(
      devCommand,
    );
    expect(() => wranglerCommandFromArgv(["node", "local-traces.ts"])).toThrow(/--/);
  });
});

describe("directorySizeBytes", () => {
  it("sums files under the folder and ignores missing folders", () => {
    const apiRoot = makeApiRoot();
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(0);
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/a.bin", "abcd");
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/nested/b.bin", "ef");
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(6);
  });
});

describe("deleteObservabilityFolder", () => {
  it("deletes only the observability folder under .wrangler/state", () => {
    const apiRoot = makeApiRoot();
    writeStateFile(apiRoot, ".wrangler/state/v3/d1/local.sqlite", "keep-d1");
    writeStateFile(apiRoot, ".wrangler/state/v3/r2/blob", "keep-r2");
    writeStateFile(apiRoot, ".wrangler/state/v3/observability.bak/trace", "keep-bak");
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/traces/one.json", "drop");
    writeStateFile(apiRoot, ".wrangler/state/other", "keep-other");

    expect(deleteObservabilityFolder(apiRoot)).toBe(true);

    const stateRoot = path.join(apiRoot, ".wrangler", "state");
    expect(readFileSync(path.join(stateRoot, "v3", "d1", "local.sqlite"), "utf8")).toBe("keep-d1");
    expect(readFileSync(path.join(stateRoot, "v3", "r2", "blob"), "utf8")).toBe("keep-r2");
    expect(readFileSync(path.join(stateRoot, "v3", "observability.bak", "trace"), "utf8")).toBe(
      "keep-bak",
    );
    expect(readFileSync(path.join(stateRoot, "other"), "utf8")).toBe("keep-other");
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(0);
    expect(deleteObservabilityFolder(apiRoot)).toBe(false);
  });

  it("refuses to delete through a symlink", () => {
    const apiRoot = makeApiRoot();
    const outside = mkdtempSync(path.join(tmpdir(), "fitbud-traces-outside-"));
    writeFileSync(path.join(outside, "secret"), "secret");
    const link = observabilityDir(apiRoot);
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(outside, link, "dir");

    expect(() => deleteObservabilityFolder(apiRoot)).toThrow(/symlink/);
    expect(readFileSync(path.join(outside, "secret"), "utf8")).toBe("secret");

    const parentRoot = makeApiRoot();
    const parentOutside = mkdtempSync(path.join(tmpdir(), "fitbud-traces-parent-"));
    writeStateFile(parentOutside, "state/v3/observability/secret.txt", "secret");
    symlinkSync(parentOutside, path.join(parentRoot, ".wrangler"), "dir");

    expect(() => deleteObservabilityFolder(parentRoot)).toThrow(/symlink/);
    expect(readFileSync(path.join(parentOutside, "state", "v3", "observability", "secret.txt"), "utf8")).toBe(
      "secret",
    );
  });
});

describe("runLocalTraces", () => {
  it("keeps traces without prompting when the terminal is not interactive", async () => {
    const apiRoot = makeApiRoot();
    writeStateFile(apiRoot, ".wrangler/state/v3/d1/local.sqlite", "db");
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/trace.bin", "trace");
    let prompted = false;
    const started: { command: readonly string[]; env: NodeJS.ProcessEnv }[] = [];

    const mode = await runLocalTraces({
      apiRoot,
      env: {},
      interactive: false,
      command: devCommand,
      prompt: () => {
        prompted = true;
        return Promise.resolve("fresh");
      },
      log: () => undefined,
      startDev: (options) => {
        started.push(options);
      },
    });

    expect(mode).toBe("keep");
    expect(prompted).toBe(false);
    expect(started).toHaveLength(1);
    expect(started[0]?.env[LOCAL_OBSERVABILITY_ENV]).toBeUndefined();
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(5);
    expect(readFileSync(path.join(apiRoot, ".wrangler", "state", "v3", "d1", "local.sqlite"), "utf8")).toBe(
      "db",
    );
  });

  it("uses FITBUD_LOCAL_TRACES and skips the prompt even on a TTY", async () => {
    const apiRoot = makeApiRoot();
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/trace.bin", "trace");
    let prompted = false;
    const started: { env: NodeJS.ProcessEnv }[] = [];

    const mode = await runLocalTraces({
      apiRoot,
      env: { [TRACE_MODE_ENV]: "off", OTHER: "1" },
      interactive: true,
      command: devCommand,
      prompt: () => {
        prompted = true;
        return Promise.resolve("fresh");
      },
      log: () => undefined,
      startDev: (options) => {
        started.push(options);
      },
    });

    expect(mode).toBe("off");
    expect(prompted).toBe(false);
    expect(started[0]?.env[LOCAL_OBSERVABILITY_ENV]).toBe("false");
    expect(started[0]?.env.OTHER).toBe("1");
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(5);
  });

  it("fresh deletes only the observability folder", async () => {
    const apiRoot = makeApiRoot();
    writeStateFile(apiRoot, ".wrangler/state/v3/d1/local.sqlite", "db");
    writeStateFile(apiRoot, ".wrangler/state/v3/observability/trace.bin", "trace");
    const logs: string[] = [];

    const mode = await runLocalTraces({
      apiRoot,
      env: { [TRACE_MODE_ENV]: "fresh" },
      interactive: false,
      command: devCommand,
      log: (message) => logs.push(message),
      startDev: () => undefined,
    });

    expect(mode).toBe("fresh");
    expect(logs.some((line) => line.includes("Deleted local traces folder"))).toBe(true);
    expect(directorySizeBytes(observabilityDir(apiRoot))).toBe(0);
    expect(readFileSync(path.join(apiRoot, ".wrangler", "state", "v3", "d1", "local.sqlite"), "utf8")).toBe(
      "db",
    );
  });

  it("warns above 500 MB and re-asks until the answer is valid", async () => {
    const apiRoot = makeApiRoot();
    const logs: string[] = [];
    const answers = ["nope", ""];
    const mode = await runLocalTraces({
      apiRoot,
      env: {},
      interactive: true,
      command: devCommand,
      readSize: () => TRACE_WARN_BYTES + 1,
      prompt: () => Promise.resolve(answers.shift() ?? "keep"),
      log: (message) => logs.push(message),
      startDev: () => undefined,
    });

    expect(mode).toBe("keep");
    expect(logs.some((line) => line.startsWith("Warning:") && line.includes("fresh"))).toBe(true);
    expect(logs).toContain("Please enter keep, fresh, or off.");
  });

  it("does not start wrangler when the mode env is invalid", async () => {
    let started = false;
    await expect(
      runLocalTraces({
        apiRoot: makeApiRoot(),
        env: { [TRACE_MODE_ENV]: "wipe" },
        interactive: false,
        command: devCommand,
        log: () => undefined,
        startDev: () => {
          started = true;
        },
      }),
    ).rejects.toThrow(/FITBUD_LOCAL_TRACES/);
    expect(started).toBe(false);
  });
});

describe("childEnvForMode", () => {
  it("turns tracing off only for the off mode", () => {
    expect(childEnvForMode("keep", { [LOCAL_OBSERVABILITY_ENV]: "true" })[LOCAL_OBSERVABILITY_ENV]).toBe(
      "true",
    );
    expect(childEnvForMode("off", { [LOCAL_OBSERVABILITY_ENV]: "true" })[LOCAL_OBSERVABILITY_ENV]).toBe(
      "false",
    );
    expect(childEnvForMode("fresh", {})[LOCAL_OBSERVABILITY_ENV]).toBeUndefined();
  });
});

describe("api dev script", () => {
  it("runs local traces before wrangler dev", () => {
    const pkg = JSON.parse(readFileSync(apiPackageJson, "utf8")) as {
      scripts: { dev: string };
    };
    expect(pkg.scripts.dev).toContain("tsx scripts/local-traces.ts --");
    expect(pkg.scripts.dev).toContain("wrangler dev src/index.ts");
    expect(pkg.scripts.dev).toContain("--local");
    expect(pkg.scripts.dev).toContain("--persist-to .wrangler/state");
    expect(pkg.scripts.dev).toContain("--ip 0.0.0.0");
  });
});
