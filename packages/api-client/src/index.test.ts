import { describe, expect, it } from "vitest";
import { ApiClientError, FitBudApiClient } from "./index.js";

describe("FitBudApiClient", () => {
  it("parses health responses", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        new Response(JSON.stringify({ data: { status: "ok", service: "fitbud-api" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(client.health()).resolves.toEqual({
      status: "ok",
      service: "fitbud-api",
    });
  });

  it("maps API error envelopes", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "Authentication required.",
              requestId: "req-1",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(client.me()).rejects.toBeInstanceOf(ApiClientError);
  });

  it("sends Idempotency-Key when creating invitations", async () => {
    let seenKey: string | null = null;
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      getAccessToken: async () => "token",
      fetch: async (...args: Parameters<typeof fetch>) => {
        const headers = new Headers(args[1]?.headers);
        seenKey = headers.get("Idempotency-Key");
        return new Response(
          JSON.stringify({
            data: {
              id: "00000000-0000-4000-8000-000000000001",
              trainerUserId: "00000000-0000-4000-8000-000000000002",
              recipientEmail: "client@example.com",
              recipientDisplayName: null,
              status: "pending",
              expiresAt: "2026-10-10T00:00:00.000Z",
              acceptedUserId: null,
              coachingRelationshipId: null,
              onboardingStatus: "invited",
              createdAt: "2026-09-26T00:00:00.000Z",
              updatedAt: "2026-09-26T00:00:00.000Z",
              token: "raw-token",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await client.createInvitation(
      { recipientEmail: "client@example.com" },
      "idem-1",
    );
    expect(seenKey).toBe("idem-1");
  });
});
