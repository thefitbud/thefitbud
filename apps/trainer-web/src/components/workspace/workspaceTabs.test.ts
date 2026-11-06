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
  it("is Overview, Plan, Activity, Progress, Check-ins, History in that order", () => {
    expect(CLIENT_WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Plan",
      "Activity",
      "Progress",
      "Check-ins",
      "History",
    ]);
    expect(CLIENT_WORKSPACE_TABS.map((tab) => tab.segment)).toEqual([
      "overview",
      "plan",
      "activity",
      "progress",
      "check-ins",
      "history",
    ]);
  });

  it("does not include Sessions, Packages, or Configure", () => {
    const labels = CLIENT_WORKSPACE_TABS.map((tab) => tab.label);
    for (const forbidden of FORBIDDEN_CLIENT_WORKSPACE_TAB_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
    expect(CLIENT_WORKSPACE_TABS).toHaveLength(6);
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
    ]);
  });

  it("selects Overview on the index and overview routes, and never on Configure", () => {
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
      CLIENT_WORKSPACE_TABS.some((tab) =>
        isClientWorkspaceTabActive(`/clients/${RID}/configure`, RID, tab),
      ),
    ).toBe(false);
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
    expect(source).toContain("Configure coaching");
  });
});
