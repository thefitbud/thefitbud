import { describe, expect, it } from "vitest";
import { buildClientAttentionCards } from "./attentionCards";

describe("buildClientAttentionCards", () => {
  it("orders cards by severity then age", () => {
    const cards = buildClientAttentionCards([
      {
        relationshipId: "11111111-1111-4111-8111-111111111111",
        traineeDisplayName: "Aarav",
        items: [
          {
            id: "a1",
            type: "missed_workout",
            severity: "attention",
            status: "active",
            ageMinutes: 200,
            summary: "Missed workout",
          },
        ],
      },
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        traineeDisplayName: "Lakshmi",
        items: [
          {
            id: "b1",
            type: "overdue_meal",
            severity: "critical",
            status: "active",
            ageMinutes: 50,
            summary: "Missed meal",
          },
        ],
      },
    ]);
    expect(cards[0]?.traineeDisplayName).toBe("Lakshmi");
  });
});
