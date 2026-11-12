/**
 * Builds the `?a=b` suffix for a request path, or "" when there are no params.
 *
 * Uses `toString()` only. Do not use `URLSearchParams.size`: on iOS and Android
 * Expo replaces the global `URLSearchParams` with `whatwg-url-without-unicode`,
 * which has no `size` property, so `params.size > 0` is always false there and
 * every filter, date range, cursor and search term was silently dropped
 * (Z11b-1). An ESLint rule in `@fitbud/config` bans `.size` on URLSearchParams.
 */
export function queryString(params: URLSearchParams): string {
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
