import { afterEach, describe, expect, it, vi } from "vitest";
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
          JSON.stringify({ data: { groups: [], needsYou: [], reviewed: [] } }),
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

  describe("refreshAccessToken (AU1c)", () => {
    function errorResponse(status: number, requestId: string): Response {
      return new Response(
        JSON.stringify({
          error: { code: "UNAUTHENTICATED", message: "Authentication required.", requestId },
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    }

    function okResponse(data: unknown): Response {
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    type Call = { url: string; auth: string | null; idem: string | null; method: string };

    /** Fake API: accepts only `Bearer fresh`; every other bearer gets 401. */
    function fakeApi(calls: Call[], handler?: (call: Call) => Response | undefined) {
      return async (...args: Parameters<typeof fetch>) => {
        const headers = new Headers(args[1]?.headers);
        const call = {
          url: String(args[0]),
          auth: headers.get("Authorization"),
          idem: headers.get("Idempotency-Key"),
          method: args[1]?.method ?? "GET",
        };
        calls.push(call);
        const custom = handler?.(call);
        if (custom) return custom;
        if (call.auth !== "Bearer fresh") return errorResponse(401, `req-${calls.length}`);
        return okResponse({ id: "ok" });
      };
    }

    const echoSchema = { parse: (value: unknown) => value as { id: string } };

    it("refreshes once on 401 and retries with the new token and the same idempotency key", async () => {
      const calls: Call[] = [];
      let token = "stale";
      let keyCounter = 0;
      const refresh = vi.fn(async () => {
        token = "fresh";
        return token;
      });
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => token,
        getIdempotencyKey: () => `idem-${++keyCounter}`,
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      await expect(
        client.request("POST", "/things", echoSchema, { auth: true, body: {} }),
      ).resolves.toEqual({ id: "ok" });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer fresh"]);
      expect(calls.map((c) => c.idem)).toEqual(["idem-1", "idem-1"]);
    });

    it("throws the original error when refresh returns null", async () => {
      const calls: Call[] = [];
      const refresh = vi.fn(async () => null);
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => "stale",
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      const err = await client.me().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).status).toBe(401);
      expect((err as ApiClientError).requestId).toBe("req-1");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(1);
    });

    it("treats a throwing refresh hook like null", async () => {
      const calls: Call[] = [];
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => "stale",
        refreshAccessToken: async () => {
          throw new Error("network down");
        },
        fetch: fakeApi(calls),
      });

      const err = await client.me().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).requestId).toBe("req-1");
      expect(calls).toHaveLength(1);
    });

    it("throws the original error when the retry also gets 401, without a second refresh", async () => {
      const calls: Call[] = [];
      const refresh = vi.fn(async () => "also-rejected");
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => "stale",
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      const err = await client.me().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).requestId).toBe("req-1");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => c.auth)).toEqual(["Bearer stale", "Bearer also-rejected"]);
    });

    it("shares one refresh between parallel 401s", async () => {
      const calls: Call[] = [];
      let token = "stale";
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const refresh = vi.fn(async () => {
        await gate;
        token = "fresh";
        return token;
      });
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => token,
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      const a = client.request("GET", "/a", echoSchema, { auth: true });
      const b = client.request("GET", "/b", echoSchema, { auth: true });
      // Let both first attempts fail before the refresh finishes.
      await new Promise((resolve) => setTimeout(resolve, 0));
      release();
      await expect(Promise.all([a, b])).resolves.toEqual([{ id: "ok" }, { id: "ok" }]);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(calls.filter((c) => c.auth === "Bearer fresh")).toHaveLength(2);
    });

    it("reuses a token another caller already refreshed instead of refreshing again", async () => {
      const calls: Call[] = [];
      let token = "stale";
      const refresh = vi.fn(async () => "should-not-be-used");
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => token,
        refreshAccessToken: refresh,
        fetch: fakeApi(calls, () => {
          // The token rotates while the first request is on the wire.
          if (calls.length === 1) {
            token = "fresh";
            return errorResponse(401, "req-1");
          }
          return undefined;
        }),
      });

      await expect(client.request("GET", "/a", echoSchema, { auth: true })).resolves.toEqual({
        id: "ok",
      });
      expect(refresh).not.toHaveBeenCalled();
    });

    it("does not retry without a refresh hook", async () => {
      const calls: Call[] = [];
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => "stale",
        fetch: fakeApi(calls),
      });

      await expect(client.me()).rejects.toBeInstanceOf(ApiClientError);
      expect(calls).toHaveLength(1);
    });

    it("does not refresh on a 401 from an unauthenticated call such as password login", async () => {
      const calls: Call[] = [];
      const refresh = vi.fn(async () => "fresh");
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      await expect(
        (client as unknown as {
          login: (b: { identifier: string; password: string }) => Promise<unknown>;
        }).login({ identifier: "rahul.coach@demo.fitbud.test", password: "wrong-password" }),
      ).rejects.toBeInstanceOf(ApiClientError);
      expect(refresh).not.toHaveBeenCalled();
      expect(calls).toHaveLength(1);
    });

    it("retries an upload once after refresh", async () => {
      const calls: Call[] = [];
      let token = "stale";
      const refresh = vi.fn(async () => {
        token = "fresh";
        return token;
      });
      const asset = {
        id: "33333333-3333-4333-8333-333333333333",
      };
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => token,
        refreshAccessToken: refresh,
        fetch: fakeApi(calls, (call) =>
          call.auth === "Bearer fresh" ? okResponse(asset) : undefined,
        ),
      });

      // The schema may reject the minimal asset; we only care about the wire calls.
      await client
        .uploadMediaContent(asset.id, new Uint8Array([1, 2, 3]), "image/jpeg")
        .catch(() => undefined);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => [c.method, c.auth])).toEqual([
        ["PUT", "Bearer stale"],
        ["PUT", "Bearer fresh"],
      ]);
    });

    it("does not refresh for signed upload URLs", async () => {
      const calls: Call[] = [];
      const refresh = vi.fn(async () => "fresh");
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => "stale",
        refreshAccessToken: refresh,
        fetch: fakeApi(calls),
      });

      await expect(
        client.uploadMediaContent(
          "/files/abc/content?exp=1&sig=x",
          new Uint8Array([1]),
          "image/jpeg",
        ),
      ).rejects.toBeInstanceOf(ApiClientError);
      expect(refresh).not.toHaveBeenCalled();
      expect(calls).toHaveLength(1);
    });

    it("reconnects realtime once with a refreshed token when the handshake fails", async () => {
      const urls: string[] = [];
      type Listener = (event: unknown) => void;
      class FakeSocket {
        private listeners: Record<string, Listener[]> = {};
        constructor(url: string) {
          urls.push(url);
          const accepted = url.includes("access_token=fresh");
          setTimeout(() => {
            if (accepted) {
              this.emit("open", {});
            } else {
              this.emit("error", { type: "error" });
              this.emit("close", {});
            }
          }, 0);
        }
        addEventListener(type: string, fn: Listener) {
          (this.listeners[type] ??= []).push(fn);
        }
        emit(type: string, event: unknown) {
          for (const fn of this.listeners[type] ?? []) fn(event);
        }
        close() {
          this.emit("close", {});
        }
      }
      let token = "stale";
      const refresh = vi.fn(async () => {
        token = "fresh";
        return token;
      });
      const onError = vi.fn();
      const onClose = vi.fn();
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        getAccessToken: () => token,
        refreshAccessToken: refresh,
      });

      const sub = client.subscribeRealtime("44444444-4444-4444-8444-444444444444", {
        onEvent: () => undefined,
        onError,
        onClose,
        WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(urls).toHaveLength(2);
      expect(urls[1]).toContain("access_token=fresh");
      expect(onError).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      sub.close();
    });

    it("refreshAuth posts the refresh token in the body and parses the response", async () => {
      const calls: Array<{ url: string; body: unknown }> = [];
      const client = new FitBudApiClient({
        baseUrl: "https://example.test",
        fetch: async (...args: Parameters<typeof fetch>) => {
          calls.push({ url: String(args[0]), body: JSON.parse(String(args[1]?.body)) });
          return okResponse({
            token: "new-id-token",
            tokenKind: "firebase_id_token",
            refreshToken: "rt-2",
            expiresIn: 3600,
          });
        },
      });

      await expect(client.refreshAuth("rt-1")).resolves.toEqual({
        token: "new-id-token",
        tokenKind: "firebase_id_token",
        refreshToken: "rt-2",
        expiresIn: 3600,
      });
      expect(calls).toEqual([
        { url: "https://example.test/auth/refresh", body: { refreshToken: "rt-1" } },
      ]);
      expect(calls[0]?.url).not.toContain("rt-1");
    });

    it("refreshAuth never echoes a malformed refresh token in its error", async () => {
      const client = new FitBudApiClient({ baseUrl: "https://example.test" });
      const secret = "x".repeat(5000);
      const err = await client.refreshAuth(secret).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect(String((err as Error).message)).not.toContain("xxxx");
    });
  });

  describe("realtimeWebSocketUrl", () => {
    const relationshipId = "44444444-4444-4444-8444-444444444444";

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("builds a wss URL from an absolute https baseUrl", () => {
      const client = new FitBudApiClient({ baseUrl: "https://api.example.test" });
      const url = new URL(client.realtimeWebSocketUrl(relationshipId));
      expect(url.protocol).toBe("wss:");
      expect(url.host).toBe("api.example.test");
      expect(url.pathname).toContain(relationshipId);
    });

    it("builds a ws URL from an absolute http baseUrl", () => {
      const client = new FitBudApiClient({ baseUrl: "http://127.0.0.1:8787" });
      expect(client.realtimeWebSocketUrl(relationshipId).startsWith("ws://127.0.0.1:8787/")).toBe(
        true,
      );
    });

    // The trainer web app proxies the API at a relative `/api` on its own
    // origin (D-W2-2). This used to throw `Invalid URL`, and because
    // subscribeRealtime routes a throw to onError (which the web hook ignores
    // as non-fatal), the trainer web realtime connection silently never opened.
    it("resolves a relative baseUrl against the document origin", () => {
      vi.stubGlobal("location", { href: "https://app-staging.thefitbud.com/clients/abc" });
      const client = new FitBudApiClient({ baseUrl: "/api" });
      const url = new URL(client.realtimeWebSocketUrl(relationshipId));
      expect(url.protocol).toBe("wss:");
      expect(url.host).toBe("app-staging.thefitbud.com");
      expect(url.pathname.startsWith("/api/")).toBe(true);
      expect(url.pathname).toContain(relationshipId);
    });

    it("keeps a relative baseUrl on an insecure origin on ws", () => {
      vi.stubGlobal("location", { href: "http://localhost:5173/" });
      const client = new FitBudApiClient({ baseUrl: "/api" });
      expect(client.realtimeWebSocketUrl(relationshipId).startsWith("ws://localhost:5173/api/")).toBe(
        true,
      );
    });

    it("carries the access token and role as query parameters", () => {
      vi.stubGlobal("location", { href: "https://app.thefitbud.com/" });
      const client = new FitBudApiClient({ baseUrl: "/api" });
      const url = new URL(
        client.realtimeWebSocketUrl(relationshipId, { accessToken: "tok", role: "trainer" }),
      );
      expect(url.searchParams.get("access_token")).toBe("tok");
      expect(url.searchParams.get("role")).toBe("trainer");
    });

    it("explains the misconfiguration when a relative baseUrl has no origin", () => {
      vi.stubGlobal("location", undefined);
      const client = new FitBudApiClient({ baseUrl: "/api" });
      expect(() => client.realtimeWebSocketUrl(relationshipId)).toThrow(/absolute baseUrl/i);
    });

    // A React effect cleanup runs synchronously, so close() can land while the
    // token promise is still pending and `socket` is still null. Opening after
    // that leaks a socket with no handle to close it — and StrictMode makes
    // mount/cleanup/remount the normal path in development.
    it("does not open a socket when closed before the token resolves", async () => {
      vi.stubGlobal("location", { href: "https://app.thefitbud.com/" });
      const constructed: unknown[] = [];
      class FakeSocket {
        constructor() {
          constructed.push(this);
        }
        addEventListener() {}
        close() {}
      }
      const client = new FitBudApiClient({
        baseUrl: "/api",
        getAccessToken: () =>
          new Promise<string>((resolve) => setTimeout(() => resolve("tok"), 5)),
      });
      const sub = client.subscribeRealtime(relationshipId, {
        onEvent: () => undefined,
        onError: () => undefined,
        WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      });
      sub.close();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(constructed).toHaveLength(0);
    });

    it("still opens a socket when it is not closed first", async () => {
      vi.stubGlobal("location", { href: "https://app.thefitbud.com/" });
      const constructed: unknown[] = [];
      class FakeSocket {
        constructor() {
          constructed.push(this);
        }
        addEventListener() {}
        close() {}
      }
      const client = new FitBudApiClient({
        baseUrl: "/api",
        getAccessToken: () =>
          new Promise<string>((resolve) => setTimeout(() => resolve("tok"), 5)),
      });
      const sub = client.subscribeRealtime(relationshipId, {
        onEvent: () => undefined,
        onError: () => undefined,
        WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(constructed).toHaveLength(1);
      sub.close();
    });

    it("subscribeRealtime reports the misconfiguration instead of opening a socket", async () => {
      vi.stubGlobal("location", undefined);
      const client = new FitBudApiClient({ baseUrl: "/api" });
      const onError = vi.fn();
      const WebSocketImpl = vi.fn();
      const sub = client.subscribeRealtime(relationshipId, {
        onEvent: () => undefined,
        onError,
        WebSocketImpl: WebSocketImpl as unknown as typeof WebSocket,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(WebSocketImpl).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      sub.close();
    });
  });
});
