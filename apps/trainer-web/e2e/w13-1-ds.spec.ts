import { expect, test } from "@playwright/test";

test("W13-1 design system sheet uses navy primary and the 12px floor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/__ds");
  await expect(page.getByTestId("screen-W-00")).toBeVisible();
  const primary = page.getByRole("button", { name: "New template" });
  await expect(primary).toBeVisible();
  const bg = await primary.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(26, 18, 72)");
  const problems = await page.evaluate(() => {
    const small: string[] = [];
    const clip: string[] = [];
    let broken = 0;
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) broken += 1;
    });
    document.querySelectorAll("body *").forEach((el) => {
      const text = [...el.childNodes]
        .filter((node) => node.nodeType === 3 && node.textContent?.trim())
        .map((node) => node.textContent?.trim() ?? "")
        .join(" ");
      if (!text) return;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width === 0) return;
      const size = Number.parseFloat(cs.fontSize);
      if (size < 12 && !el.closest(".ui-kbd")) small.push(`${size}:${text.slice(0, 24)}`);
      if (
        el.scrollWidth > el.clientWidth + 1 &&
        cs.overflow !== "visible" &&
        cs.overflowX !== "visible"
      ) {
        clip.push(text.slice(0, 40));
      }
    });
    return { small, clip, broken };
  });
  expect(problems.broken).toBe(0);
  expect(problems.small).toEqual([]);
  expect(problems.clip).toEqual([]);
});
