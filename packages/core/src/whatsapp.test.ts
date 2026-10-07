import { describe, expect, it } from "vitest";
import { normalizeWhatsappE164, whatsappHref } from "./whatsapp.js";

describe("normalizeWhatsappE164", () => {
  it("prefixes 10-digit Indian numbers with 91", () => {
    expect(normalizeWhatsappE164("98765 43210")).toBe("919876543210");
  });

  it("accepts an already international number", () => {
    expect(normalizeWhatsappE164("+91 98765 43210")).toBe("919876543210");
  });

  it("rejects too-short values", () => {
    expect(normalizeWhatsappE164("12345")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("builds a wa.me link with draft text", () => {
    expect(
      whatsappHref({
        phoneE164: "919876543210",
        draftText: "Please complete onboarding",
      }),
    ).toBe(
      "https://wa.me/919876543210?text=Please%20complete%20onboarding",
    );
  });
});
