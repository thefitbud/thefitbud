import { test, expect } from "./support/fixtures";
import { shot } from "./support/screenshots";

// Writes on a QA account (D-QA1-7): a private trainer note on QA Rohan. The note is not
// shared with the client; "visible to client" stays off.
test("add a private trainer note on QA Rohan", async ({ trainerPage: page, qa }) => {
  await page.goto(`/clients/${qa.slipping.relationshipId}/overview`);
  await expect(page.getByTestId("screen-TW-09").first()).toBeVisible();

  // Tag unique per run so a re-run without a reset still finds its own note.
  const body = `QA suite note ${Date.now().toString(36)}`;

  await page.getByRole("button", { name: /^add note$/i }).first().click();
  const composer = page.getByTestId("screen-TW-34");
  await expect(composer).toBeVisible();
  await shot(page, "web-notes__composer");

  await expect(composer.getByLabel(/visible to client/i)).not.toBeChecked();
  await composer.locator("textarea").first().fill(body);
  await composer.getByRole("button", { name: /save note/i }).click();

  await expect(page.getByText(/saved privately/i).first()).toBeVisible();
  await expect(page.getByText(body).first()).toBeVisible();
});
