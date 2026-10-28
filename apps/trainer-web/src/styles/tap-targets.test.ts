import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tap-targets.css", import.meta.url), "utf8");
const modals = readFileSync(
  new URL("../components/workspace/WorkspaceModals.tsx", import.meta.url),
  "utf8",
);

function ipadBlock(source: string): string {
  const start = source.indexOf("@media (max-width: 1024px), (pointer: coarse)");
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start);
}

describe("IP1a iPad hit-target styles", () => {
  it("sizes the reminders Close control to 44×44 inside the tablet query", () => {
    const block = ipadBlock(css);
    const rule = block.slice(block.indexOf(".reminders-close"));
    expect(rule).toMatch(/width:\s*44px\s*!important/);
    expect(rule).toMatch(/height:\s*44px\s*!important/);
    expect(rule).toMatch(/min-width:\s*44px\s*!important/);
    expect(rule).toMatch(/min-height:\s*44px\s*!important/);
  });

  it("gives overflow menu items a 44px minimum height inside the tablet query", () => {
    const block = ipadBlock(css);
    const rule = block.slice(block.indexOf(".overflow-menu-item"));
    expect(rule).toMatch(/min-height:\s*44px\s*!important/);
  });

  it("marks only the reminders drawer Close control", () => {
    const reminders = modals.slice(modals.indexOf('modal.type === "responsiveness"'));
    expect(reminders).toContain('className="icon-btn reminders-close"');
    const note = modals.slice(0, modals.indexOf('modal.type === "responsiveness"'));
    expect(note).not.toContain("reminders-close");
  });
});
