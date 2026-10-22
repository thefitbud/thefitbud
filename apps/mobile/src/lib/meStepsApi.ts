import {
  stepsSettingsResponseSchema,
  updateStepsSettingsRequestSchema,
  type StepsSettingsResponse,
  type UpdateStepsSettingsRequest,
} from "@fitbud/contracts";
import { resolveApiBaseUrl } from "./api";

async function parseEnvelope<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${label} failed (${response.status}).`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

/** GET /me/steps — not on FitBudApiClient public surface yet. */
export async function getMeSteps(
  accessToken: string,
): Promise<StepsSettingsResponse> {
  const response = await fetch(`${resolveApiBaseUrl()}/me/steps`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await parseEnvelope<unknown>(response, "Steps settings");
  return stepsSettingsResponseSchema.parse(data);
}

export async function updateMeSteps(
  accessToken: string,
  body: UpdateStepsSettingsRequest,
): Promise<StepsSettingsResponse> {
  const parsed = updateStepsSettingsRequestSchema.parse(body);
  const response = await fetch(`${resolveApiBaseUrl()}/me/steps`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed),
  });
  const data = await parseEnvelope<unknown>(response, "Update steps");
  return stepsSettingsResponseSchema.parse(data);
}
