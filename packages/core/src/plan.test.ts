import { describe, expect, it } from "vitest";
import {
  canEditPlanVersion,
  canPromoteScheduledPlanVersion,
  canPublishPlanVersion,
  isImmutablePlanVersion,
} from "./plan.js";

describe("plan version transitions", () => {
  it("allows edits only on drafts", () => {
    expect(canEditPlanVersion("draft")).toBe(true);
    expect(canEditPlanVersion("published")).toBe(false);
    expect(canEditPlanVersion("effective")).toBe(false);
    expect(canEditPlanVersion("superseded")).toBe(false);
    expect(canEditPlanVersion("scheduled")).toBe(false);
  });

  it("marks non-draft versions immutable", () => {
    expect(isImmutablePlanVersion("draft")).toBe(false);
    expect(isImmutablePlanVersion("published")).toBe(true);
    expect(isImmutablePlanVersion("scheduled")).toBe(true);
    expect(isImmutablePlanVersion("effective")).toBe(true);
    expect(isImmutablePlanVersion("superseded")).toBe(true);
  });

  it("gates publish and schedule promotion", () => {
    expect(canPublishPlanVersion("draft")).toBe(true);
    expect(canPublishPlanVersion("effective")).toBe(false);
    expect(canPromoteScheduledPlanVersion("scheduled")).toBe(true);
    expect(canPromoteScheduledPlanVersion("draft")).toBe(false);
  });
});
