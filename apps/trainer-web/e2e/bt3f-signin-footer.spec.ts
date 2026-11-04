/**
 * BT3f / D-W3-15: on the sign-in page the legal links sit below the help line,
 * every link keeps a 44px target, and nothing overlaps (ds5-web-signin-footer.png).
 */
import { test, expect } from "@playwright/test";

for (const width of [375, 1024, 1440]) {
  test(`sign-in legal links sit below the help line at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/");
    await expect(page.getByTestId("screen-TW-01")).toBeVisible();

    const help = page.locator(".auth-help");
    const helpLink = help.getByRole("link", { name: "Need help?" });
    const legal = page.locator("nav.auth-legal-links");
    await expect(legal.getByRole("link")).toHaveCount(3);

    const helpBox = (await help.boundingBox())!;
    const cardBox = (await page.locator(".auth-fcard").boundingBox())!;
    expect(helpBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 1);

    const boxes = [(await helpLink.boundingBox())!];
    for (const link of await legal.getByRole("link").all()) {
      boxes.push((await link.boundingBox())!);
    }
    for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(44);

    const legalBox = (await legal.boundingBox())!;
    expect(legalBox.y).toBeGreaterThanOrEqual(helpBox.y + helpBox.height - 1);
    // No pair of targets intersects.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const c = boxes[j]!;
        const overlap =
          a.x < c.x + c.width - 1 &&
          c.x < a.x + a.width - 1 &&
          a.y < c.y + c.height - 1 &&
          c.y < a.y + a.height - 1;
        expect(overlap, `targets ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
}

test("sign-in tab order reaches help then the legal links last", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("screen-TW-01")).toBeVisible();
  await page.getByRole("link", { name: "Need help?" }).focus();
  const order: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => document.activeElement?.textContent ?? ""),
    );
  }
  expect(order).toEqual(["Privacy", "Terms", "Credits and licences"]);
});
