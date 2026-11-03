/**
 * The host guard is what keeps this suite off production (QT6). These tests need no
 * network and no secrets: they exercise the guard, the env reader and the guarded
 * `fetch` with a fetch that records instead of sending.
 */
import { describe, expect, it, vi } from "vitest";
import { readSmokeEnv } from "./env.js";
import {
  DEFAULT_STAGING_API_URL,
  guardBaseUrl,
  guardRequestUrl,
  HostGuardError,
  STAGING_API_HOST,
} from "./host-guard.js";
import { SmokeHttp } from "./http.js";

const PRODUCTION_URLS = [
  "https://api.thefitbud.com",
  "https://api.thefitbud.com/",
  "https://api.thefitbud.com/me",
  "http://api.thefitbud.com",
];

describe("guardBaseUrl", () => {
  it("accepts the staging API and normalises it to an origin", () => {
    expect(guardBaseUrl("https://api-staging.thefitbud.com")).toEqual({
      baseUrl: "https://api-staging.thefitbud.com",
      kind: "staging",
    });
    expect(guardBaseUrl("  https://API-STAGING.thefitbud.com/  ").baseUrl).toBe(
      "https://api-staging.thefitbud.com",
    );
    expect(DEFAULT_STAGING_API_URL).toBe(`https://${STAGING_API_HOST}`);
  });

  it("accepts a local API", () => {
    expect(guardBaseUrl("http://127.0.0.1:8787")).toEqual({
      baseUrl: "http://127.0.0.1:8787",
      kind: "local",
    });
    expect(guardBaseUrl("http://localhost:8788").kind).toBe("local");
  });

  it.each(PRODUCTION_URLS)("rejects production: %s", (url) => {
    expect(() => guardBaseUrl(url)).toThrow(HostGuardError);
    expect(() => guardBaseUrl(url)).toThrow(/api\.thefitbud\.com/);
  });

  it.each([
    "https://thefitbud.com",
    "https://app-staging.thefitbud.com",
    "https://api-staging.thefitbud.com.evil.example",
    "https://evil-api-staging.thefitbud.com",
    "https://api-staging.thefitbud.com.",
    "https://localhost.evil.example",
    "https://example.com",
    "http://[::1]:8787",
    "http://0.0.0.0:8787",
    "http://192.168.1.10:8787",
  ])("rejects other hosts: %s", (url) => {
    expect(() => guardBaseUrl(url)).toThrow(HostGuardError);
  });

  it("rejects look-alikes built with credentials", () => {
    expect(() => guardBaseUrl("https://api-staging.thefitbud.com@api.thefitbud.com")).toThrow(
      HostGuardError,
    );
    expect(() => guardBaseUrl("https://user:pw@api-staging.thefitbud.com")).toThrow(/credentials/);
  });

  it("rejects staging over plain http or on another port", () => {
    expect(() => guardBaseUrl("http://api-staging.thefitbud.com")).toThrow(/https/);
    expect(() => guardBaseUrl("https://api-staging.thefitbud.com:8443")).toThrow(/port/);
  });

  it("rejects non-http schemes, paths, queries and garbage", () => {
    expect(() => guardBaseUrl("ftp://localhost")).toThrow(HostGuardError);
    expect(() => guardBaseUrl("https://api-staging.thefitbud.com/v1")).toThrow(/origin only/);
    expect(() => guardBaseUrl("https://api-staging.thefitbud.com/?x=1")).toThrow(/origin only/);
    expect(() => guardBaseUrl("not a url")).toThrow(HostGuardError);
    expect(() => guardBaseUrl("")).toThrow(HostGuardError);
  });

  it("never echoes credentials or the full URL in the error", () => {
    let message = "";
    try {
      guardBaseUrl("https://admin:hunter2@api.thefitbud.com/secret-path?token=abc");
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("secret-path");
    expect(message).not.toContain("token=abc");
  });
});

describe("readSmokeEnv", () => {
  it("defaults to staging when STAGING_API_URL is unset or blank", () => {
    expect(readSmokeEnv({}).target.baseUrl).toBe("https://api-staging.thefitbud.com");
    expect(readSmokeEnv({ STAGING_API_URL: "   " }).target.kind).toBe("staging");
  });

  it("refuses a production STAGING_API_URL", () => {
    expect(() => readSmokeEnv({ STAGING_API_URL: "https://api.thefitbud.com" })).toThrow(
      HostGuardError,
    );
  });
});

describe("guardRequestUrl", () => {
  const target = guardBaseUrl("https://api-staging.thefitbud.com");

  it("allows the configured origin", () => {
    expect(guardRequestUrl("https://api-staging.thefitbud.com/me", target).pathname).toBe("/me");
  });

  it("rejects production and other origins even when the base URL was fine", () => {
    expect(() => guardRequestUrl("https://api.thefitbud.com/me", target)).toThrow(HostGuardError);
    expect(() => guardRequestUrl("http://127.0.0.1:8787/me", target)).toThrow(/configured API origin/);
  });
});

describe("SmokeHttp sends nothing to a host the guard refuses", () => {
  const target = guardBaseUrl("https://api-staging.thefitbud.com");

  it("blocks a production URL before the network layer is reached", async () => {
    const inner = vi.fn<typeof fetch>(async () => new Response("{}"));
    const http = new SmokeHttp(target, inner);
    await expect(http.fetch("https://api.thefitbud.com/me")).rejects.toThrow(HostGuardError);
    expect(inner).not.toHaveBeenCalled();
  });

  it("blocks a request that would leave the origin through the path", async () => {
    const inner = vi.fn<typeof fetch>(async () => new Response("{}"));
    const http = new SmokeHttp(target, inner);
    await expect(http.request("GET", "//api.thefitbud.com/me")).rejects.toThrow(/single '\/'/);
    await expect(http.request("GET", "me")).rejects.toThrow(/start with/);
    expect(inner).not.toHaveBeenCalled();
  });

  it("forwards an allowed request without following redirects", async () => {
    const inner = vi.fn<typeof fetch>(async () => Response.json({ data: { ok: true } }));
    const http = new SmokeHttp(target, inner);
    const response = await http.request("GET", "/config");
    expect(response.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    const [url, init] = inner.mock.calls[0]!;
    expect(url).toBe("https://api-staging.thefitbud.com/config");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
