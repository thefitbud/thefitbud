import type { FitBudApiClient } from "@fitbud/api-client";
import type {
  AnswerCoachAskRequest,
  AssignPlanVersionRequest,
  AuthLoginRequest,
  AuthOtpStartRequest,
  AuthOtpVerifyRequest,
  AuthPasswordResetRequest,
  AuthPasswordSetRequest,
  CreateCoachAskRequest,
  EndRelationshipRequest,
  LinkKind,
  PatchTrainerNoteRequest,
  UpdateTrainerProfileRequest,
} from "@fitbud/contracts";
import { apiClient } from "./api";

/** Typed view of Stage 1 methods installed on the api client prototype. */
export type Stage1ApiClient = FitBudApiClient & {
  login: (body: AuthLoginRequest) => Promise<{
    token: string;
    tokenKind: "test_id_token" | "firebase_custom_token";
    userId: string;
  }>;
  startOtp: (body: AuthOtpStartRequest) => Promise<{
    sent: true;
    channels: Array<"email" | "whatsapp">;
  }>;
  verifyOtp: (body: AuthOtpVerifyRequest) => Promise<unknown>;
  resetPassword: (body: AuthPasswordResetRequest) => Promise<{
    token: string;
    tokenKind: "test_id_token" | "firebase_custom_token";
    userId: string;
  }>;
  setPassword: (body: AuthPasswordSetRequest) => Promise<{
    token: string;
    tokenKind: "test_id_token" | "firebase_custom_token";
    userId: string;
  }>;
  updateTrainerProfile: (body: UpdateTrainerProfileRequest) => Promise<unknown>;
  getAttentionGroups: () => Promise<import("@fitbud/contracts").AttentionGroupsResponse>;
  getActivityFeed: (query?: {
    cursor?: string;
    limit?: number;
    rid?: string;
    since?: string;
    types?: string;
  }) => Promise<{
    events: Array<{
      id: string;
      traineeDisplayName: string | null;
      summary: string;
      occurredAt: string;
      traineeLocalTime: string | null;
    }>;
    nextCursor: string | null;
  }>;
  getReengagementCandidates: () => Promise<
    import("@fitbud/contracts").ReengagementCandidatesResponse
  >;
  listCoachAsks: (query?: { status?: string }) => Promise<{
    items: import("@fitbud/contracts").CoachAsk[];
  }>;
  answerCoachAsk: (
    askId: string,
    body: AnswerCoachAskRequest,
    idempotencyKey: string,
  ) => Promise<unknown>;
  getResponsiveness: (
    relationshipId: string,
    days?: number,
  ) => Promise<import("@fitbud/contracts").ResponsivenessResponse>;
  getWorkspaceWeek: (
    relationshipId: string,
    start?: string,
  ) => Promise<import("@fitbud/contracts").WeekReadModel>;
  endRelationship: (
    relationshipId: string,
    body: EndRelationshipRequest,
    idempotencyKey: string,
  ) => Promise<unknown>;
  requestReactivation: (
    relationshipId: string,
    body: { intakeUpdateRequested?: boolean },
    idempotencyKey: string,
  ) => Promise<{ requestId: string; status: "pending" }>;
  patchTrainerNote: (
    relationshipId: string,
    noteId: string,
    body: PatchTrainerNoteRequest,
    idempotencyKey: string,
  ) => Promise<unknown>;
  assignPlanVersion: (
    planId: string,
    versionId: string,
    body: AssignPlanVersionRequest,
    idempotencyKey: string,
  ) => Promise<unknown>;
  getPlanVersionDiff: (
    planId: string,
    versionId: string,
  ) => Promise<unknown>;
  resolveLink: (kind: LinkKind, id: string) => Promise<unknown>;
  createCoachAsk: (
    body: CreateCoachAskRequest,
    idempotencyKey: string,
  ) => Promise<unknown>;
};

export const stage1Api = apiClient as Stage1ApiClient;
