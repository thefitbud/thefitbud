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

  it("returns an error result for a Google 400", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } }, 400));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({ ok: false });
  });

  it("returns an error result for malformed JSON", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({ ok: false });
  });

  it("returns an error result when fields are missing or invalid", async () => {
    stubFetch(jsonResponse({ idToken: "id-token-1", refreshToken: "", expiresIn: "soon" }));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({ ok: false });
  });

  it("returns an error result when the network fails", async () => {
    stubFetch(new TypeError("network down"));
    await expect(exchangeCustomToken(API_KEY, "custom-token-1")).resolves.toEqual({ ok: false });
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

  it("returns an error result for a Google 400", async () => {
    stubFetch(jsonResponse({ error: { code: 400, message: "TOKEN_EXPIRED" } }, 400));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({ ok: false });
  });

  it("returns an error result for malformed JSON", async () => {
    stubFetch(new Response("not json", { status: 200 }));
    await expect(refreshIdToken(API_KEY, "refresh-token-1")).resolves.toEqual({ ok: false });
  });
});
