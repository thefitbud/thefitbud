import { afterEach, describe, expect, it, vi } from "vitest";
import { FitBudApiClient } from "./index.js";
import { queryString } from "./query-string.js";

/**
 * Z11b-1: Expo's native URLSearchParams (whatwg-url-without-unicode) has no
 * `size`. This stand-in hides `size` the same way so the api-client's own suite
 * catches a return of `params.size`; apps/mobile's apiClientNativeQuery.test.ts
 * runs every method against the real polyfill.
 */
class SizelessURLSearchParams extends URLSearchParams {
  constructor(init?: ConstructorParameters<typeof URLSearchParams>[0]) {
    super(init);
    Object.defineProperty(this, "size", { value: undefined });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queryString", () => {
  it("prefixes a non-empty query and returns nothing for an empty one", () => {
    expect(queryString(new URLSearchParams({ q: "dal makhani" }))).toBe("?q=dal+makhani");
    expect(queryString(new URLSearchParams())).toBe("");
  });

  it("does not depend on URLSearchParams.size", () => {
    expect(new SizelessURLSearchParams({ a: "1" }).size).toBeUndefined();
    expect(queryString(new SizelessURLSearchParams({ fromDate: "2026-11-12" }))).toBe(
      "?fromDate=2026-11-12",
    );
  });

  it("listMealAssignments keeps its dates when URLSearchParams has no size", async () => {
    vi.stubGlobal("URLSearchParams", SizelessURLSearchParams);
    const urls: string[] = [];
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      getAccessToken: async () => "token",
      fetch: async (input: Parameters<typeof fetch>[0]) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found.", requestId: "r" } }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    await client
      .listMealAssignments("rel-1", { fromDate: "2026-11-12", toDate: "2026-11-12" })
      .catch(() => undefined);
    expect(urls).toEqual([
      "https://example.test/meals/relationships/rel-1/assignments?fromDate=2026-11-12&toDate=2026-11-12",
    ]);
  });
});
