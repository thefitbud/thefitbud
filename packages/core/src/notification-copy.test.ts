import { describe, expect, it } from "vitest";
import type { NotificationType } from "@fitbud/contracts";
import {
  clientDisplayLabel,
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
