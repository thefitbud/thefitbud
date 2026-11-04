import { test, expect, expectNoIsoDates } from "./support/fixtures";
import { openExceptionIds } from "./support/attention";
import { shot } from "./support/screenshots";

test("Home lists QA Rohan's open exceptions and not the on-track client", async ({
  trainerPage: page,
  qa,
}) => {
  await page.goto("/");
  const home = page.getByTestId("screen-TW-04");
  await expect(home.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  const needsAttention = home.getByRole("grid", { name: "Needs attention" });
  // Home groups open items per client: one row per client, named in the row's label.
  await expect(
    needsAttention.getByRole("row", { name: new RegExp(`^${qa.slipping.displayName}\\.`) }),
  ).toBeVisible();
  await expect(
    needsAttention.getByRole("row", { name: new RegExp(`^${qa.onTrack.displayName}\\.`) }),
  ).toHaveCount(0);

  // The seed promises at least this many open items for the slipping client
  // (guarantees.openExceptionsSlippingMin). Fewer means the nightly reset did not run.
  const open = await openExceptionIds(page, qa.slipping.relationshipId!);
  expect(
    open.length,
    `${qa.slipping.displayName} has open exceptions; if not, the QA reset has not run since the last write`,
  ).toBeGreaterThanOrEqual(qa.expectations.guarantees.openExceptionsSlippingMin);

  await expectNoIsoDates(page);
  await shot(page, "web-home__attention");
});
