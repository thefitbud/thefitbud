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
              inviteUrl: "https://app.example.test/i/raw-token",
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

  it("calls stage1 auth and attention group endpoints", async () => {
    const seen: string[] = [];
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      getAccessToken: async () => "token",
      fetch: async (input) => {
        seen.push(String(input));
        const path = String(input);
        if (path.includes("/auth/login")) {
          return new Response(
            JSON.stringify({
              data: {
                token: "t",
                tokenKind: "test_id_token",
                userId: "00000000-0000-4000-8000-000000000001",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ data: { groups: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    await (client as FitBudApiClient & { login: (b: unknown) => Promise<unknown> }).login({
      identifier: "coach@example.com",
      password: "password-1",
    });
    await (
      client as FitBudApiClient & {
        getAttentionGroups: () => Promise<unknown>;
      }
    ).getAttentionGroups();
    expect(seen[0]).toBe("https://example.test/auth/login");
    expect(seen[1]).toContain("groupBy=relationship");
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
                traineeTimezone: "Asia/Kolkata",
                hasCustomMealTimes: false,
                trainerWhatsappE164: null,
                clientWhatsappE164: "+919876543210",
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

  it("parses OTP start/verify envelopes", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        const path = String(input);
        if (path.includes("/auth/otp/start")) {
          return new Response(
            JSON.stringify({
              data: { sent: true, channels: ["email"] },
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            data: { purpose: "invite", otpProof: "proof-token-abc" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await expect(
      client.startOtp({ identifier: "a@b.com", purpose: "login" }),
    ).resolves.toEqual({ sent: true, channels: ["email"] });
    await expect(
      client.verifyOtp({
        identifier: "a@b.com",
        purpose: "invite",
        code: "123456",
      }),
    ).resolves.toEqual({ purpose: "invite", otpProof: "proof-token-abc" });
  });

  it("parses notification preferences including trainerCategories", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      getAccessToken: async () => "token",
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: {
              userId: "11111111-1111-4111-8111-111111111111",
              pushEnabled: true,
              categories: {
                workoutReminder: true,
                mealReminder: true,
                checkinReminder: true,
                subscriptionRenewalReminder: true,
                dailySummaryReminder: true,
              },
              channelPreference: "app",
              whatsappOptIn: {
                granted: false,
                at: null,
                source: null,
                textVersion: null,
              },
              traineeTimezone: "Asia/Kolkata",
              locale: null,
              trainerCategories: {
                askCoach: true,
                checkinSubmitted: true,
                criticalDigest: false,
                intakeSubmitted: true,
                renewalsDue: true,
                mealTimesChanged: true,
                morningSummary: false,
              },
              quietHoursStart: null,
              quietHoursEnd: null,
              updatedAt: "2026-09-26T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(client.getNotificationPreferences()).resolves.toMatchObject({
      trainerCategories: { morningSummary: false, criticalDigest: false },
    });
  });
});
