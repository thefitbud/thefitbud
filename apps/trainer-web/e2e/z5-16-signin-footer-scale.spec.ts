/**
 * Z5-16 (W4 gaps G11, G12), sign-in footer on ds5-web-signin-footer.png:
 * - the help line and legal link text are 13px at the default root and scale
 *   with the root font size (rem, not a fixed px size);
 * - at 1440x900 the help row sits where the frame puts it, just above the
 *   legal row (the frame's text rows are centred at y≈833 and y≈860),
 *   not ~20px higher, while the two 44px targets still do not overlap.
 */
import { test, expect, type Page } from "@playwright/test";

async function openSignIn(page: Page, rootPx: number) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("screen-TW-01")).toBeVisible();
  await expect(page.locator("nav.auth-legal-links").getByRole("link")).toHaveCount(3);
  // Set after load, as in the CU8 cases of bt3f-signin-footer.spec.ts.
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
}

/** Font sizes and the vertical centre of each footer text row. */
async function measureFooter(page: Page) {
  return page.evaluate(() => {
    const help = document.querySelector(".auth-help");
    const helpLink = document.querySelector(".auth-help a");
    const nav = document.querySelector("nav.auth-legal-links");
    const legalLink = document.querySelector("nav.auth-legal-links a");
    if (
      !(help instanceof HTMLElement) ||
      !(helpLink instanceof HTMLElement) ||
      !(nav instanceof HTMLElement) ||
      !(legalLink instanceof HTMLElement)
    ) {
      return null;
    }
    // The text's own line box, not the 44px target around it.
    const textRow = (el: Element) => {
      const node = [...el.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (!node) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, centre: (r.top + r.bottom) / 2 };
    };
    return {
      helpFont: Number.parseFloat(getComputedStyle(help).fontSize),
      helpLinkFont: Number.parseFloat(getComputedStyle(helpLink).fontSize),
      legalFont: Number.parseFloat(getComputedStyle(legalLink).fontSize),
      helpRow: textRow(help),
      legalRow: textRow(legalLink),
      helpLinkBottom: helpLink.getBoundingClientRect().bottom,
      navTop: nav.getBoundingClientRect().top,
    };
  });
}

for (const rootPx of [16, 20, 24]) {
  test(`sign-in footer text scales with root font size ${rootPx}px`, async ({
    page,
  }) => {
    await openSignIn(page, rootPx);
    const m = await measureFooter(page);
    expect(m).not.toBeNull();
    // 13px at 16px = 0.8125rem.
    const expected = rootPx * 0.8125;
    expect(m!.legalFont).toBeCloseTo(expected, 1);
    expect(m!.helpFont).toBeCloseTo(expected, 1);
    expect(m!.helpLinkFont).toBeCloseTo(expected, 1);
    // The help row stays directly above the legal row at every size, and
    // its target never runs into the legal targets.
    expect(m!.helpRow).not.toBeNull();
    // (Its text centre is within one text size of the legal nav's top.)
    expect(m!.helpLinkBottom).toBeLessThanOrEqual(m!.navTop + 1);
    const lift = m!.navTop - m!.helpRow!.centre;
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThanOrEqual(expected);
  });
}

test("sign-in help line sits on the frame's row above the legal row", async ({
  page,
}) => {
  await openSignIn(page, 16);
  const m = await measureFooter(page);
  expect(m).not.toBeNull();
  expect(m!.helpRow).not.toBeNull();
  expect(m!.legalRow).not.toBeNull();
  // ds5-web-signin-footer.png at 1440x900: help text centred at y≈833,
  // legal links at y≈860 (27px apart). Before Z5-16 the help row sat at ~813.
  expect(Math.abs(m!.helpRow!.centre - 833)).toBeLessThanOrEqual(3);
  expect(Math.abs(m!.legalRow!.centre - 860)).toBeLessThanOrEqual(3);
  const rowGap = m!.legalRow!.centre - m!.helpRow!.centre;
  expect(rowGap).toBeGreaterThanOrEqual(24);
  expect(rowGap).toBeLessThanOrEqual(31);
});
