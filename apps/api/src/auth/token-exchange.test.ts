import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeCustomToken, refreshIdToken } from "./token-exchange.js";

const API_KEY = "test-web-api-key";

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeCustomToken", () => {
  it("posts the custom token to Identity Toolkit and maps the session tokens", async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        kind: "identitytoolkit#VerifyCustomTokenResponse",
        idToken: "id-token-1",
        refreshToken: "refresh-token-1",
        expiresIn: "3600",
        isNewUser: false,
      }),
    );

    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: true,
      idToken: "id-token-1",
      refreshToken: "refresh-token-1",
      expiresIn: 3600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-web-api-key",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      token: "custom-token-1",
      returnSecureToken: true,
    });
  });

  // A 4xx is Google's verdict against the credential; everything else leaves
  // the credential's validity unknown, and callers must not sign the user out
  // on it.
  it("reports `invalid` for a Google 400", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } }, 400));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("reports `unavailable` for malformed JSON", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports `unavailable` when fields are missing or invalid", async () => {
    stubFetch(jsonResponse({ idToken: "id-token-1", refreshToken: "", expiresIn: "soon" }));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports `unavailable` when the network fails", async () => {
    stubFetch(new TypeError("network down"));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it.each([500, 502, 503, 504, 429])(
    "reports `unavailable` for an upstream %i",
    async (status) => {
      stubFetch(new Response("upstream", { status }));
      await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    },
  );

  // Only a 400 is a verdict against the credential. A 403 is what Google
  // answers for a restricted key, a disabled API or refused quota, so calling
  // it `invalid` would sign out every signed-in user over an operator fault.
  it.each([401, 403, 404])("reports `unavailable` for a Google %i", async (status) => {
    stubFetch(jsonResponse({ error: { code: status } }, status));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("never surfaces Google's response body", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } }, 400));
    const result = await exchangeCustomToken(API_KEY, "custom-token-1");
    expect(JSON.stringify(result)).not.toContain("INVALID_CUSTOM_TOKEN");
  });
});

describe("refreshIdToken", () => {
  it("posts a form body to the Secure Token API and returns the rotated refresh token", async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        access_token: "id-token-2",
        expires_in: "3600",
        token_type: "Bearer",
        refresh_token: "refresh-token-2",
        id_token: "id-token-2",
        user_id: "firebase-uid-coach",
        project_id: "264273558689",
      }),
    );

    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: true,
      idToken: "id-token-2",
      refreshToken: "refresh-token-2",
      expiresIn: 3600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://securetoken.googleapis.com/v1/token?key=test-web-api-key");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(init.body).toBe("grant_type=refresh_token&refresh_token=refresh-token-1");
  });

  it("reports `invalid` for a Google 400", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "TOKEN_EXPIRED" } }, 400));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("reports `unavailable` for malformed JSON", async () => {
    stubFetch(new Response("not json", { status: 200 }));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  // An outage must not read as an expired refresh token: /auth/refresh turns
  // `invalid` into a 401 that signs the user out and `unavailable` into a 503
  // that the clients retry.
  it.each([500, 503, 429])("reports `unavailable` for an upstream %i", async (status) => {
    stubFetch(new Response("upstream", { status }));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports `unavailable` when the network fails", async () => {
    stubFetch(new TypeError("network down"));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it.each([401, 403, 404])("reports `unavailable` for a Google %i", async (status) => {
    stubFetch(jsonResponse({ error: { code: status } }, status));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("never surfaces the refresh token or Google's body in the result", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "TOKEN_EXPIRED" } }, 400));
    const result = await refreshIdToken(API_KEY, "refresh-token-secret");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("refresh-token-secret");
    expect(serialized).not.toContain("TOKEN_EXPIRED");
  });
});
