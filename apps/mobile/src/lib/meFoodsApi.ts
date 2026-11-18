import type { FitBudApiClient } from "@fitbud/api-client";
import {
  traineeFoodSearchResponseSchema,
  type TraineeFoodSearchResponse,
} from "@fitbud/contracts";

/**
 * GET /me/foods/recent: the trainee's own saved foods and the library foods
 * from their recent logs, newest first (TR-26a "Recently logged"). Not on the
 * client's named surface yet, so it goes through the client's typed request
 * (auth, refresh and the error body all as for every other call).
 */
export function fetchMeFoodRecent(
  api: FitBudApiClient,
): Promise<TraineeFoodSearchResponse> {
  return api.request(
    "GET",
    "/me/foods/recent",
    traineeFoodSearchResponseSchema,
    { auth: true },
  );
}
