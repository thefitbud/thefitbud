import { test, expect, expectNoIsoDates } from "./support/fixtures";
import { shot } from "./support/screenshots";

// Writes on a QA account (D-QA1-7): the trainer reviews QA Rohan's pending check-in.
test("review QA Rohan's pending check-in from the inbox", async ({ trainerPage: page, qa }) => {
  await page.goto("/checkins");
  const inbox = page.getByTestId("screen-TW-22");
  await expect(inbox.getByRole("heading", { level: 1, name: "Check-ins" })).toBeVisible();

  // expectations.json guarantees one pending check-in for the slipping client.
  const row = inbox.getByRole("row", { name: new RegExp(qa.slipping.displayName) });
  const review = row.getByRole("link", { name: "Review", exact: true });
  await expect(
    review,
    `${qa.slipping.displayName} has a check-in to review; if not, the QA reset has not run since the last write`,
  ).toBeVisible();
  await expectNoIsoDates(page);
  await shot(page, "web-checkins__inbox");

  await review.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${qa.slipping.relationshipId}/check-ins/[0-9a-f-]{36}`));
  const review_ = page.getByTestId("screen-TW-20");
  await expect(review_.getByRole("heading", { level: 1, name: "Check-in review" })).toBeVisible();
  await expect(page.getByTestId("review-action-bar")).toBeVisible();
  await shot(page, "web-checkin-review__open");

  await page.getByRole("group", { name: "Outcome" }).getByRole("button", { name: "Acknowledged" }).click();
  await page.getByRole("button", { name: "Save review" }).click();

  // Frame 164: the same check-in, already reviewed.
  const bar = page.getByTestId("review-action-bar");
  await expect(bar).toContainText(/reviewed/i, { timeout: 30_000 });
  await expect(bar.getByRole("button", { name: "Edit review" })).toBeVisible();
  await shot(page, "web-checkin-review__reviewed");
});
