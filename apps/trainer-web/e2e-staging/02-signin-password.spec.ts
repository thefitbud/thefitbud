import { test, expect, captureSession, signInWithPassword } from "./support/fixtures";
import { shot } from "./support/screenshots";

// The browser keeps a masked password field, but the trace would hold the typed value
// in its DOM snapshots, so this file runs without one.
test.use({ trace: "off" });

test("sign in with email and password", async ({ page, qa }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: /welcome back, coach/i })).toBeVisible();
  // Before anything is typed: the empty form is the frame (D-QA1-14 for the password too).
  await shot(page, "web-signin__form");

  await signInWithPassword(page, qa.trainerEmail);

  await expect(page.getByTestId("screen-TW-04")).toBeVisible();
  // The signed-in trainer is the QA trainer, not whoever else is on the page.
  await expect(page.getByText(qa.trainer.displayName).first()).toBeVisible();
  await captureSession(page);
});
