import { test, expect, waitForHome, ENV_OTP_CODE } from "./support/fixtures";

// D-QA1-14: the QA OTP code is public but must never reach an image. Screenshots and
// the trace are switched off for this file, because Playwright's automatic failure
// screenshot would capture the filled code boxes and the trace's DOM snapshots would
// hold the typed value. No `shot()` call, either: there is no screenshot of the code
// screen at all, before, during or after.
test.use({ screenshot: "off", trace: "off", video: "off" });

test("sign in with an emailed code (staging test OTP)", async ({ page, qa }) => {
  const code = process.env[ENV_OTP_CODE] ?? "";
  // A boolean, so a failure never prints the value.
  expect(/^\d{6}$/.test(code), `${ENV_OTP_CODE} is a 6-digit code`).toBe(true);

  await page.goto("/sign-in/code");
  await expect(page.getByRole("heading", { level: 1, name: /sign in with a code/i })).toBeVisible();
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(qa.trainerEmail);
  await page.getByRole("button", { name: /^send code$/i }).click();

  // Six single-digit boxes in a group named "6-digit code".
  const boxes = page.getByRole("group", { name: /6-digit code/i }).getByRole("textbox");
  await expect(boxes).toHaveCount(6, { timeout: 20_000 });
  for (let i = 0; i < 6; i += 1) {
    await boxes.nth(i).fill(code[i]!);
  }
  await page.getByRole("button", { name: /verify and sign in/i }).click();

  await waitForHome(page);
});
