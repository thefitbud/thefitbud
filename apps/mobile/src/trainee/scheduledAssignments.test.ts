import { describe, expect, it } from "vitest";
import { scheduledAssignments } from "./scheduledAssignments";

describe("scheduledAssignments", () => {
  it("hides superseded rows from trainee current lists", () => {
    const scheduled = { id: "scheduled", scheduleStatus: "scheduled" };
    const superseded = { id: "superseded", scheduleStatus: "superseded" };

    expect(
      scheduledAssignments([superseded, scheduled]).map((item) => item.id),
    ).toEqual(["scheduled"]);
  });
});
