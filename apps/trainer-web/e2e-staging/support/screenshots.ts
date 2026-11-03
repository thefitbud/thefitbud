import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { SCREENSHOT_DIR } from "./paths.js";

/**
 * Screenshots go into the public `qa-report` artifact byte for byte (D-QA1-14), so this
 * module is the only place the suite takes one, and it refuses a page that shows a
 * credential.
 *
 * Names are `web-<journey>__<step>`; the summarizer and the UI bot match on them and the
 * mapping table in `playwright.staging.config.ts` lists them.
 */
export const SHOT_NAME_RE = /^web-[a-z0-9-]+__[a-z0-9-]+$/;

/**
 * True when nothing on the page holds a credential: no filled 6-digit code box, no
 * filled password field, and none of the secret values anywhere in an input or in the
 * visible text. The secret values come from the environment, so a clean spec can still
 * produce a dirty image; this check looks at the page, not the source.
 */
export async function isScreenshotSafe(
  page: Page,
  secrets: Array<string | undefined> = [process.env.QA_TEST_OTP_CODE, process.env.FITBUD_QA_PASSWORD],
): Promise<boolean> {
  const values = secrets.filter((s): s is string => Boolean(s && s.trim()));
  const dirty = await page.evaluate((needles) => {
    const fields = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
    const fieldDirty = fields.some((el) => {
      if (!el.value) return false;
      if (el.closest(".otp-boxes")) return true;
      if (el.type === "password") return true;
      return needles.some((n) => el.value.includes(n));
    });
    const text = document.body?.innerText ?? "";
    return fieldDirty || needles.some((n) => text.includes(n));
  }, values);
  return !dirty;
}

/** Takes `qa-results/web/screenshots/<name>.png` at the page's viewport (1440x900). */
export async function shot(page: Page, name: string): Promise<string> {
  if (!SHOT_NAME_RE.test(name)) {
    throw new Error(`screenshot name "${name}" must look like web-<journey>__<step>`);
  }
  if (!(await isScreenshotSafe(page))) {
    // Not echoing any field value: only that the page was refused.
    throw new Error(`refusing to screenshot "${name}": the page shows a credential (D-QA1-14)`);
  }
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return file;
}
