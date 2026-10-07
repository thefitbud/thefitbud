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

  it("round-trips a filter key and omits the cursor when a filter page starts over", () => {
    const filters: ClientDirectoryFilters = {
      q: "  ada ",
      status: ["active"],
      adherenceState: ["no_recent_data"],
      goal: ["Fat loss"],
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
      limit: 30,
    });
    expect(
      clientDirectoryListQuery(emptyClientDirectoryFilters(), {
        cursor: "",
        limit: 30,
      }),
    ).toEqual({ limit: 30 });
  });

  it("toggles a status without leaving the lifecycle order", () => {
    expect(
      toggleClientDirectoryValue(CLIENT_STATUS_FILTERS, ["active"], "invited"),
    ).toEqual(["invited", "active"]);
    expect(
      toggleClientDirectoryValue(
        CLIENT_STATUS_FILTERS,
        ["invited", "active"],
        "invited",
      ),
    ).toEqual(["active"]);
  });
});

describe("client directory rows", () => {
  it("does not link a pending invitation into a workspace", () => {
    expect(
      directoryWorkspaceHref({ relationshipId: null, status: "invited" }),
    ).toBeNull();
    expect(
      directoryWorkspaceHref({ relationshipId: null, status: "active" }),
    ).toBeNull();
    expect(primaryActionForStatus("invited")).toEqual({
      label: "Waiting for acceptance",
      href: null,
    });
    expect(onboardingStatusLabel("onboarding_submitted")).toBe(
      "Onboarding submitted",
    );
  });

  it("links a relationship to the status primary action", () => {
    expect(
      directoryWorkspaceHref({
        relationshipId,
        status: "onboarding_submitted",
      }),
    ).toBe(`/clients/${relationshipId}/onboarding`);
    expect(
      directoryWorkspaceHref({ relationshipId, status: "coaching_ready" }),
    ).toBe(`/clients/${relationshipId}/overview`);
    expect(
      directoryWorkspaceHref({ relationshipId, status: "active" }),
    ).toBe(`/clients/${relationshipId}/overview`);
    expect(
      directoryWorkspaceHref({ relationshipId, status: "ended" }),
    ).toBeNull();
  });

  it("labels adherence and check-in state in words", () => {
    expect(adherenceStateLabel("on_track")).toBe("On track");
    expect(adherenceStateLabel("needs_attention")).toBe("Needs attention");
    expect(adherenceStateLabel("no_recent_data")).toBe("No recent data");
    expect(adherenceStateLabel("not_available")).toBe("Not available");
    expect(checkinStatusLabel("scheduled")).toBe("Scheduled");
    expect(checkinStatusLabel("due")).toBe("Due");
    expect(checkinStatusLabel("submitted")).toBe("Submitted");
    expect(checkinStatusLabel("reviewed")).toBe("Reviewed");
    expect(checkinStatusLabel("overdue")).toBe("Overdue");
  });
});

describe("goal options from directory pages", () => {
  it("pages without a goal filter and keeps distinct short goals", async () => {
    const calls: unknown[] = [];
    const pages = [
      {
        items: [
          directoryItem({ goalShort: "Build strength" }),
          directoryItem({
            relationshipId: null,
            invitationId: "55555555-5555-4555-8555-555555555555",
            traineeDisplayName: "Meera Krishnan",
            status: "invited" as const,
            goalShort: null,
            adherenceState: "not_available" as const,
          }),
        ],
        nextCursor: "page-2",
      },
      {
        items: [
          directoryItem({
            relationshipId: "44444444-4444-4444-8444-444444444444",
            traineeDisplayName: "Arjun Mehta",
            goalShort: "  Fat loss  ",
          }),
          directoryItem({ goalShort: "Build strength" }),
          directoryItem({ goalShort: "   " }),
        ],
        nextCursor: null,
      },
    ];
    let index = 0;
    const items = await pageClientDirectory(async (query) => {
      calls.push(query);
      const page = pages[index];
      index += 1;
      if (!page) throw new Error("unexpected extra page");
      return page;
    });

    expect(calls).toEqual([{ limit: 50 }, { limit: 50, cursor: "page-2" }]);
    expect(distinctGoalShorts(items)).toEqual(["Build strength", "Fat loss"]);
  });

  it("stops when the cursor does not advance", async () => {
    const calls: unknown[] = [];
    await pageClientDirectory(
      async (query) => {
        calls.push(query);
        return {
          items: [directoryItem()],
          nextCursor: "same",
        };
      },
      emptyClientDirectoryFilters(),
      { limit: 50, maxPages: 5 },
    );
    expect(calls).toHaveLength(2);
  });
});
