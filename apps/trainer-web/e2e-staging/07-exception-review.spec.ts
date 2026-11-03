import { test, expect } from "./support/fixtures";
import { exceptionStatus, openExceptionIds } from "./support/attention";
import { shot } from "./support/screenshots";

// Writes on a QA account (D-QA1-7): the trainer reviews and resolves one of QA Rohan's
// open exceptions. Only the trainer resolves, and only by pressing Resolve; the test
// checks the exception is still unresolved after "Mark reviewed" (no auto-resolve).
test("review and resolve one of QA Rohan's open exceptions", async ({ trainerPage: page, qa }) => {
  const relationshipId = qa.slipping.relationshipId!;
  const before = await openExceptionIds(page, relationshipId);
  expect(
    before.length,
    `${qa.slipping.displayName} has an open exception to resolve; if not, the QA reset has not run since the last write`,
  ).toBeGreaterThan(0);

  await page.goto("/");
  const home = page.getByTestId("screen-TW-04");
  const row = home
    .getByRole("grid", { name: "Needs attention" })
    .getByRole("row", { name: new RegExp(`^${qa.slipping.displayName}\\.`) });
  await row.getByRole("button", { name: "Review", exact: true }).click();

  const panel = page.getByTestId("screen-TW-05");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(qa.slipping.displayName);
  const exceptionId = new URL(page.url()).searchParams.get("exception");
  expect(exceptionId, "the panel puts the exception id in the URL").toBeTruthy();
  expect(before, "the panel opened one of the open exceptions").toContain(exceptionId);
  await shot(page, "web-exception__panel");

  // Mark reviewed acknowledges; it must not resolve.
  await panel.getByRole("button", { name: /^mark reviewed$/i }).click();
  await expect(panel.getByText(/marked reviewed/i).first()).toBeVisible();
  expect(await exceptionStatus(page, exceptionId!)).not.toBe("resolved");
  await expect(panel.getByRole("group", { name: "Outcome" })).toBeVisible();
  await shot(page, "web-exception__resolve-form");

  await panel.getByRole("button", { name: /^resolve$/i }).click();
  // Frame 02 (resolved): the panel stays open with a resolved banner and a short Undo window.
  const banner = page.getByTestId("exception-resolve-banner");
  await expect(banner).toBeVisible();
  await shot(page, "web-exception__resolved");
  // The resolve commits once the Undo window closes.
  await expect(banner.getByRole("button", { name: /^undo$/i })).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => exceptionStatus(page, exceptionId!), { timeout: 30_000 }).toBe("resolved");

  const after = await openExceptionIds(page, relationshipId);
  expect(after).not.toContain(exceptionId);
});
