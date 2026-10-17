import {
  traineeFoodSearchResponseSchema,
  type TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { resolveApiBaseUrl } from "./api";

async function parseJson<T>(
  response: Response,
  label: string,
): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${label} failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

/** GET /me/foods/recent — not on FitBudApiClient public surface yet. */
export async function fetchMeFoodRecent(
  accessToken: string,
): Promise<TraineeFoodSearchResponse> {
  const response = await fetch(`${resolveApiBaseUrl()}/me/foods/recent`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const body = await parseJson<{ data?: unknown } | unknown>(
    response,
    "Recent foods",
  );
  const payload =
    body && typeof body === "object" && "data" in body
      ? (body as { data: unknown }).data
      : body;
  return traineeFoodSearchResponseSchema.parse(payload);
}
