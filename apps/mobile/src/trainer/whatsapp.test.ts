import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Linking: {
    canOpenURL: vi.fn(async () => true),
    openURL: vi.fn(async () => undefined),
  },
}));

import { Linking } from "react-native";
import { openContextualWhatsApp } from "./whatsapp.js";

describe("openContextualWhatsApp", () => {
  it("opens wa.me with digits when a phone is provided", async () => {
    const ok = await openContextualWhatsApp({
      phoneE164: "+91 98765 43210",
      draftText: "Quick check-in",
    });
    expect(ok).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/919876543210"),
    );
  });

  it("opens generic wa.me when phone is unknown", async () => {
    await openContextualWhatsApp({ draftText: "Hello" });
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
    );
  });
});
