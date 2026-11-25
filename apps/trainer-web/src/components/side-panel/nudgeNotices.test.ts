import { describe, expect, it } from "vitest";
import {
  clientTimeLabel,
  nudgeHintTone,
  nudgeLimitNotice,
  remindHelper,
  quietHoursNotice,
  resolveLockHelper,
  waitLabel,
} from "./nudgeNotices";

const IST_2240 = new Date("2026-10-18T17:10:00.000Z");

describe("quietHoursNotice", () => {
  it("names the client's local time and when the nudge arrives", () => {
    expect(
      quietHoursNotice({
        firstName: "Rohan",
        timeZone: "Asia/Kolkata",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: IST_2240,
      }),
    ).toBe(
      "It's 10:40 pm for Rohan and quiet hours are on. A reminder now arrives after 7:00 am (client's time, IST).",
    );
  });

  it("uses the server's default quiet hours when the client set none", () => {
    expect(
      quietHoursNotice({
        firstName: "Rohan",
        timeZone: "Asia/Kolkata",
        quietHoursStart: null,
        quietHoursEnd: null,
        now: IST_2240,
      }),
    ).toContain("after 7:00 am");
  });

  it("is null outside quiet hours or without a client timezone", () => {
    const noon = new Date("2026-10-18T06:30:00.000Z");
    expect(
      quietHoursNotice({
        firstName: "Rohan",
        timeZone: "Asia/Kolkata",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: noon,
      }),
    ).toBeNull();
    expect(
      quietHoursNotice({
        firstName: "Rohan",
        timeZone: null,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: IST_2240,
      }),
    ).toBeNull();
  });
});

describe("nudge limit and wait labels", () => {
  it("rounds the wait up to minutes, then hours", () => {
    expect(waitLabel(40 * 60_000)).toBe("40 min");
    expect(waitLabel(1)).toBe("1 min");
    expect(waitLabel(4 * 3_600_000)).toBe("4 h");
    expect(nudgeLimitNotice(39 * 60_000 + 1)).toBe(
      "Reminder limit reached. You can remind again in 40 min.",
    );
  });

  it("labels a client time without a zone when the timezone is unknown", () => {
    expect(clientTimeLabel("07:00", null)).toBe("7:00 am (client's time)");
  });
});

describe("resolveLockHelper", () => {
  it("says late logging locks for workouts and meals, and how many stay open", () => {
    expect(
      resolveLockHelper({
        firstName: "Rohan",
        sourceEntityType: "workout_assignment",
        dayLabel: "Tue 13 Oct",
        otherOpen: 2,
      }),
    ).toBe(
      "Resolving locks this item, so Rohan can't log Tue 13 Oct late anymore. Rohan's other 2 items stay open.",
    );
    expect(
      resolveLockHelper({
        firstName: "Rohan",
        sourceEntityType: "checkin",
        dayLabel: "Tue 13 Oct",
        otherOpen: 1,
      }),
    ).toBe("Resolving closes this item. Rohan's other item stays open.");
  });
});

describe("remindHelper (W13-11, FLOW 6.3)", () => {
  it("promises a push only when push is on", () => {
    expect(remindHelper({ firstName: "Rohan", label: "logs_on_own" })).toBe(
      "Sends Rohan a push notification",
    );
    expect(remindHelper({ firstName: null, label: null })).toBe(
      "Sends your client a push notification",
    );
  });

  it("says the reminder goes to the inbox when push is off or reminders are paused", () => {
    expect(remindHelper({ firstName: "Ishita", label: "notifications_off" })).toBe(
      "Push is off for Ishita. A reminder goes to their FitBud inbox.",
    );
    expect(remindHelper({ firstName: "Farhan", label: "reminders_paused" })).toBe(
      "Reminders are paused for Farhan. A reminder goes to their FitBud inbox.",
    );
  });
});

describe("nudgeHintTone", () => {
  it("maps the fixed notice copy to a tone", () => {
    expect(nudgeHintTone("Reminder sent")).toBe("done");
    expect(nudgeHintTone("Reminder sent. It arrives after 7:00 am (client's time, IST).")).toBe("done");
    expect(nudgeHintTone("Reminder sent to their inbox. Push is off.")).toBe("info");
    expect(nudgeHintTone("Already reminded about this today.")).toBe("neutral");
    expect(nudgeHintTone("Could not send the reminder")).toBe("warn");
  });
});
