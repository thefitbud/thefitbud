import { test, expect, expectNoIsoDates } from "./support/fixtures";
import { shot } from "./support/screenshots";

test("clients list shows the two QA clients", async ({ trainerPage: page, qa }) => {
  await page
    .locator('aside[aria-label="Primary"]')
    .getByRole("link", { name: /^Clients/ })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/clients");

  const screen = page.getByTestId("screen-TW-06");
  await expect(screen.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  // Names come from expectations.json (QA Aarav, QA Rohan), not from this file.
  for (const client of [qa.onTrack, qa.slipping]) {
    await expect(screen.getByText(client.displayName).first()).toBeVisible();
  }
  await expectNoIsoDates(page);
  await shot(page, "web-clients__list");
});
