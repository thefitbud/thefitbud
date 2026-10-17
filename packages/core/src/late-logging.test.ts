import { describe, expect, it } from "vitest";
import { canLog } from "./late-logging.js";

describe("canLog (§3.7)", () => {
  const base = {
    nowIso: "2026-10-10T10:00:00.000Z",
    localDate: "2026-10-10",
    traineeTimezone: "UTC",
    required: true,
    windowEndsAt: "2026-10-10T09:00:00.000Z",
  };

  it("blocks ended relationships", () => {
    expect(
      canLog({ ...base, relationshipEnded: true }).decision,
    ).toBe("ended");
  });

  it("blocks superseded assignments", () => {
    expect(
      canLog({ ...base, assignmentScheduleStatus: "superseded" }).decision,
    ).toBe("superseded");
  });

  it("allows on-time required logging", () => {
    expect(
      canLog({
        ...base,
        nowIso: "2026-10-10T08:00:00.000Z",
        windowEndsAt: "2026-10-10T09:00:00.000Z",
      }).decision,
    ).toBe("ok");
  });

  it("allows late required logging while exception is open", () => {
    expect(
      canLog({
        ...base,
        exceptionStatus: "active",
      }).decision,
    ).toBe("ok_late");
  });

  it("locks required logging after resolve", () => {
    expect(
      canLog({
        ...base,
        exceptionStatus: "resolved",
        exceptionResolvedAt: "2026-10-10T08:00:00.000Z",
      }).decision,
    ).toBe("locked");
  });

  it("accepts client timestamp before resolve as ok_after_resolve", () => {
    expect(
      canLog({
        ...base,
        exceptionStatus: "resolved",
        exceptionResolvedAt: "2026-10-10T11:00:00.000Z",
        clientLoggedAt: "2026-10-10T10:00:00.000Z",
      }).decision,
    ).toBe("ok_after_resolve");
  });

  it("restricts optional items to their local day", () => {
    expect(
      canLog({
        ...base,
        required: false,
        clientLoggedAt: "2026-10-09T23:00:00.000Z",
      }).decision,
    ).toBe("locked");
    expect(
      canLog({
        ...base,
        required: false,
        clientLoggedAt: "2026-10-10T08:00:00.000Z",
      }).decision,
    ).toBe("ok");
  });

  it("allows edits until end of local day", () => {
    expect(
      canLog({
        ...base,
        alreadyLogged: true,
        nowIso: "2026-10-10T23:00:00.000Z",
      }).decision,
    ).toBe("ok");
    expect(
      canLog({
        ...base,
        alreadyLogged: true,
        nowIso: "2026-10-11T00:30:00.000Z",
      }).decision,
    ).toBe("locked");
  });
});
