import { describe, expect, it } from "vitest";
import {
  entityTypeForRealtimeEvent,
  isAuthorizedRealtimeChannel,
} from "./realtime.js";

describe("realtime helpers", () => {
  it("maps event types to entity types", () => {
    expect(entityTypeForRealtimeEvent("effective_plan_changed")).toBe(
      "plan_version",
    );
    expect(entityTypeForRealtimeEvent("checkin_submitted")).toBe("checkin");
    expect(entityTypeForRealtimeEvent("exception_acknowledged")).toBe(
      "exception",
    );
  });

  it("validates relationship channels", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(isAuthorizedRealtimeChannel(`relationship:${id}`, id)).toBe(true);
    expect(isAuthorizedRealtimeChannel(`relationship:other`, id)).toBe(false);
  });
});
