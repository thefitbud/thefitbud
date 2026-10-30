import { describe, expect, it } from "vitest";
import {
  issueLine,
  type AttentionGroup,
  type AttentionItem,
} from "./attentionIssueLine";

function meal(
  id: string,
  overrides: Partial<AttentionItem> = {},
): AttentionItem {
  return {
    id,
    type: "overdue_meal",
    severity: "attention",
    status: "active",
    ageMinutes: 120,
    summary: "Required meal still unlogged",
    details: { localDate: "2026-10-20" },
    ...overrides,
  };
}

function workout(
  id: string,
  overrides: Partial<AttentionItem> = {},
): AttentionItem {
  return {
    id,
    type: "missed_workout",
    severity: "critical",
    status: "active",
    ageMinutes: 200,
    summary: "Missed workout",
    details: { localDate: "2026-10-20" },
    ...overrides,
  };
}

function group(items: AttentionItem[]): AttentionGroup {
  return {
    relationshipId: "778a793a-d04e-44bc-b7aa-187f70573275",
    traineeDisplayName: "Farhan Qureshi",
    items,
  };
}

describe("issueLine (NA1 / QA-PR28 finding 4)", () => {
  it("Farhan-style: rolled-up meals are not double-counted as +N more", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      meal(`00000000-0000-4000-8000-0000000000${i.toString(16).padStart(2, "0")}`, {
        ageMinutes: 100 + i,
        details: { localDate: `2026-10-${String(11 + (i % 7)).padStart(2, "0")}` },
      }),
    );
    const primary = items[0]!;
    const issue = issueLine(group(items), primary);

    expect(issue.text).toMatch(/^Missed 10 meals/);
    expect(issue.more).toBe(0);
    expect(`${issue.text} · +${issue.more} more`).not.toMatch(
      /Missed 10 meals.*\+9 more/,
    );
  });

  it("does not emit Missed N · +N more for the same meal set", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      meal(`11111111-1111-4111-8111-1111111111${i.toString(16).padStart(2, "0")}`),
    );
    const issue = issueLine(group(items), items[0]!);

    expect(issue.text).toMatch(/^Missed 6 meals/);
    expect(issue.more).toBe(0);
  });

  it("Rohan-style: +N more counts only items outside the rolled-up workouts", () => {
    const items: AttentionItem[] = [
      workout("22222222-2222-4222-8222-222222222201", {
        details: { localDate: "2026-10-13" }, // Tue
      }),
      workout("22222222-2222-4222-8222-222222222202", {
        details: { localDate: "2026-10-15" }, // Thu
        ageMinutes: 180,
      }),
      meal("22222222-2222-4222-8222-222222222203", {
        severity: "attention",
        ageMinutes: 90,
        details: { localDate: "2026-10-17" },
      }),
      meal("22222222-2222-4222-8222-222222222204", {
        severity: "attention",
        ageMinutes: 80,
        details: { localDate: "2026-10-17" },
      }),
    ];
    const primary = items[0]!;
    const issue = issueLine(group(items), primary);

    expect(issue.text).toMatch(/^Missed 2 workouts/);
    expect(issue.more).toBe(2);
  });

  it("single primary keeps +N more for remaining distinct items", () => {
    const items: AttentionItem[] = [
      meal("33333333-3333-4333-8333-333333333301"),
      {
        id: "33333333-3333-4333-8333-333333333302",
        type: "overdue_checkin",
        severity: "attention",
        status: "active",
        ageMinutes: 60,
        summary: "Check-in overdue",
      },
    ];
    const issue = issueLine(group(items), items[0]!);

    expect(issue.text).not.toMatch(/^Missed \d+ meals/);
    expect(issue.more).toBe(1);
  });
});
