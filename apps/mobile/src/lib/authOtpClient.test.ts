import { describe, expect, it } from "vitest";
import { FitBudApiClient } from "@fitbud/api-client";
import { stage1Api } from "./stage1Api";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("FitBudApiClient auth OTP envelopes", () => {
  it("parses login and OTP start/verify from { data } envelopes", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        const path = String(input);
        if (path.includes("/auth/login")) {
          return new Response(
            JSON.stringify({
              data: {
                token: "login-token",
                tokenKind: "test_id_token",
                userId: USER_ID,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (path.includes("/auth/otp/start")) {
          return new Response(
            JSON.stringify({
              data: { sent: true, channels: ["email"] },
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        if (path.includes("/auth/otp/verify")) {
          return new Response(
            JSON.stringify({
              data: {
                purpose: "login",
                token: "otp-login-token",
                tokenKind: "test_id_token",
                userId: USER_ID,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    const s1 = stage1Api(client);

    const login = await s1.login({
      identifier: "user@example.com",
      password: "FitBud-demo-2026",
    });
    expect(login.token).toBe("login-token");

    const started = await client.startOtp({
      identifier: "user@example.com",
      purpose: "login",
    });
    expect(started).toEqual({ sent: true, channels: ["email"] });

    const verified = await s1.verifyOtp({
      identifier: "user@example.com",
      purpose: "login",
      code: "123456",
    });
    expect(verified.purpose).toBe("login");
    if (verified.purpose === "login") {
      expect(verified.token).toBe("otp-login-token");
    }
  });

  it("parses reset OTP verify envelope", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: { purpose: "reset", resetProof: "reset-proof-xyz" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await client.verifyOtp({
      identifier: "user@example.com",
      purpose: "reset",
      code: "654321",
    });
    expect(result).toEqual({
      purpose: "reset",
      resetProof: "reset-proof-xyz",
    });
  });
});
