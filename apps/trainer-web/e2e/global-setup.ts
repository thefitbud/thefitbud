import { openSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  execCommandSync,
  runCommandSync,
} from "../../api/scripts/lib/run-command.ts";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const API_ROOT = path.join(repoRoot, "apps", "api");
const e2eLog =
  process.platform === "win32"
    ? path.join(process.env.TEMP ?? "C:\\Temp", "fitbud-api-e2e.log")
    : "/tmp/fitbud-api-e2e.log";

async function waitForLogin(maxAttempts = 120): Promise<void> {
  let lastError = "no response";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const health = await fetch(`${API}/health`);
      if (!health.ok) {
        lastError = `health ${health.status}`;
        await delay(500);
        continue;
      }
      const login = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "rahul.coach@demo.fitbud.test",
          password: "FitBud-demo-2026",
        }),
      });
      const body = await login.json();
      if (login.ok && body?.data?.token) {
        return;
      }
      lastError = JSON.stringify(body);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await delay(500);
  }
  throw new Error(
    `API did not become ready for demo login after db:reset (${lastError})`,
  );
}

function stopApiProcesses() {
  if (process.platform === "win32") {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; taskkill /F /IM workerd.exe 2>$null; Start-Sleep -Seconds 2",
      ],
      { stdio: "ignore" },
    );
  } else {
    spawnSync(
      "bash",
      [
        "-c",
        "pkill -9 -f 'wrangler dev src/index.ts' 2>/dev/null || true; pkill -9 -f 'wrangler.js dev' 2>/dev/null || true; pkill -9 workerd 2>/dev/null || true; fuser -k 8787/tcp 2>/dev/null || true; sleep 2",
      ],
      { stdio: "ignore" },
    );
  }
}

function startApiDevServer() {
  const wranglerArgs = [
    "exec",
    "wrangler",
    "dev",
    "src/index.ts",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--ip",
    "127.0.0.1",
    "--port",
    "8787",
  ];
  const logFd = openSync(e2eLog, "a");
  const child = spawn("pnpm", wranglerArgs, {
    cwd: API_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    shell: process.platform === "win32",
  });
  child.unref();
}

export default async function globalSetup() {
  stopApiProcesses();
  runCommandSync("pnpm", ["db:reset"], { cwd: repoRoot });
  runCommandSync("pnpm", ["--filter", "@fitbud/api", "setup:local"], {
    cwd: repoRoot,
  });

  if (process.platform === "win32") {
    startApiDevServer();
  } else {
    execCommandSync(
      `nohup pnpm exec wrangler dev src/index.ts --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 > ${e2eLog} 2>&1 &`,
      { cwd: API_ROOT },
    );
  }

  await waitForLogin();

  return async () => {
    stopApiProcesses();
  };
}
