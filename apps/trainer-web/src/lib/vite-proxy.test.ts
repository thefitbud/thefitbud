import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

/**
 * The realtime WebSocket reaches the API through the same `/api` proxy as
 * every REST call. Without `ws`, the dev server answers the upgrade itself
 * instead of forwarding it, so every handshake fails locally and in e2e while
 * working against the deployed Worker, which does forward it (WD1, D-W2-2).
 * That mismatch already cost one regression, so it is pinned here.
 */
describe("trainer-web dev proxy", () => {
  const proxy = (viteConfig as { server?: { proxy?: Record<string, unknown> } }).server
    ?.proxy;

  it("proxies /api", () => {
    expect(proxy).toBeDefined();
    expect(proxy?.["/api"]).toBeDefined();
  });

  it("forwards WebSocket upgrades on /api", () => {
    const api = proxy?.["/api"] as { ws?: boolean };
    expect(api.ws).toBe(true);
  });

  it("strips the /api prefix before forwarding, so the upgrade path matches the API", () => {
    const api = proxy?.["/api"] as { rewrite?: (path: string) => string };
    expect(api.rewrite?.("/api/realtime/relationships/abc/ws")).toBe(
      "/realtime/relationships/abc/ws",
    );
  });
});
