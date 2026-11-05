import type { AppRoute } from "./resolveRoute.js";

/**
 * What AppRouter shows for a (route, errorMessage) pair.
 *
 * Order matters and is pinned by routerView.test.ts:
 * 1. "loading" always shows the spinner, even with an error message.
 * 2. An error message beats every other route except "auth" (the auth screen
 *    shows its own errors). AuthProvider relies on this: its offline path
 *    returns a placeholder route while errorMessage is set, and the error
 *    screen (with Retry) must win over that placeholder.
 * 3. Otherwise the route's own screen.
 */
export type RouterView =
  | { view: "loading" }
  | { view: "error"; message: string }
  | { view: "route"; route: Exclude<AppRoute, { name: "loading" }> };

export function routerView(
  route: AppRoute,
  errorMessage: string | null | undefined,
): RouterView {
  if (route.name === "loading") return { view: "loading" };
  if (errorMessage && route.name !== "auth") return { view: "error", message: errorMessage };
  return { view: "route", route };
}
