import {
  createInvitationResponseSchema,
  invitationSchema,
  planTemplateListResponseSchema,
  type CreateInvitationResponse,
  type Invitation,
  type PlanTemplateListResponse,
} from "@fitbud/contracts";
import { getStoredAccessToken } from "./session";
import { resolveApiUrl } from "./api";

async function authedJson<T>(
  path: string,
  parse: (json: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const token = getStoredAccessToken();
  const res = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { data?: unknown };
  // API responses are `{ data: T }` envelopes; unwrap before schema parse.
  return parse(json.data ?? json);
}

export async function listPlanTemplatesExtended(query?: {
  cursor?: string;
  limit?: number;
  templateType?: string;
  scope?: "all" | "bases" | "mine";
  q?: string;
}): Promise<PlanTemplateListResponse> {
  const params = new URLSearchParams();
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.templateType) params.set("templateType", query.templateType);
  if (query?.scope && query.scope !== "all") params.set("scope", query.scope);
  if (query?.q) params.set("q", query.q);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return authedJson(`/templates${suffix}`, (json) =>
    planTemplateListResponseSchema.parse(json),
  );
}

export async function reissueInvitation(
  invitationId: string,
  idempotencyKey: string,
): Promise<CreateInvitationResponse> {
  return authedJson(
    `/invitations/${invitationId}/reissue`,
    (json) => createInvitationResponseSchema.parse(json),
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export async function revokeInvitation(
  invitationId: string,
  idempotencyKey: string,
): Promise<Invitation> {
  return authedJson(
    `/invitations/${invitationId}/revoke`,
    (json) => invitationSchema.parse(json),
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export async function cancelReactivation(
  relationshipId: string,
  idempotencyKey: string,
): Promise<{ status: string }> {
  return authedJson(
    `/relationships/${relationshipId}/reactivate/cancel`,
    (json) => {
      const record = json as { status?: string };
      return { status: String(record.status ?? "cancelled") };
    },
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}
