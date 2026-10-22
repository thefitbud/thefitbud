import { openSync, truncateSync } from "node:fs";
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

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 5_000,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForLogin(maxAttempts = 90): Promise<void> {
  let lastError = "no response";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const health = await fetchJson(`${API}/health`);
      if (!health.ok) {
        lastError = `health ${health.status}`;
        await delay(500);
        continue;
      }
      const login = await fetchJson(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "rahul.coach@demo.fitbud.test",
          password: "FitBud-demo-2026",
        }),
      });
      const token = (login.body as { data?: { token?: string } } | null)?.data
        ?.token;
      if (login.ok && token) {
        return;
      }
      lastError = JSON.stringify(login.body);
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
    return;
  }
  spawnSync(
    "bash",
    [
      "-c",
      [
        "for pid in $(lsof -tiTCP:8787 -sTCP:LISTEN 2>/dev/null); do kill -9 $pid 2>/dev/null || true; done",
        "pkill -9 -f 'apps/api.*wrangler' 2>/dev/null || true",
        "pkill -9 -f 'wrangler.dev.src/index.ts' 2>/dev/null || true",
        "pkill -9 -f 'wrangler.js.dev' 2>/dev/null || true",
        "pkill -9 -f 'wrangler/bin/wrangler.js' 2>/dev/null || true",
        "pkill -9 -f 'wrangler-dist/cli.js.dev' 2>/dev/null || true",
        "pkill -9 -f '@cloudflare/workerd' 2>/dev/null || true",
        "pkill -9 -f 'workerd serve' 2>/dev/null || true",
        "fuser -k 8787/tcp 2>/dev/null || true",
        "sleep 3",
        "for pid in $(lsof -tiTCP:8787 -sTCP:LISTEN 2>/dev/null); do kill -9 $pid 2>/dev/null || true; done",
        "sleep 1",
      ].join("; "),
    ],
    { stdio: "ignore" },
  );
}

function startApiDevServer() {
  try {
    truncateSync(e2eLog);
  } catch {
    /* ignore */
  }
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
  if (process.env.SKIP_E2E_API_BOOT === "1") {
    await waitForLogin();
    return async () => {};
  }

  stopApiProcesses();
  if (process.env.SKIP_E2E_DB_RESET !== "1") {
    runCommandSync("pnpm", ["db:reset"], { cwd: repoRoot });
  }
  runCommandSync("pnpm", ["--filter", "@fitbud/api", "setup:local"], {
    cwd: repoRoot,
  });

  if (process.platform === "win32") {
    startApiDevServer();
  } else {
    try {
      truncateSync(e2eLog);
    } catch {
      /* ignore */
    }
    execCommandSync(
      `nohup pnpm exec wrangler dev src/index.ts --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 > ${e2eLog} 2>&1 &`,
      { cwd: API_ROOT },
    );
  }

  await waitForLogin();

  return async () => {
    if (process.env.SKIP_E2E_API_BOOT === "1") return;
    stopApiProcesses();
  };
}
