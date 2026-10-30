import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signIn } from "./support/session";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";

function unwrap<T>(json: { data?: T } & T): T {
  return (json.data ?? json) as T;
}

async function fetchDevMailCode(to: string): Promise<string> {
  const res = await fetch(`${API}/dev/mail?to=${encodeURIComponent(to)}&limit=1`);
  if (!res.ok) throw new Error(`dev mail ${res.status}`);
  const body = unwrap<{ items?: Array<{ subject?: string }> }>(await res.json());
  const match = /(\d{6})/.exec(body.items?.[0]?.subject ?? "");
  if (!match) throw new Error("no OTP in dev mail subject");
  return match[1];
}

async function apiToken(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    sessionStorage.getItem("fitbud.trainer.accessToken"),
  );
  if (!token) throw new Error("missing session token");
  return token;
}

async function findClient(
  page: Page,
  namePart: string,
): Promise<{ relationshipId: string; traineeDisplayName: string }> {
  const token = await apiToken(page);
  const res = await fetch(`${API}/clients?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = unwrap<{ items: Array<{ relationshipId: string | null; traineeDisplayName: string }> }>(
    await res.json(),
  );
  const match = body.items.find((c) =>
    c.traineeDisplayName.toLowerCase().includes(namePart.toLowerCase()),
  );
  if (!match?.relationshipId) throw new Error(`client not found: ${namePart}`);
  return { relationshipId: match.relationshipId, traineeDisplayName: match.traineeDisplayName };
}

test("email OTP sign-in via dev mail sink", async ({ page }) => {
  await page.goto("/sign-in/code");
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.getByRole("button", { name: /^send code$/i }).click();
  await page.getByRole("textbox", { name: /6-digit code/i }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const code = await fetchDevMailCode(EMAIL);
  await page.getByRole("textbox", { name: /6-digit code/i }).fill(code);
  await page.getByRole("button", { name: /verify and sign in/i }).click();
  await expect(page).toHaveURL("/");
});

test("home acknowledge then resolve", async ({ page }) => {
  await signIn(page);
  const token = await apiToken(page);
  const attention = unwrap<{ groups: Array<{ items: Array<{ id: string; status: string }> }> }>(
    await fetch(`${API}/exceptions/attention?groupBy=relationship`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),
  );
  const active = attention.groups
    .flatMap((g) => g.items)
    .find((i) => i.status === "active" || i.status === "detected");
  expect(active?.id).toBeTruthy();
  await page.goto(`/?exception=${active!.id}`);
  await page.getByRole("button", { name: /acknowledge/i }).click();
  await page
    .getByTestId("screen-TW-05")
    .getByRole("button", { name: /^resolve$/i })
    .click();
  await expect(page.getByTestId("screen-TW-05")).not.toBeVisible({ timeout: 15_000 });
});

test("apply a workout template from the library", async ({ page }) => {
  await signIn(page);
  const aarav = await findClient(page, "aarav");
  const token = await apiToken(page);
  const templates = unwrap<{ items: Array<{ id: string; title: string }> }>(
    await fetch(`${API}/templates?limit=20&templateType=workout`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),
  );
  const template =
    templates.items.find((t) => t.title.toLowerCase().includes("beginner home")) ??
    templates.items[0];
  expect(template?.id).toBeTruthy();

  const applied = await fetch(
    `${API}/plans/relationships/${aarav.relationshipId}/from-template`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ templateId: template!.id }),
    },
  );
  expect(applied.ok).toBeTruthy();

  await page.goto(`/templates/workouts/${template!.id}`);
  await page.getByTestId("screen-TW-13").waitFor();
  await page.goto(`/clients/${aarav.relationshipId}/plan`);
  await page.getByTestId("screen-TW-12").waitFor();
  await expect(page.getByRole("link", { name: /continue editing/i })).toBeVisible({
    timeout: 30_000,
  });
});

test("share a client-visible note", async ({ page }) => {
  await signIn(page);
  const rohan = await findClient(page, "rohan");
  await page.goto(`/clients/${rohan.relationshipId}/overview`);
  await page.getByTestId("screen-TW-09").waitFor();
  const addNote = page.getByRole("button", { name: /add note/i }).first();
  if (await addNote.isVisible().catch(() => false)) {
    await addNote.click();
  } else {
    await page.getByLabel("More actions").click();
    await page.getByRole("button", { name: /^add note$/i }).click();
  }
  await page.getByTestId("screen-TW-34").waitFor();
  await page.getByLabel(/visible to client/i).check();
  await page.locator("textarea").first().fill("E2E visible note for client");
  await page.getByRole("button", { name: /save note/i }).click();
  // Seeded history already has client-visible notes (answered coach asks); assert on the new one.
  await expect(page.getByText("E2E visible note for client").first()).toBeVisible();
  await expect(page.getByText(/visible to client/i).first()).toBeVisible();
});

test("end coaching then reactivate", async ({ page }) => {
  await signIn(page);
  const farhan = await findClient(page, "farhan");
  const token = await apiToken(page);
  const endRes = await fetch(`${API}/relationships/${farhan.relationshipId}/end`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ reason: "e2e test" }),
  });
  expect(endRes.ok).toBeTruthy();

  await page.goto("/settings/ended");
  await page.getByRole("button", { name: /^reactivate$/i }).first().click();
  await expect(page.getByRole("dialog")).toContainText(/reactivate coaching/i);
  await page.getByRole("button", { name: /send reactivation request/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });
});
