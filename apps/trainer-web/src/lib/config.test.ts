import { describe, expect, it, vi } from "vitest";
import {
  isStepsEnabled,
  isWhatsAppAutomationEnabled,
  isWhatsAppOtpEnabled,
} from "./config";

describe("config helpers", () => {
  const sample = {
    flags: { wa_otp: true, wa_automation: false, steps_enabled: true },
    supportEmail: "support@example.com",
  };

  it("reads flags from config", () => {
    expect(isWhatsAppOtpEnabled(sample)).toBe(true);
    expect(isWhatsAppAutomationEnabled(sample)).toBe(false);
    expect(isStepsEnabled(sample)).toBe(true);
    expect(isWhatsAppOtpEnabled(null)).toBe(false);
  });
});

describe("api client config cache", () => {
  it("caches getConfig for one hour", async () => {
    const { FitBudApiClient } = await import("@fitbud/api-client");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          flags: { wa_otp: false, wa_automation: false, steps_enabled: false },
          supportEmail: "tech@thefitbud.com",
        },
      }),
    });
    const client = new FitBudApiClient({
      baseUrl: "http://test",
      fetch: fetchMock as typeof fetch,
    });
    await client.getConfig();
    await client.getConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.getConfig(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
