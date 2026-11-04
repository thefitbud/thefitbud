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

/**
 * CU8: the legal nav's distance from the bottom is the padding-derived
 * remainder (--auth-legal-bottom = 17/72 of the 4.5rem bottom padding),
 * at 16, 20 and 24px root sizes. A fixed px pull-up only matches at 16px.
 */
for (const rootPx of [16, 20, 24]) {
  test(`sign-in legal offset tracks root font size ${rootPx}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("screen-TW-01")).toBeVisible();
    // Set after load. An init script ran before the document and did not stick.
    await page.evaluate((size) => {
      document.documentElement.style.setProperty("font-size", `${size}px`);
    }, rootPx);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        ),
      )
      .toBe(rootPx);

    const measured = await page.evaluate(() => {
      const side = document.querySelector(".auth-formside");
      const stack = document.querySelector(".auth-form-stack");
      const nav = document.querySelector("nav.auth-legal-links");
      if (!(side instanceof HTMLElement) || !(stack instanceof HTMLElement) || !(nav instanceof HTMLElement)) {
        return null;
      }
      const sideStyle = getComputedStyle(side);
      const padTop = Number.parseFloat(sideStyle.paddingTop);
      const padBottom = Number.parseFloat(sideStyle.paddingBottom);
      const stackHeight = stack.getBoundingClientRect().height;
      const contentHeight = side.clientHeight - padTop - padBottom;
      // The pull-up that shares the padding's source: 17/72 of it remains.
      const marginFromPadding = padBottom * (17 / 72 - 1);
      const expectedGap =
        padBottom + (contentHeight - stackHeight + marginFromPadding) / 2;
      const gap = window.innerHeight - nav.getBoundingClientRect().bottom;
      return { gap, expectedGap, padBottom };
    });
    expect(measured).not.toBeNull();
    expect(measured!.padBottom).toBeCloseTo(4.5 * rootPx, 0);
    expect(measured!.gap).toBeCloseTo(measured!.expectedGap, 0);
  });
}
