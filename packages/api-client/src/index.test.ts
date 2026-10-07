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
              recipientWhatsappE164: null,
              status: "pending",
              expiresAt: "2026-10-10T00:00:00.000Z",
              acceptedUserId: null,
              coachingRelationshipId: null,
              onboardingFormTemplateVersionId:
                "11111111-1111-4111-8111-111111111111",
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

  it("sends workspace, activity, plan, and history filters", async () => {
    const seen: string[] = [];
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        seen.push(String(input));
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              nextCursor: null,
              header: {
                relationshipId: "11111111-1111-4111-8111-111111111111",
                traineeDisplayName: "Asha",
                onboardingStatus: "active",
                effectivePlan: null,
                goalShort: null,
                renewalState: null,
                adherenceState: "not_available",
                traineeProfile: {
                  displayName: "Asha",
                  age: null,
                  gender: null,
                },
              },
              overview: {
                openException: null,
                nextCheckin: null,
                recentActivity: [],
                progress: { measurements: [], entries: [], media: [] },
              },
              plan: { plan: null, version: null },
              configuration: { configuration: null, subscription: null },
              history: {
                relationshipId: "11111111-1111-4111-8111-111111111111",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const relationshipId = "11111111-1111-4111-8111-111111111111";
    await client.getClientWorkspace(relationshipId);
    await client.listWorkspaceActivity(relationshipId, {
      type: "workout",
      state: "assigned",
      occurredFrom: "2026-10-01",
      limit: 5,
    });
    await client.listPlans(relationshipId, { versionStatus: "effective" });
    await client.listHistory(relationshipId, { kind: "subscription_revision" });

    expect(seen[0]).toBe(
      `https://example.test/workspaces/relationships/${relationshipId}`,
    );
    expect(seen[1]).toContain("type=workout");
    expect(seen[1]).toContain("state=assigned");
    expect(seen[1]).toContain("occurredFrom=2026-10-01");
    expect(seen[2]).toContain("versionStatus=effective");
    expect(seen[3]).toContain("kind=subscription_revision");
  });
});
