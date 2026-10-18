import { describe, expect, it } from "vitest";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import {
  adherenceStateLabel,
  checkinStatusLabel,
  clientDirectoryFilterKey,
  clientDirectoryFiltersFromKey,
  clientDirectoryListQuery,
  directoryWorkspaceHref,
  distinctGoalShorts,
  emptyClientDirectoryFilters,
  hasClientDirectoryFilters,
  onboardingStatusLabel,
  pageClientDirectory,
  parseClientDirectoryFilters,
  primaryActionForStatus,
  toggleClientDirectoryValue,
  writeClientDirectoryFilters,
  CLIENT_STATUS_FILTERS,
  type ClientDirectoryFilters,
} from "./clients";

const relationshipId = "33333333-3333-4333-8333-333333333333";
const invitationId = "06b54e81-016c-4220-a9a8-31195324669b";

function directoryItem(
  overrides: Partial<ClientDirectoryItem> = {},
): ClientDirectoryItem {
  return {
    relationshipId,
    invitationId: null,
    traineeDisplayName: "Priya Sharma",
    status: "active",
    goalShort: "Build strength",
    nextCheckin: null,
    effectivePlan: null,
    adherenceState: "on_track",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("client directory filters", () => {
  it("keeps repeated status, adherence, and goal values and drops unknown ones", () => {
    const params = new URLSearchParams();
    params.set("q", "priya");
    params.append("status", "active");
    params.append("status", "not-a-status");
    params.append("status", "invited");
    params.append("status", "active");
    params.append("adherenceState", "needs_attention");
    params.append("adherenceState", "score");
    params.append("goal", " Build strength ");
    params.append("goal", "Build strength");
    params.append("goal", "");
    params.set("cursor", "stale-page");
    params.set("view", "roster");

    const filters = parseClientDirectoryFilters(params);

    expect(filters).toEqual({
      q: "priya",
      status: ["invited", "active"],
      adherenceState: ["needs_attention"],
      goal: ["Build strength"],
      renewal: [],
      segment: "current",
    });
    expect(hasClientDirectoryFilters(filters)).toBe(true);
    expect(hasClientDirectoryFilters(emptyClientDirectoryFilters())).toBe(
      false,
    );

    const written = writeClientDirectoryFilters(params, filters);
    expect(written.get("q")).toBe("priya");
    expect(written.getAll("status")).toEqual(["invited", "active"]);
    expect(written.getAll("adherenceState")).toEqual(["needs_attention"]);
    expect(written.getAll("goal")).toEqual(["Build strength"]);
    expect(written.has("cursor")).toBe(false);
    expect(written.get("view")).toBe("roster");
  });

  it("maps status=ended to the Ended segment", () => {
    const params = new URLSearchParams("status=ended");
    const filters = parseClientDirectoryFilters(params);
    expect(filters.segment).toBe("ended");
    expect(filters.status).toEqual(["ended"]);
    const written = writeClientDirectoryFilters(new URLSearchParams(), filters);
    expect(written.get("segment")).toBe("ended");
    expect(written.getAll("status")).toEqual(["ended"]);
  });

  it("current list query never includes ended", () => {
    const query = clientDirectoryListQuery(emptyClientDirectoryFilters(), {
      limit: 30,
    });
    expect(query.status).toEqual([...CLIENT_STATUS_FILTERS]);
    expect(query.status?.includes("ended")).toBe(false);
  });

  it("round-trips a filter key and omits the cursor when a filter page starts over", () => {
    const filters: ClientDirectoryFilters = {
      q: "  ada ",
      status: ["active"],
      adherenceState: ["no_recent_data"],
      goal: ["Fat loss"],
      renewal: ["due"],
      segment: "current",
    };
    const key = clientDirectoryFilterKey(filters);
    expect(clientDirectoryFiltersFromKey(key)).toEqual(filters);
    expect(clientDirectoryFiltersFromKey("{")).toEqual(
      emptyClientDirectoryFilters(),
    );

    expect(
      clientDirectoryListQuery(filters, { cursor: null, limit: 30 }),
    ).toEqual({
      q: "ada",
      status: ["active"],
      adherenceState: ["no_recent_data"],
      goal: ["Fat loss"],
      renewal: ["due"],
      limit: 30,
    });
  });

  it("labels and primary actions match TW-06", () => {
    expect(onboardingStatusLabel("invited")).toMatch(/invited/i);
    expect(adherenceStateLabel("needs_attention")).toMatch(/attention/i);
    expect(checkinStatusLabel("submitted")).toMatch(/submitted/i);
    expect(primaryActionForStatus("invited", invitationId)).toEqual({
      label: "Resend invite",
      href: `/invitations/${invitationId}`,
    });
    expect(primaryActionForStatus("active").label).toBe("Open");
    expect(primaryActionForStatus("coaching_ready").label).toBe("Set up plan");
    expect(primaryActionForStatus("onboarding_submitted").label).toBe(
      "Review intake",
    );
  });

  it("invited rows open invitation detail, not a workspace", () => {
    expect(
      directoryWorkspaceHref({
        relationshipId: null,
        invitationId,
        status: "invited",
      }),
    ).toBe(`/invitations/${invitationId}`);
    expect(
      directoryWorkspaceHref({
        relationshipId,
        invitationId: null,
        status: "active",
      }),
    ).toBe(`/clients/${relationshipId}/overview`);
  });

  it("distinct goals ignore blanks", () => {
    expect(
      distinctGoalShorts([
        { goalShort: "Fat loss" },
        { goalShort: null },
        { goalShort: "  " },
        { goalShort: "Fat loss" },
        { goalShort: "Strength" },
      ]),
    ).toEqual(["Fat loss", "Strength"]);
  });

  it("toggle keeps canonical order", () => {
    expect(
      toggleClientDirectoryValue(CLIENT_STATUS_FILTERS, ["active"], "invited"),
    ).toEqual(["invited", "active"]);
  });

  it("pages the directory until exhausted", async () => {
    const pages = [
      {
        items: [directoryItem({ traineeDisplayName: "A" })],
        nextCursor: "c1",
      },
      {
        items: [directoryItem({ traineeDisplayName: "B" })],
        nextCursor: null,
      },
    ];
    let calls = 0;
    const items = await pageClientDirectory(async () => {
      const page = pages[calls]!;
      calls += 1;
      return page;
    });
    expect(items.map((i) => i.traineeDisplayName)).toEqual(["A", "B"]);
    expect(calls).toBe(2);
  });
});
