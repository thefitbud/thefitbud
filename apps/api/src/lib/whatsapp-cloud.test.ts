import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sendWhatsAppTemplate } from "./whatsapp-cloud.js";

describe("whatsapp-cloud", () => {
  it("sends template messages through injectable fetch", async () => {
    const result = await sendWhatsAppTemplate(
      {
        phoneNumberId: "123",
        accessToken: "token",
        toE164: "+919876543210",
        templateName: "hello_world",
        languageCode: "en",
      },
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
          status: 200,
        }),
    );
    expect(result).toEqual({ sent: true, messageId: "wamid.test" });
  });

  it("keeps graph.facebook.com usage confined to whatsapp-cloud.ts", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (name.name === "node_modules") continue;
        const path = join(dir, name.name);
        if (name.isDirectory()) {
          walk(path);
          continue;
        }
        if (!name.name.endsWith(".ts") || name.name.endsWith(".test.ts")) {
          continue;
        }
        if (path.endsWith("whatsapp-cloud.ts")) continue;
        const text = readFileSync(path, "utf8");
        if (text.includes("graph.facebook.com")) {
          hits.push(path);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
