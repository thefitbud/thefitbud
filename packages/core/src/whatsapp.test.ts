import { describe, expect, it } from "vitest";
import {
  askCoachGoLink,
  buildAskCoachMessage,
  normalizeWhatsappE164,
  whatsappHref,
} from "./whatsapp.js";

describe("whatsapp helpers", () => {
  it("normalizes Indian 10-digit numbers", () => {
    expect(normalizeWhatsappE164("9000000001")).toBe("919000000001");
  });

  it("builds wa.me href with encoded text", () => {
    const href = whatsappHref({
      phoneE164: "919000000001",
      draftText: "Hi Rahul, question about my Lunch",
    });
    expect(href).toMatch(/^https:\/\/wa\.me\/919000000001\?text=/);
    expect(href).toContain(encodeURIComponent("Hi Rahul, question about my Lunch"));
  });

  it("keeps ask-coach prefill body ≤ 140 chars excluding URL", () => {
    const link = askCoachGoLink("meal", "7f3a1111-1111-4111-8111-111111111111");
    const { text, bodyLength } = buildAskCoachMessage({
      coachName: "Rahul",
      itemLabel: "Very long lunch meal name that should be truncated for WhatsApp",
      date: "Tue 13 Oct",
      topic: "portion size",
      link,
    });
    expect(text).toContain(link);
    expect(text.startsWith("Hi Rahul")).toBe(true);
    expect(bodyLength).toBeLessThanOrEqual(140);
  });

  it("uses https /go/ links", () => {
    expect(askCoachGoLink("workout", "abc")).toBe(
      "https://fitbud.app/go/workout/abc",
    );
  });
});
