#!/usr/bin/env node
/**
 * Runs before `wrangler dev` for the API package.
 * See scripts/lib/local-traces.ts for keep / fresh / off behavior.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  isInteractiveTerminal,
  runLocalTraces,
  wranglerCommandFromArgv,
} from "./lib/local-traces.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function promptForTraceMode(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await rl.question("Local traces — keep (Enter) / fresh / off: ");
  } finally {
    rl.close();
    // readline pauses stdin; resume so wrangler can inherit the terminal.
    process.stdin.resume();
  }
}

function startWrangler(options: {
  command: readonly string[];
  env: NodeJS.ProcessEnv;
}): void {
  const [bin, ...args] = options.command;
  if (bin === undefined || bin === "") {
    throw new Error("Missing wrangler command.");
  }
  const child = spawn(bin, args, {
    cwd: apiRoot,
    env: options.env,
    stdio: "inherit",
    // Resolve wrangler.cmd on Windows. Arguments are the fixed dev command.
    shell: process.platform === "win32",
  });
  child.on("error", (error) => {
    console.error(`Failed to start ${bin}: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

async function main(): Promise<void> {
  const command = wranglerCommandFromArgv(process.argv);
  await runLocalTraces({
    apiRoot,
    env: process.env,
    interactive: isInteractiveTerminal({
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
      env: process.env,
    }),
    command,
    prompt: promptForTraceMode,
    startDev: startWrangler,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
