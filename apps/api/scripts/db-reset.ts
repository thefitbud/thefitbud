#!/usr/bin/env node
/**
 * Local D1 reset: wipe state, migrate, library seed, demo seed (T25).
 */
import { rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandSync } from "./lib/run-command.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const d1State = path.join(apiRoot, ".wrangler", "state", "v3", "d1");

const allowed = path.normalize(d1State);
if (!allowed.endsWith(`${path.sep}.wrangler${path.sep}state${path.sep}v3${path.sep}d1`)) {
  console.error("Refusing to delete unexpected path:", allowed);
  process.exit(1);
}

const timings: string[] = [];

function run(command: string, args: string[]) {
  const started = Date.now();
  runCommandSync(command, args, { cwd: apiRoot });
  timings.push(`${[command, ...args].join(" ").padEnd(34)} ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** True when something accepts connections on a local port. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// db:reset deletes the D1 files. A running local API keeps the deleted database open (Linux: it
// goes on serving the old data; Windows: the delete fails), so it has to be stopped first.
// db:reseed does not have this problem.
const apiPorts = [...new Set([8787, Number(process.env.FITBUD_API_PORT ?? 0)].filter((p) => p > 0))];
for (const port of apiPorts) {
  if (process.env.FITBUD_RESET_IGNORE_API !== "1" && (await listening(port))) {
    console.error(
      `Something is listening on port ${port}, probably the local API (pnpm api).\n` +
        "Stop it and run pnpm db:reset again: a running API keeps the old database open.\n" +
        "To reload only the demo data while the API runs, use pnpm db:reseed.\n" +
        "(Set FITBUD_RESET_IGNORE_API=1 to skip this check, e.g. if the port is another program.)",
    );
    process.exit(1);
  }
}

run("tsx", ["scripts/ensure-dev-vars.ts"]);

console.log(`Removing ${allowed}`);
rmSync(allowed, { recursive: true, force: true });

run("pnpm", ["db:migrate:local"]);
run("tsx", ["scripts/library-seed-local.ts"]);
run("pnpm", ["seed:demo"]);

console.log("\nStep timings:\n  " + timings.join("\n  "));
console.log("db:reset complete. (For a quick demo-only reload on a current schema, use pnpm db:reseed.)");
