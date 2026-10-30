import { expect, type Page } from "@playwright/test";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";

export const DEMO_TRAINER_EMAIL = "rahul.coach@demo.fitbud.test";
export const DEMO_PASSWORD = "FitBud-demo-2026";

// Same keys as src/lib/session.ts (trainer web keeps the session in sessionStorage).
const TOKEN_KEY = "fitbud.trainer.accessToken";
const EMAIL_KEY = "fitbud.trainer.email";

// One password login per user per worker. /auth/login allows 30 attempts per IP
// per 15 minutes, so signing in through the UI before every test hits 429 part
// way through the suite. The sign-in screens keep their own UI tests (tw-b).
const tokens = new Map<string, Promise<string>>();

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { token?: string };
  } | null;
  const token = body?.data?.token;
  if (!res.ok || !token) {
    throw new Error(`demo login failed for ${email}: ${res.status}`);
  }
  return token;
}

export async function signIn(
  page: Page,
  email = DEMO_TRAINER_EMAIL,
  password = DEMO_PASSWORD,
): Promise<void> {
  let token = tokens.get(email);
  if (!token) {
    token = login(email, password);
    tokens.set(email, token);
    token.catch(() => tokens.delete(email));
  }
  const value = await token;
  await page.addInitScript(
    ([tokenKey, emailKey, t, e]) => {
      if (!sessionStorage.getItem(tokenKey)) {
        sessionStorage.setItem(tokenKey, t);
        sessionStorage.setItem(emailKey, e);
      }
    },
    [TOKEN_KEY, EMAIL_KEY, value, email] as const,
  );
  await page.goto("/");
  await expect(page).toHaveURL("/", { timeout: 45_000 });
}
