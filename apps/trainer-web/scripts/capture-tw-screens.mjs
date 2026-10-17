import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const OUT = join(
  process.cwd(),
  "../../docs/implementation/screens/trainer-web",
);
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function loginToken() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const body = await res.json();
  return body.token;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const token = await loginToken();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(OUT, "TW-01.png"), fullPage: true });

  await page.evaluate(
    ({ token, email }) => {
      sessionStorage.setItem("fitbud.trainer.accessToken", token);
      sessionStorage.setItem("fitbud.trainer.email", email);
    },
    { token, email: EMAIL },
  );

  const attentionRes = await fetch(
    `${API}/exceptions/attention?groupBy=relationship`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const exceptionId =
    (await attentionRes.json()).groups?.[0]?.items?.[0]?.id ?? "";

  const clientsRes = await fetch(`${API}/clients?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const clients = (await clientsRes.json()).items ?? [];
  const rohan = clients.find((c) =>
    c.traineeDisplayName?.toLowerCase().includes("rohan"),
  );
  const rid = rohan?.relationshipId ?? clients[0]?.relationshipId ?? "";

  const invitesRes = await fetch(`${API}/invitations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const inviteId =
    (await invitesRes.json()).items?.find((i) => i.status === "pending")?.id ??
    "";

  const shots = [
    ["TW-02", "/welcome"],
    ["TW-03", "/"],
    ["TW-04", "/"],
    ["TW-05", exceptionId ? `/?exception=${exceptionId}` : "/"],
    ["TW-06", "/clients"],
    ["TW-07", "/clients/add"],
    ["TW-08", inviteId ? `/invitations/${inviteId}` : "/clients"],
    ["TW-09", rid ? `/clients/${rid}/overview` : "/clients"],
    ["TW-10", rid ? `/clients/${rid}/onboarding` : "/"],
    ["TW-11", rid ? `/clients/${rid}/configure` : "/"],
    ["TW-12", rid ? `/clients/${rid}/plan` : "/"],
    ["TW-13", "/templates/workouts"],
    ["TW-14", "/templates/diets"],
    ["TW-15", rid ? `/clients/${rid}/plan` : "/"],
    ["TW-16", rid ? `/clients/${rid}/plan?assign=1` : "/"],
    ["TW-17", rid ? `/clients/${rid}/activity` : "/"],
    ["TW-18", rid ? `/clients/${rid}/progress` : "/"],
    ["TW-19", rid ? `/clients/${rid}/check-ins` : "/"],
    ["TW-20", rid ? `/clients/${rid}/check-ins` : "/"],
    ["TW-21", rid ? `/clients/${rid}/history` : "/"],
    ["TW-22", "/checkins"],
    ["TW-23", "/templates/workouts"],
    ["TW-24", "/templates/onboarding"],
    ["TW-25", "/templates/checkins"],
    ["TW-26", "/templates/libraries"],
    ["TW-27", "/templates/workouts"],
    ["TW-28", "/settings/profile"],
    ["TW-29", "/settings/notifications"],
    ["TW-30", rid ? `/clients/${rid}/overview` : "/"],
    ["TW-31", rid ? `/clients/${rid}/overview` : "/"],
    ["TW-32", "/"],
    ["TW-33", "/not-a-real-route"],
    ["TW-34", rid ? `/clients/${rid}/overview` : "/"],
  ];

  for (const [id, path] of shots) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(OUT, `${id}.png`), fullPage: true });
  }

  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), shots }, null, 2),
  );
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
