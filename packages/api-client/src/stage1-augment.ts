import {
  activityFeedResponseSchema,
  answerCoachAskRequestSchema,
  assignPlanVersionRequestSchema,
  assignPlanVersionResponseSchema,
  attentionGroupsResponseSchema,
  authLoginRequestSchema,
  authOtpStartRequestSchema,
  authOtpStartResponseSchema,
  authOtpVerifyRequestSchema,
  authOtpVerifyResponseSchema,
  authPasswordResetRequestSchema,
  authPasswordSetRequestSchema,
  authTokenResponseSchema,
  coachAskListResponseSchema,
  coachAskSchema,
  trainerProfileSchema,
  createCoachAskRequestSchema,
  endRelationshipRequestSchema,
  invitationPreviewResponseSchema,
  linkKindSchema,
  linkResolveResponseSchema,
  mealTimesResponseSchema,
  meDayResponseSchema,
  patchTrainerNoteRequestSchema,
  planVersionDiffResponseSchema,
  reactivateRelationshipRequestSchema,
  reengagementCandidatesResponseSchema,
  responsivenessResponseSchema,
  traineeFoodIndexResponseSchema,
  traineeFoodSearchResponseSchema,
  updateMealTimesRequestSchema,
  updateTrainerProfileRequestSchema,
  weekReadModelSchema,
  coachingRelationshipSchema,
  type AuthLoginRequest,
  type AuthOtpStartRequest,
  type AuthOtpVerifyRequest,
  type AuthPasswordResetRequest,
  type AuthPasswordSetRequest,
  type CreateCoachAskRequest,
  type AnswerCoachAskRequest,
  type EndRelationshipRequest,
  type PatchTrainerNoteRequest,
  type UpdateMealTimesRequest,
  type UpdateTrainerProfileRequest,
  type AssignPlanVersionRequest,
  type LinkKind,
} from "@fitbud/contracts";
import { z } from "zod";
import { trainerNoteSchema } from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

export function installStage1ClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient & Record<string, unknown>;

const coachNotesListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      body: z.string(),
      sharedAt: z.string().nullable(),
      seenAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

const foodDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  redirectedFrom: z.string().uuid().optional(),
});

const customLoggedSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      kcalScaled: z.number().int(),
      servingLabel: z.string(),
      createdAt: z.string(),
    }),
  ),
});

proto.login = async function login(
  body: AuthLoginRequest,
) {
  const parsed = authLoginRequestSchema.parse(body);
  return this.request("POST", "/auth/login", authTokenResponseSchema, {
    body: parsed,
  });
};

proto.startOtp = async function startOtp(
  body: AuthOtpStartRequest,
) {
  const parsed = authOtpStartRequestSchema.parse(body);
  return this.request("POST", "/auth/otp/start", authOtpStartResponseSchema, {
    body: parsed,
  });
};

proto.verifyOtp = async function verifyOtp(
  body: AuthOtpVerifyRequest,
) {
  const parsed = authOtpVerifyRequestSchema.parse(body);
  return this.request("POST", "/auth/otp/verify", authOtpVerifyResponseSchema, {
    body: parsed,
  });
};

proto.resetPassword = async function resetPassword(
  body: AuthPasswordResetRequest,
) {
  const parsed = authPasswordResetRequestSchema.parse(body);
  return this.request("POST", "/auth/password/reset", authTokenResponseSchema, {
    body: parsed,
  });
};

proto.setPassword = async function setPassword(
  body: AuthPasswordSetRequest,
) {
  const parsed = authPasswordSetRequestSchema.parse(body);
  return this.request("POST", "/auth/password/set", authTokenResponseSchema, {
    auth: true,
    body: parsed,
  });
};

proto.updateTrainerProfile = async function updateTrainerProfile(
  body: UpdateTrainerProfileRequest,
) {
  const parsed = updateTrainerProfileRequestSchema.parse(body);
  return this.request("PUT", "/me/trainer-profile", trainerProfileSchema, {
    auth: true,
    body: parsed,
  });
};

proto.getInvitationPreview = async function getInvitationPreview(
  token: string,
) {
  return this.request(
    "GET",
    `/invitations/preview?token=${encodeURIComponent(token)}`,
    invitationPreviewResponseSchema,
  );
};

proto.endRelationship = async function endRelationship(
  relationshipId: string,
  body: EndRelationshipRequest,
  idempotencyKey: string,
) {
  const parsed = endRelationshipRequestSchema.parse(body);
  return this.request(
    "POST",
    `/relationships/${relationshipId}/end`,
    coachingRelationshipSchema,
    { auth: true, body: parsed, idempotencyKey },
  );
};

proto.requestReactivation = async function requestReactivation(
  relationshipId: string,
  body: { intakeUpdateRequested?: boolean },
  idempotencyKey: string,
) {
  const parsed = reactivateRelationshipRequestSchema.parse(body);
  return this.request(
    "POST",
    `/relationships/${relationshipId}/reactivate`,
    z.object({ requestId: z.string().uuid(), status: z.literal("pending") }),
    { auth: true, body: parsed, idempotencyKey },
  );
};

proto.getAttentionGroups = async function getAttentionGroups() {
  return this.request(
    "GET",
    "/exceptions/attention?groupBy=relationship",
    attentionGroupsResponseSchema,
    { auth: true },
  );
};

proto.getActivityFeed = async function getActivityFeed(query?: {
  cursor?: string;
  limit?: number;
  rid?: string;
  since?: string;
  types?: string;
}) {
  const params = new URLSearchParams();
  if (query?.cursor) params.set("cursor", query.cursor);
  if (query?.limit !== undefined) params.set("limit", String(query.limit));
  if (query?.rid) params.set("rid", query.rid);
  if (query?.since) params.set("since", query.since);
  if (query?.types) params.set("types", query.types);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return this.request("GET", `/activity/feed${suffix}`, activityFeedResponseSchema, {
    auth: true,
  });
};

proto.getWorkspaceWeek = async function getWorkspaceWeek(
  relationshipId: string,
  start?: string,
) {
  const suffix = start ? `?start=${encodeURIComponent(start)}` : "";
  return this.request(
    "GET",
    `/workspaces/relationships/${relationshipId}/week${suffix}`,
    weekReadModelSchema,
    { auth: true },
  );
};

proto.getResponsiveness = async function getResponsiveness(
  relationshipId: string,
  days = 14,
) {
  return this.request(
    "GET",
    `/notifications/relationships/${relationshipId}/responsiveness?days=${days}`,
    responsivenessResponseSchema,
    { auth: true },
  );
};

proto.getReengagementCandidates =
  async function getReengagementCandidates() {
    return this.request(
      "GET",
      "/notifications/reengagement-candidates",
      reengagementCandidatesResponseSchema,
      { auth: true },
    );
  };

proto.listCoachAsks = async function listCoachAsks(query?: {
  status?: string;
}) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return this.request("GET", `/coach-asks${suffix}`, coachAskListResponseSchema, {
    auth: true,
  });
};

proto.createCoachAsk = async function createCoachAsk(
  body: CreateCoachAskRequest,
  idempotencyKey: string,
) {
  const parsed = createCoachAskRequestSchema.parse(body);
  return this.request("POST", "/coach-asks", coachAskSchema, {
    auth: true,
    body: parsed,
    idempotencyKey,
  });
};

proto.answerCoachAsk = async function answerCoachAsk(
  askId: string,
  body: AnswerCoachAskRequest,
  idempotencyKey: string,
) {
  const parsed = answerCoachAskRequestSchema.parse(body);
  return this.request("POST", `/coach-asks/${askId}/answer`, coachAskSchema, {
    auth: true,
    body: parsed,
    idempotencyKey,
  });
};

proto.listMeCoachNotes = async function listMeCoachNotes(
  since?: string,
) {
  const suffix = since ? `?since=${encodeURIComponent(since)}` : "";
  return this.request("GET", `/me/coach-notes${suffix}`, coachNotesListSchema, {
    auth: true,
  });
};

proto.getMealTimes = async function getMealTimes() {
  return this.request("GET", "/me/meal-times", mealTimesResponseSchema, {
    auth: true,
  });
};

proto.updateMealTimes = async function updateMealTimes(
  body: UpdateMealTimesRequest,
) {
  const parsed = updateMealTimesRequestSchema.parse(body);
  return this.request("PUT", "/me/meal-times", mealTimesResponseSchema, {
    auth: true,
    body: parsed,
  });
};

proto.getMeDay = async function getMeDay(date: string) {
  return this.request("GET", `/me/day/${date}`, meDayResponseSchema, {
    auth: true,
  });
};

proto.getMeWeek = async function getMeWeek(start?: string) {
  const suffix = start ? `?start=${encodeURIComponent(start)}` : "";
  return this.request("GET", `/me/week${suffix}`, weekReadModelSchema, {
    auth: true,
  });
};

proto.searchMeFoods = async function searchMeFoods(query: {
  q?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return this.request(
    "GET",
    `/me/foods/search${suffix}`,
    traineeFoodSearchResponseSchema,
    { auth: true },
  );
};

proto.getMeFoodIndex = async function getMeFoodIndex(
  since?: string,
) {
  const suffix = since ? `?since=${encodeURIComponent(since)}` : "";
  return this.request(
    "GET",
    `/me/foods/index${suffix}`,
    traineeFoodIndexResponseSchema,
    { auth: true },
  );
};

proto.resolveLink = async function resolveLink(
  kind: LinkKind,
  id: string,
) {
  linkKindSchema.parse(kind);
  return this.request(
    "GET",
    `/links/resolve?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
    linkResolveResponseSchema,
    { auth: true },
  );
};

proto.patchTrainerNote = async function patchTrainerNote(
  relationshipId: string,
  noteId: string,
  body: PatchTrainerNoteRequest,
  idempotencyKey: string,
) {
  const parsed = patchTrainerNoteRequestSchema.parse(body);
  return this.request(
    "PATCH",
    `/checkins/relationships/${relationshipId}/notes/${noteId}`,
    trainerNoteSchema,
    { auth: true, body: parsed, idempotencyKey },
  );
};

proto.assignPlanVersion = async function assignPlanVersion(
  planId: string,
  versionId: string,
  body: AssignPlanVersionRequest,
  idempotencyKey: string,
) {
  const parsed = assignPlanVersionRequestSchema.parse(body);
  return this.request(
    "POST",
    `/plans/${planId}/versions/${versionId}/assign`,
    assignPlanVersionResponseSchema,
    { auth: true, body: parsed, idempotencyKey },
  );
};

proto.getPlanVersionDiff = async function getPlanVersionDiff(
  planId: string,
  versionId: string,
) {
  return this.request(
    "GET",
    `/plans/${planId}/versions/${versionId}/diff`,
    planVersionDiffResponseSchema,
    { auth: true },
  );
};

proto.getFoodLibraryItem = async function getFoodLibraryItem(
  itemId: string,
) {
  return this.request("GET", `/libraries/foods/${itemId}`, foodDetailSchema, {
    auth: true,
  });
};

proto.listCustomLoggedFoods = async function listCustomLoggedFoods(
  relationshipId: string,
) {
  return this.request(
    "GET",
    `/libraries/foods/custom-logged?rid=${encodeURIComponent(relationshipId)}`,
    customLoggedSchema,
    { auth: true },
  );
};
}
