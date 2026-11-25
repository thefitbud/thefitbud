import { describe, expect, it } from "vitest";
import type { NotificationType } from "@fitbud/contracts";
import {
  clientDisplayLabel,
  clientLogEditCopy,
  mealEditedByLine,
  mealRemovedActivityLine,
  mealWasLine,
  isTrainerClientNotificationType,
  trainerNotificationCopy,
  type TrainerClientNotificationType,
} from "./notification-copy.js";

const NAMED: Array<{
  type: TrainerClientNotificationType;
  title: string;
  body: string;
}> = [
  {
    type: "trainer_ask_coach",
    title: "Priya Shah asked on WhatsApp",
    body: "Open the item they asked about.",
  },
  {
    type: "trainer_checkin_submitted",
    title: "Priya Shah sent their check-in",
    body: "Review when you're ready.",
  },
  {
    type: "trainer_intake_submitted",
    title: "Priya Shah finished their intake",
    body: "Review their intake answers.",
  },
  {
    type: "trainer_renewal",
    title: "Priya Shah's renewal is due",
    body: "Follow up before the window closes.",
  },
  {
    type: "trainer_meal_times_changed",
    title: "Priya Shah changed meal times",
    body: "Reminders will follow their new times.",
  },
];

describe("trainerNotificationCopy", () => {
  it("uses the client name in list and push titles", () => {
    for (const row of NAMED) {
      const copy = trainerNotificationCopy(row.type, "priya shah");
      expect(copy).toEqual({ title: row.title, body: row.body });
      expect(copy.title).not.toMatch(/^Client\b/);
      expect(copy.title).not.toMatch(/_/);
      expect(copy.body).not.toMatch(/_/);
      expect(copy.title).not.toBe(row.type);
    }
  });

  it("does not fall back to generic Client wording or a raw enum", () => {
    for (const name of [null, undefined, "", "Client", "Clients", "trainer_ask_coach"]) {
      const copy = trainerNotificationCopy("trainer_ask_coach", name);
      expect(copy.title).toBe("Asked on WhatsApp");
      expect(copy.title).not.toMatch(/_/);
      expect(copy.title).not.toMatch(/^Client\b/);
    }
    expect(trainerNotificationCopy("trainer_renewal", "Client").title).toBe(
      "Renewal is due",
    );
    expect(
      trainerNotificationCopy("trainer_meal_times_changed", "Client").title,
    ).toBe("Meal times changed");
  });

  it("keeps a real name that merely starts with Client", () => {
    expect(clientDisplayLabel("Client Sharma")).toBe("Client Sharma");
    expect(
      trainerNotificationCopy("trainer_ask_coach", "Client Sharma").title,
    ).toBe("Client Sharma asked on WhatsApp");
  });
});

describe("isTrainerClientNotificationType", () => {
  it("matches only the per-client trainer types", () => {
    const types: NotificationType[] = [
      "trainer_ask_coach",
      "trainer_meal_times_changed",
      "trainer_critical_digest",
      "meal_reminder",
    ];
    expect(types.filter(isTrainerClientNotificationType)).toEqual([
      "trainer_ask_coach",
      "trainer_meal_times_changed",
    ]);
  });
});

describe("clientLogEditCopy (Z14-16)", () => {
  const base = {
    entryId: "7f6a0f0e-5f0e-4a49-9d3e-0b3a6f0c1a11",
    action: "edited" as const,
    mealName: "Lunch",
    mealDate: "2026-11-14",
    fromKcal: 610,
    toKcal: 690,
    fromOutcome: "modified",
    toOutcome: "modified",
    fields: ["portion" as const],
  };
  const today = "2026-11-14";

  it("names the change when kcal moved", () => {
    expect(clientLogEditCopy(base, "Aarav Mehta", today)).toEqual({
      title: "Aarav edited lunch",
      body: "610 → 690 kcal · changed portion",
    });
    expect(
      clientLogEditCopy({ ...base, fields: ["kcal"] }, "Aarav", today).body,
    ).toBe("610 → 690 kcal · ate out");
    expect(
      clientLogEditCopy({ ...base, fields: ["foods"] }, "Aarav", today).body,
    ).toBe("610 → 690 kcal · logged it themselves");
    expect(
      clientLogEditCopy(
        { ...base, fromKcal: 1120, toKcal: 1500, fields: [] },
        "Aarav",
        today,
      ).body,
    ).toBe("1,120 → 1,500 kcal");
  });

  it("says what changed when kcal did not", () => {
    expect(
      clientLogEditCopy({ ...base, toKcal: 610 }, "Aarav", today).body,
    ).toBe("Changed portion");
    expect(
      clientLogEditCopy({ ...base, toKcal: 610, fields: ["foods"] }, "Aarav", today)
        .body,
    ).toBe("Changed foods");
    expect(
      clientLogEditCopy({ ...base, toKcal: 610, fields: ["note"] }, "Aarav", today)
        .body,
    ).toBe("Changed the note.");
  });

  it("adds the meal day when it is not today", () => {
    expect(
      clientLogEditCopy({ ...base, mealDate: "2026-11-12" }, "Aarav", today).title,
    ).toBe("Aarav edited lunch · Thu 12 Nov");
  });

  it("covers a removal and a missing name", () => {
    const removed = {
      ...base,
      action: "removed" as const,
      mealName: "Dinner",
      mealDate: "2026-11-13",
      fromKcal: 1120,
      toKcal: null,
      toOutcome: null,
      fields: [],
    };
    expect(clientLogEditCopy(removed, "Priya Nair", today)).toEqual({
      title: "Priya removed their dinner log",
      body: "Fri 13 Nov · was 1,120 kcal. It's back to not logged.",
    });
    expect(
      clientLogEditCopy({ ...removed, fromDeviationKind: "restaurant" }, "Priya Nair", today).body,
    ).toBe("Fri 13 Nov · was 1,120 kcal, ate out. It's back to not logged.");
    expect(
      clientLogEditCopy({ ...removed, fromDeviationKind: "portion_adjustment" }, "Priya Nair", today).body,
    ).toBe("Fri 13 Nov · was 1,120 kcal. It's back to not logged.");
    expect(clientLogEditCopy(base, null, today).title).toBe(
      "A client edited lunch",
    );
    expect(
      trainerNotificationCopy("trainer_client_log_edited", "Aarav", {
        logEdit: base,
        today,
      }).title,
    ).toBe("Aarav edited lunch");
    expect(
      trainerNotificationCopy("trainer_client_log_edited", "Aarav").title,
    ).toBe("Aarav changed a meal log");
  });
});

describe("meal change marker lines (Z14-16)", () => {
  it("names who edited, when, and what it was before", () => {
    expect(
      mealEditedByLine({
        clientName: "Aarav Mehta",
        editedAt: "2026-11-14T08:35:00.000Z",
        zone: "Asia/Kolkata",
      }),
    ).toBe("Edited by Aarav · Sat 14 Nov, 2:05 pm");
    expect(
      mealWasLine({ outcome: "confirmed", deviationKind: null, kcal: 610 }),
    ).toBe("Was 610 kcal · as planned");
    expect(
      mealWasLine({ outcome: "modified", deviationKind: "restaurant", kcal: 1120 }),
    ).toBe("Was 1,120 kcal · ate out");
    expect(
      mealWasLine({ outcome: "modified", deviationKind: "portion_adjustment", kcal: null }),
    ).toBe("Was changed portion");
    expect(
      mealWasLine({ outcome: "skipped", deviationKind: null, kcal: null }),
    ).toBe("Was skipped");
  });

  it("writes the removed Activity row", () => {
    expect(
      mealRemovedActivityLine({
        clientName: "Priya Nair",
        summary: "Removed the dinner log",
        mealDate: "2026-11-13",
        previousKcal: 1120,
      }),
    ).toBe("Priya removed their dinner log (Fri 13 Nov) · was 1,120 kcal");
    expect(
      mealRemovedActivityLine({
        clientName: null,
        summary: "Removed the lunch log",
        mealDate: null,
        previousKcal: null,
      }),
    ).toBe("A client removed their lunch log");
    expect(
      mealRemovedActivityLine({
        clientName: "Priya Nair",
        summary: "Removed the dinner log",
        mealDate: "2026-11-13",
        previousKcal: 1120,
        previousAteOut: true,
      }),
    ).toBe("Priya removed their dinner log (Fri 13 Nov) · was 1,120 kcal, ate out");
  });
});
