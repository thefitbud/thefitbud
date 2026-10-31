import { describe, expect, it } from "vitest";
import worker, { apiPath, type Env, type Fetcher } from "./index";

type Recorder = Fetcher & { requests: Request[] };

function recorder(label: string): Recorder {
  const requests: Request[] = [];
  return {
    requests,
    async fetch(request: Request) {
      requests.push(request);
      return new Response(label, { status: 200 });
    },
  };
}

function setup() {
  const API = recorder("api");
  const ASSETS = recorder("assets");
  const env: Env = { API, ASSETS };
  return { API, ASSETS, env };
}

const ORIGIN = "https://app-staging.thefitbud.com";

describe("trainer web Worker", () => {
  it("sends /api/me to the API as /me with cookie and auth headers", async () => {
    const { API, ASSETS, env } = setup();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/me?include=profile`, {
        headers: {
          Cookie: "fitbud_session=abc",
          Authorization: "Bearer token-1",
        },
      }),
      env,
    );
    expect(await res.text()).toBe("api");
    expect(ASSETS.requests).toHaveLength(0);
    expect(API.requests).toHaveLength(1);
    const forwarded = API.requests[0]!;
    const url = new URL(forwarded.url);
    expect(url.host).toBe("app-staging.thefitbud.com");
    expect(url.pathname).toBe("/me");
    expect(url.search).toBe("?include=profile");
    expect(forwarded.method).toBe("GET");
    expect(forwarded.headers.get("cookie")).toBe("fitbud_session=abc");
    expect(forwarded.headers.get("authorization")).toBe("Bearer token-1");
  });

  it("keeps method and body on a POST", async () => {
    const { API, env } = setup();
    await worker.fetch(
      new Request(`${ORIGIN}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "k-1" },
        body: JSON.stringify({ email: "rahul.coach@demo.fitbud.test" }),
      }),
      env,
    );
    const forwarded = API.requests[0]!;
    expect(new URL(forwarded.url).pathname).toBe("/auth/sign-in");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("content-type")).toBe("application/json");
    expect(forwarded.headers.get("idempotency-key")).toBe("k-1");
    expect(await forwarded.json()).toEqual({ email: "rahul.coach@demo.fitbud.test" });
  });

  it("passes the WebSocket upgrade for the realtime socket through", async () => {
    const { API, env } = setup();
    await worker.fetch(
      new Request(`${ORIGIN}/api/realtime/relationships/r-1/ws?role=trainer`, {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version": "13",
          Cookie: "fitbud_session=abc",
        },
      }),
      env,
    );
    const forwarded = API.requests[0]!;
    const url = new URL(forwarded.url);
    expect(url.pathname).toBe("/realtime/relationships/r-1/ws");
    expect(url.search).toBe("?role=trainer");
    expect(forwarded.headers.get("upgrade")).toBe("websocket");
    expect(forwarded.headers.get("sec-websocket-key")).toBe("dGhlIHNhbXBsZSBub25jZQ==");
    expect(forwarded.headers.get("cookie")).toBe("fitbud_session=abc");
  });

  it("sends /i/abc to the API with the path unchanged", async () => {
    const { API, ASSETS, env } = setup();
    const res = await worker.fetch(new Request(`${ORIGIN}/i/abc`), env);
    expect(await res.text()).toBe("api");
    expect(ASSETS.requests).toHaveLength(0);
    expect(new URL(API.requests[0]!.url).pathname).toBe("/i/abc");
  });

  it("sends SPA paths such as /clients/123 to the assets", async () => {
    const { API, ASSETS, env } = setup();
    const res = await worker.fetch(new Request(`${ORIGIN}/clients/123`), env);
    expect(await res.text()).toBe("assets");
    expect(API.requests).toHaveLength(0);
    expect(new URL(ASSETS.requests[0]!.url).pathname).toBe("/clients/123");
  });

  it("does not treat look-alike paths as API or invite paths", async () => {
    const { API, ASSETS, env } = setup();
    for (const path of ["/apiary", "/api-docs", "/i", "/invites", "/"]) {
      await worker.fetch(new Request(`${ORIGIN}${path}`), env);
    }
    expect(API.requests).toHaveLength(0);
    expect(ASSETS.requests.map((r) => new URL(r.url).pathname)).toEqual([
      "/apiary",
      "/api-docs",
      "/i",
      "/invites",
      "/",
    ]);
  });
});

describe("apiPath", () => {
  it("strips only a whole /api segment", () => {
    expect(apiPath("/api")).toBe("/");
    expect(apiPath("/api/")).toBe("/");
    expect(apiPath("/api/clients/1")).toBe("/clients/1");
    expect(apiPath("/apix")).toBeNull();
    expect(apiPath("/clients")).toBeNull();
  });
});
