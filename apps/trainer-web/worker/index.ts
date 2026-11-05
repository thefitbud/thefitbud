/**
 * Trainer web Worker (task WD1, decisions D-W2-2 and D-W2-11).
 *
 * - `/api/*` goes to the API Worker through the `API` service binding with the
 *   `/api` prefix stripped, exactly like the Vite dev proxy
 *   (apps/trainer-web/vite.config.ts). Same origin, so no CORS and the
 *   first-party session cookie keeps working. Method, headers (Cookie,
 *   Authorization, Upgrade), body and query are passed through unchanged, so
 *   the `/api/realtime` WebSocket upgrade works too.
 * - `/i/*` (invite links built by apps/api/src/lib/public-app-url.ts) goes to
 *   the API with the path unchanged.
 * - Everything else is the SPA from static assets, with fallback to
 *   index.html (`not_found_handling = "single-page-application"`).
 *
 * wrangler.toml sets `run_worker_first = ["/api/*", "/i/*"]`: without it the
 * asset layer answers browser navigations to unknown paths with index.html
 * before this Worker runs, and invite links would open the SPA.
 */

/** The subset of a Workers `Fetcher` binding this Worker uses. */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}

const API_PREFIX = "/api";
const INVITE_PREFIX = "/i/";

/** `/api` or `/api/...` → the API path without the prefix; anything else → null. */
export function apiPath(pathname: string): string | null {
  if (pathname === API_PREFIX) return "/";
  if (pathname.startsWith(`${API_PREFIX}/`)) {
    return pathname.slice(API_PREFIX.length);
  }
  return null;
}

/** Same request (method, headers, body, signal) at a new path; query kept. */
function withPath(request: Request, url: URL, pathname: string): Request {
  const target = new URL(url.toString());
  target.pathname = pathname;
  return new Request(target.toString(), request);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  const stripped = apiPath(url.pathname);
  if (stripped !== null) {
    return env.API.fetch(withPath(request, url, stripped));
  }

  if (url.pathname.startsWith(INVITE_PREFIX)) {
    return env.API.fetch(request);
  }

  return env.ASSETS.fetch(request);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
