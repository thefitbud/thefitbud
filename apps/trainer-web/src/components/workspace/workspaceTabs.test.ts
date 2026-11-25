import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLIENT_WORKSPACE_TABS,
  FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS,
  clientWorkspaceTabHref,
  isClientWorkspaceTabActive,
} from "./workspaceTabs";

const RID = "c422296e-ed7b-4196-a2b4-647096af3002";

describe("client workspace tabs", () => {
  it("is Overview, Plan, Activity, Progress, Check-ins, History, Settings in that order (W13-10)", () => {
    expect(CLIENT_WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Plan",
      "Activity",
      "Progress",
      "Check-ins",
      "History",
      "Settings",
    ]);
    expect(CLIENT_WORKSPACE_TABS.map((tab) => tab.segment)).toEqual([
      "overview",
      "plan",
      "activity",
      "progress",
      "check-ins",
      "history",
      "settings",
    ]);
  });

  it("does not include Sessions, Packages, or Configure; Settings is allowed and last", () => {
    const labels = CLIENT_WORKSPACE_TABS.map((tab) => tab.label);
    for (const forbidden of FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
    expect(FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS).toContain("Configure");
    expect(FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS).not.toContain("Settings");
    expect(CLIENT_WORKSPACE_TABS).toHaveLength(7);
    expect(labels.at(-1)).toBe("Settings");
  });

  it("only the Check-ins tab carries a badge", () => {
    expect(
      CLIENT_WORKSPACE_TABS.filter((tab) => "badge" in tab).map((tab) => tab.id),
    ).toEqual(["check-ins"]);
  });

  it("builds hrefs under the client workspace", () => {
    expect(
      CLIENT_WORKSPACE_TABS.map((tab) => clientWorkspaceTabHref(RID, tab)),
    ).toEqual([
      `/clients/${RID}/overview`,
      `/clients/${RID}/plan`,
      `/clients/${RID}/activity`,
      `/clients/${RID}/progress`,
      `/clients/${RID}/check-ins`,
      `/clients/${RID}/history`,
      `/clients/${RID}/settings`,
    ]);
  });

  it("selects Overview on the index and overview routes, and never on Configure", () => {
    const settings = CLIENT_WORKSPACE_TABS[6];
    expect(isClientWorkspaceTabActive(`/clients/${RID}/settings`, RID, settings)).toBe(true);
    // The old routes redirect into Settings sections (D-W13-15).
    expect(isClientWorkspaceTabActive(`/clients/${RID}/configure`, RID, settings)).toBe(true);
    expect(isClientWorkspaceTabActive(`/clients/${RID}/onboarding`, RID, settings)).toBe(true);
    const overview = CLIENT_WORKSPACE_TABS[0];
    expect(isClientWorkspaceTabActive(`/clients/${RID}`, RID, overview)).toBe(
      true,
    );
    expect(
      isClientWorkspaceTabActive(`/clients/${RID}/overview`, RID, overview),
    ).toBe(true);
    expect(
      isClientWorkspaceTabActive(`/clients/${RID}/configure`, RID, overview),
    ).toBe(false);
    expect(
      isClientWorkspaceTabActive(`/clients/${RID}/onboarding`, RID, overview),
    ).toBe(false);

    const checkins = CLIENT_WORKSPACE_TABS[4];
    expect(
      isClientWorkspaceTabActive(
        `/clients/${RID}/check-ins/chk-1`,
        RID,
        checkins,
      ),
    ).toBe(true);
    expect(
      CLIENT_WORKSPACE_TABS.filter((tab) =>
        isClientWorkspaceTabActive(`/clients/${RID}/configure`, RID, tab),
      ).map((tab) => tab.id),
    ).toEqual(["settings"]);
  });

  it("is the only tab strip WorkspaceHeader renders", () => {
    const source = readFileSync(
      new URL("./WorkspaceHeader.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("CLIENT_WORKSPACE_TABS.map");
    expect(source).not.toMatch(/>\s*Sessions\s*</);
    expect(source).not.toMatch(/>\s*Packages\s*</);
    expect(source).not.toMatch(/>\s*Configure\s*</);
    // No "Nudge" anywhere in the header (D-W13-5): the button is Remind.
    expect(source).not.toMatch(/nudg/i);
    expect(source).toContain(">Remind<");
  });
});
