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

  it("stacks the name over the issue in one column", () => {
    const tx = rule(".home-who-tx");
    expect(tx).toMatch(/flex-direction:\s*column/);
    expect(rule(".home-row")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(112px/);
  });

  it("stacks the ask row's button and chip under the text beside a docked panel", () => {
    expect(css).toMatch(/\.home-triage\.has-panel \.home-li-ask \{[^}]*grid-template-areas:/);
    expect(css).toMatch(/\.home-triage\.has-panel \.home-li-ask > \.button-sm[^{]*\{[^}]*grid-area:\s*act/);
    expect(css).toMatch(/\.home-triage\.has-panel \.home-ask-inline \{[^}]*display:\s*flex/);
  });
});
