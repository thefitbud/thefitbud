import { execSync, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const API_ROOT = "/workspace/apps/api";

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
  spawnSync(
    "bash",
    [
      "-c",
      "pkill -9 -f 'wrangler dev src/index.ts' 2>/dev/null || true; pkill -9 workerd 2>/dev/null || true; fuser -k 8787/tcp 2>/dev/null || true; sleep 2",
    ],
    { stdio: "ignore" },
  );
}

export default async function globalSetup() {
  stopApiProcesses();
  execSync("pnpm db:reset", {
    cwd: "/workspace",
    stdio: "inherit",
    env: process.env,
  });
  execSync("pnpm --filter @fitbud/api setup:local", {
    cwd: "/workspace",
    stdio: "inherit",
    env: process.env,
  });

  execSync(
    "nohup pnpm exec wrangler dev src/index.ts --local --persist-to .wrangler/state --ip 127.0.0.1 --port 8787 > /tmp/fitbud-api-e2e.log 2>&1 &",
    { cwd: API_ROOT, shell: "/bin/bash", stdio: "ignore" },
  );

  await waitForLogin();

  return async () => {
    stopApiProcesses();
  };
}
