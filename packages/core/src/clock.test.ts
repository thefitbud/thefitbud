import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting.js";
import { istDate, istInstantAt } from "./clock.js";

describe("istDate", () => {
  it("is the Asia/Kolkata civil date at 23:30 UTC and 00:30 IST", () => {
    expect(istDate(new Date("2026-10-17T23:30:00.000Z"))).toBe("2026-10-18");
    expect(istDate(istInstantAt("2026-10-18", 0, 30))).toBe("2026-10-18");
    expect(istInstantAt("2026-10-18", 0, 30).toISOString()).toBe(
      "2026-10-17T19:00:00.000Z",
    );
  });
});

describe("greetingFor", () => {
  const zone = "Asia/Kolkata";

  it("splits morning, afternoon, and evening in the client timezone", () => {
    expect(greetingFor("Rohan Mehta", zone, istInstantAt("2026-10-18", 11, 59))).toBe(
      "Good morning, Rohan",
    );
    expect(greetingFor("Rohan Mehta", zone, istInstantAt("2026-10-18", 12, 0))).toBe(
      "Good afternoon, Rohan",
    );
    expect(greetingFor("Rohan Mehta", zone, istInstantAt("2026-10-18", 16, 59))).toBe(
      "Good afternoon, Rohan",
    );
    expect(greetingFor("Rohan Mehta", zone, istInstantAt("2026-10-18", 17, 0))).toBe(
      "Good evening, Rohan",
    );
  });
});
