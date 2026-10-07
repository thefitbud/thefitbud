import { describe, expect, it } from "vitest";
import {
  canRecordCheckinReview,
  canSaveCheckinDraft,
  canSubmitCheckin,
  daysForCheckinCadence,
  deriveCheckinStatus,
  missingRequiredCheckinAnswers,
  nextCheckinLocalDate,
} from "./checkin.js";

describe("checkin core", () => {
  it("maps cadence to day intervals", () => {
    expect(daysForCheckinCadence("weekly")).toBe(7);
    expect(daysForCheckinCadence("biweekly")).toBe(14);
    expect(daysForCheckinCadence("monthly")).toBe(28);
  });

  it("advances local date by cadence", () => {
    expect(
      nextCheckinLocalDate({ fromLocalDate: "2026-09-26", cadence: "weekly" }),
    ).toBe("2026-10-03");
  });

  it("derives scheduled / due / overdue / submitted / reviewed", () => {
    const window = {
      windowStartsAt: "2026-09-26T00:00:00.000Z",
      windowEndsAt: "2026-09-28T00:00:00.000Z",
    };
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-25T12:00:00.000Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("scheduled");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-26T12:00:00.000Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("due");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe("overdue");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "submitted",
        hasReview: false,
      }),
    ).toBe("submitted");
    expect(
      deriveCheckinStatus({
        ...window,
        nowIso: "2026-09-29T00:00:00.001Z",
        recordStatus: "submitted",
        hasReview: true,
      }),
    ).toBe("reviewed");
  });

  it("gates draft / submit / review transitions", () => {
    expect(canSaveCheckinDraft({ recordStatus: "draft" })).toBe(true);
    expect(canSaveCheckinDraft({ recordStatus: "submitted" })).toBe(false);
    expect(
      canSubmitCheckin({
        recordStatus: "draft",
        nowIso: "2026-09-26T00:00:00.000Z",
        windowStartsAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      canSubmitCheckin({
        recordStatus: "draft",
        nowIso: "2026-09-25T23:59:59.000Z",
        windowStartsAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      canRecordCheckinReview({ recordStatus: "submitted", hasReview: false }),
    ).toBe(true);
    expect(
      canRecordCheckinReview({ recordStatus: "submitted", hasReview: true }),
    ).toBe(false);
  });

  it("requires wellbeing for submission answers", () => {
    expect(missingRequiredCheckinAnswers(null)).toEqual(["wellbeing"]);
    expect(missingRequiredCheckinAnswers({ wellbeing: "  " })).toEqual([
      "wellbeing",
    ]);
    expect(missingRequiredCheckinAnswers({ wellbeing: "Good week" })).toEqual(
      [],
    );
  });
});
