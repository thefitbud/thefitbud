import { ApiClientError } from "@fitbud/api-client";

/**
 * True only for a proven network failure (AGENTS.md "No misleading catch"):
 * the api-client's own status-0 / NETWORK_ERROR, or the TypeError that
 * `fetch` throws when it cannot reach the server. A ZodError, a programming
 * TypeError or any other error is never "offline".
 */
const FETCH_FAILURE =
  /^(network request failed|failed to fetch|load failed|networkerror when attempting to fetch)/i;

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    return err.status === 0 || err.code === "NETWORK_ERROR";
  }
  return err instanceof TypeError && FETCH_FAILURE.test(err.message);
}
