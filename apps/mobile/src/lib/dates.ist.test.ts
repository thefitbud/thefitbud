import { describe, expect, it } from "vitest";
import { addDays, localDateInTimezone } from "./dates";

/** IST local-day helpers for notification "Yesterday" vs same-day relative. */
function timePrefixIst(
  iso: string,
  today: string,
  timeZone = "Asia/Kolkata",
): string {
  const day = localDateInTimezone(timeZone, new Date(iso));
  if (day === today) return "today";
  if (day === addDays(today, -1)) return "Yesterday";
  return "earlier";
}

describe("IST local-day comparison", () => {
  it("01:08 IST on the same local day is not Yesterday (UTC prefix would be)", () => {
    // 2026-10-20 01:08 IST = 2026-10-19T19:38:00.000Z (UTC date is previous day)
    const iso = "2026-10-19T19:38:00.000Z";
    const todayIst = "2026-10-20";
    expect(iso.slice(0, 10)).toBe("2026-10-19");
    expect(localDateInTimezone("Asia/Kolkata", new Date(iso))).toBe(todayIst);
    expect(timePrefixIst(iso, todayIst)).toBe("today");
  });

  it("marks previous IST calendar day as Yesterday across the UTC boundary", () => {
    const iso = "2026-10-19T19:38:00.000Z"; // still 20 Oct IST
    expect(timePrefixIst(iso, "2026-10-21")).toBe("Yesterday");
  });
});
