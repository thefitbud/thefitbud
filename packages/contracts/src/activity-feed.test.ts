import { describe, expect, it } from "vitest";
import { activityFeedEventSchema } from "./activity-feed.js";

const base = {
  id: "log_edit:abc",
  relationshipId: "0126b70a-f0c3-4c7a-993b-128add941639",
  traineeDisplayName: "Priya Nair",
  type: "client_removed",
  subtype: "Removed",
  occurredAt: "2026-11-14T10:00:00.000Z",
  traineeLocalTime: null,
  summary: "Removed the dinner log",
};

describe("activity feed event (Z14-33)", () => {
  it("parses with and without the unread, notificationId and previousAteOut fields", () => {
    expect(activityFeedEventSchema.parse(base)).toEqual(base);
    const withFields = {
      ...base,
      previousAteOut: true,
      unread: true,
      notificationId: "5b3b44a3-dcfc-4d1c-9e2b-fd5e90bfa6f7",
    };
    expect(activityFeedEventSchema.parse(withFields)).toEqual(withFields);
  });

  it("refuses a notificationId that is not an id", () => {
    expect(activityFeedEventSchema.safeParse({ ...base, notificationId: "x" }).success).toBe(false);
  });
});
