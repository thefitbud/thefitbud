import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/home.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("Home styles (W13-11, D-W13-9)", () => {
  it("wraps a long issue to two lines instead of cutting it to one", () => {
    const issue = rule(".home-issue-txt");
    expect(issue).toMatch(/-webkit-line-clamp:\s*2/);
    expect(issue).toMatch(/white-space:\s*normal/);
  });

  it("marks the row whose panel is open with the selected tint and an ink bar", () => {
    const open = rule(".home-row.is-open,\n.home-row.is-open:hover");
    expect(open).toContain("var(--row-sel)");
    expect(open).toContain("inset 3px 0 0 var(--brand)");
  });
});
