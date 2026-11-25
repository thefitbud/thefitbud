import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/components/side-panel/side-panel.css"), "utf8");

function rule(selector: string): string {
  const start = css.lastIndexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("Resolve-several bar button (W13-11, frame W-02f)", () => {
  it("is a white pill with navy text, not navy on navy", () => {
    const bar = rule(".sp-bulk-bar");
    expect(bar).toContain("background: var(--deep-navy");
    const btn = rule(".sp-bulk-bar .button-primary");
    expect(btn).toMatch(/background:\s*var\(--white\)/);
    expect(btn).toMatch(/color:\s*var\(--deep-navy\)/);
    expect(btn).toMatch(/min-height:\s*44px/);
  });

  it("keeps a visible hover surface and a white focus ring on navy", () => {
    expect(rule(".sp-bulk-bar .button-primary:hover")).toMatch(/background:\s*var\(--brand-tint\)/);
    expect(rule(".sp-bulk-bar .button-primary:focus-visible")).toMatch(/background:\s*var\(--brand-tint\)/);
    expect(css).toMatch(/\.sp-bulk-bar \.button-primary:focus-visible \{[^}]*outline:\s*2px solid #fff/);
  });
});
