import { describe, expect, it } from "vitest";
import {
  blankCheckinField,
  buildCheckinFields,
  draftsFromCheckinFields,
} from "./checkinBuilder";

describe("checkin builder", () => {
  it("builds measurement, photo, and scale blocks", () => {
    const built = buildCheckinFields([
      {
        ...blankCheckinField("measurement"),
        label: "Body weight",
        measurementType: "body_weight_kg",
        required: true,
      },
      {
        ...blankCheckinField("photo_intent"),
        label: "Front photo",
        photoSlot: "front",
      },
      {
        ...blankCheckinField("scale_1_5"),
        label: "Energy",
        lowLabel: "Very low",
        highLabel: "Very high",
      },
      {
        ...blankCheckinField("short_text"),
        label: "What went well?",
      },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.fields.map((field) => field.type)).toEqual([
      "measurement",
      "photo_intent",
      "scale_1_5",
      "short_text",
    ]);
  });

  it("round-trips drafts", () => {
    const built = buildCheckinFields([
      {
        ...blankCheckinField("single_choice"),
        label: "Focus",
        options: [
          { id: "a", label: "Strength" },
          { id: "b", label: "Endurance" },
        ],
      },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const drafts = draftsFromCheckinFields(built.fields);
    expect(drafts[0]?.type).toBe("single_choice");
    expect(drafts[0]?.options).toHaveLength(2);
  });
});
