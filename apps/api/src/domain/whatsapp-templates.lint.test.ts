import { describe, expect, it } from "vitest";
import { WHATSAPP_TEMPLATE_SEEDS } from "./whatsapp-templates.js";

describe("whatsapp template lint", () => {
  it("keeps templates under 1024 chars without ALL CAPS spam", () => {
    for (const template of WHATSAPP_TEMPLATE_SEEDS) {
      expect(template.body.length).toBeLessThanOrEqual(1024);
      expect(template.body).not.toMatch(/\b[A-Z]{6,}\b/);
      expect(template.body).not.toMatch(/https?:\/\//);
    }
  });
});
