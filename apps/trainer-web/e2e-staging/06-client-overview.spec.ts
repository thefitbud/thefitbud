import { test, expect, expectNoIsoDates } from "./support/fixtures";
import { shot } from "./support/screenshots";

// Opens each QA client from the roster, the way a trainer does, and checks the URL
// carries the relationship id the seed promised (expectations.json).
const clients = [
  { key: "slipping", shotName: "web-client-overview__rohan" },
  { key: "onTrack", shotName: "web-client-overview__aarav" },
] as const;

for (const { key, shotName } of clients) {
  test(`client overview opens for the ${key === "onTrack" ? "on-track" : "slipping"} QA client`, async ({
    trainerPage: page,
    qa,
  }) => {
    const client = qa[key];
    await page.goto("/clients");
    const roster = page.getByTestId("screen-TW-06");
    await roster.getByText(client.displayName).first().click();

    await expect(page).toHaveURL(new RegExp(`/clients/${client.relationshipId}(/overview)?$`));
    await expect(page.getByTestId("screen-TW-09").first()).toBeVisible();
    // The workspace header names the client.
    await expect(page.getByTestId("screen-TW-09a")).toContainText(client.displayName);
    if (key === "slipping") {
      // Open exceptions are what the attention card is for; the seed guarantees them.
      await expect(page.getByTestId("ov-attention")).toBeVisible();
    } else {
      // The on-track client's status chip, from the header.
      await expect(page.getByTestId("screen-TW-09a")).toContainText("On track");
    }

    await expectNoIsoDates(page);
    await shot(page, shotName);
  });
}
