import { describe, expect, it } from "vitest";
import { createTestIdToken, isTestIdToken } from "./testToken.js";

describe("createTestIdToken", () => {
  it("builds the documented test token prefix", () => {
    const token = createTestIdToken("trainee-1", "trainee@example.com");
    expect(isTestIdToken(token)).toBe(true);
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(token.slice("test.".length))),
    ) as { uid: string; email?: string };
    expect(payload.uid).toBe("trainee-1");
    expect(payload.email).toBe("trainee@example.com");
  });

  it("rejects empty uid", () => {
    expect(() => createTestIdToken("  ")).toThrow(/UID/i);
  });
});

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const withPad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Uint8Array.from(Buffer.from(withPad, "base64"));
}
