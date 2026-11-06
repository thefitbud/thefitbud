import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tap-targets.css", import.meta.url), "utf8");
const modals = readFileSync(
  new URL("../components/workspace/WorkspaceModals.tsx", import.meta.url),
  "utf8",
);
const progressPage = readFileSync(
  new URL("../pages/ClientProgressPage.tsx", import.meta.url),
  "utf8",
);
const profilePage = readFileSync(
  new URL("../pages/settings/ProfileSettingsPage.tsx", import.meta.url),
  "utf8",
);

function ipadBlock(source: string): string {
  const start = source.indexOf("@media (max-width: 1024px), (pointer: coarse)");
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start);
}

function ruleBody(block: string, selector: string): string {
  const start = block.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = block.indexOf("{", start);
  const close = block.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return block.slice(open + 1, close);
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

describe("IP1b iPad hit-target styles", () => {
  it("pads the plan versions toggle to a 44px min height without enlarging type", () => {
    const rule = ruleBody(ipadBlock(css), ".plan-versions-toggle");
    expect(rule).toMatch(/min-height:\s*44px\s*!important/);
    expect(rule).toMatch(/padding-block:\s*0\.625rem\s*!important/);
    expect(rule).not.toMatch(/font-size/);
  });

  it("pads progress check-in links to a 44px box without enlarging type", () => {
    const rule = ruleBody(ipadBlock(css), ".progress-checkin-link");
    expect(rule).toMatch(/min-width:\s*44px\s*!important/);
    expect(rule).toMatch(/min-height:\s*44px\s*!important/);
    expect(rule).toMatch(/padding:\s*0\.625rem\s+0\.5rem\s*!important/);
    expect(rule).not.toMatch(/font-size/);
  });

  it("pads the profile Forgot it link to a 44px box without enlarging type", () => {
    const rule = ruleBody(ipadBlock(css), ".profile-forgot-link");
    expect(rule).toMatch(/min-width:\s*44px\s*!important/);
    expect(rule).toMatch(/min-height:\s*44px\s*!important/);
    expect(rule).toMatch(/padding:\s*0\.625rem\s+0\.35rem\s*!important/);
    expect(rule).not.toMatch(/font-size/);
  });

  it("marks every progress check-in link and the profile forgot link", () => {
    expect(progressPage).toContain('className="progress-checkin-link"');
    expect(progressPage.match(/progress-checkin-link/g)?.length).toBe(1);
    expect(profilePage).toContain('className="profile-forgot-link"');
  });
});
