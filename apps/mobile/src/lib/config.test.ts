import { describe, expect, it } from "vitest";
import { isStepsEnabled, isWhatsAppOtpEnabled } from "./config";

describe("mobile config helpers", () => {
  it("defaults flags off when config is null", () => {
    expect(isWhatsAppOtpEnabled(null)).toBe(false);
    expect(isStepsEnabled(null)).toBe(false);
  });
});
