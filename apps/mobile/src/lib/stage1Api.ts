import type { FitBudApiClient } from "@fitbud/api-client";
import type {
  AssignPlanVersionRequest,
  AssignPlanVersionResponse,
  AttentionGroupsResponse,
  AuthLoginRequest,
  AuthOtpStartRequest,
  AuthOtpStartResponse,
  AuthOtpVerifyRequest,
  AuthOtpVerifyResponse,
  AuthPasswordResetRequest,
  AuthPasswordSetRequest,
  AuthTokenResponse,
  CoachAsk,
  CreateCoachAskRequest,
  LinkKind,
  LinkResolveResponse,
  MeDayResponse,
  TraineeFoodDetail,
  TraineeFoodSearchResponse,
  Notification,
  ReminderStatus,
  UpdateMealTimesRequest,
  WeekReadModel,
} from "@fitbud/contracts";

type ActivityFeedResponse = {
  events: Array<{
    id: string;
    relationshipId: string;
    traineeDisplayName: string | null;
    type: string;
    subtype: string | null;
    occurredAt: string;
    traineeLocalTime: string | null;
    summary: string;
    kcal?: number | null;
    link?: string | null;
  }>;
  nextCursor: string | null;
};

type MealTimesResponse = {
  slots: Array<{
    slotKey: string;
    label: string;
    planTime: string;
    overrideTime?: string | null;
    dayPattern?: "all" | "weekdays" | "weekends" | null;
  }>;
  mealTimesNeedReview?: boolean;
};

/** Stage 1 methods installed on FitBudApiClient via stage1-augment (not on the public type). */
export type Stage1FitBudClient = FitBudApiClient & {
  login(body: AuthLoginRequest): Promise<AuthTokenResponse>;
  startOtp(body: AuthOtpStartRequest): Promise<AuthOtpStartResponse>;
  verifyOtp(body: AuthOtpVerifyRequest): Promise<AuthOtpVerifyResponse>;
  resetPassword(body: AuthPasswordResetRequest): Promise<AuthTokenResponse>;
  setPassword(body: AuthPasswordSetRequest): Promise<void>;
  getAttentionGroups(): Promise<AttentionGroupsResponse>;
  getActivityFeed(query?: {
    cursor?: string;
    limit?: number;
    rid?: string;
    since?: string;
  }): Promise<ActivityFeedResponse>;
  listCoachAsks(query?: { status?: string }): Promise<{ items: CoachAsk[] }>;
  createCoachAsk(body: CreateCoachAskRequest): Promise<CoachAsk>;
  answerCoachAsk(id: string, body?: { note?: string }): Promise<CoachAsk>;
  getMeDay(date: string): Promise<MeDayResponse>;
  getMeWeek(start?: string): Promise<WeekReadModel>;
  getMealTimes(): Promise<MealTimesResponse>;
  updateMealTimes(body: UpdateMealTimesRequest): Promise<MealTimesResponse>;
  getReminderStatus(): Promise<ReminderStatus>;
  resumeReminders(): Promise<ReminderStatus>;
  getInvitationPreview(token: string): Promise<{
    trainerDisplayName: string;
    status: "pending" | "accepted" | "expired" | "revoked";
  }>;
  searchMeFoods(query: { q: string; limit?: number }): Promise<TraineeFoodSearchResponse>;
  getTraineeFood(foodId: string): Promise<TraineeFoodDetail>;
  markNotificationRead(notificationId: string): Promise<Notification>;
  resolveLink(kind: LinkKind, id: string): Promise<LinkResolveResponse>;
  listMeCoachNotes(since?: string): Promise<{
    items: Array<{
      id: string;
      body: string;
      sharedAt: string | null;
      seenAt: string | null;
      createdAt: string;
    }>;
  }>;
  assignPlanVersion(
    planId: string,
    versionId: string,
    body: AssignPlanVersionRequest,
  ): Promise<AssignPlanVersionResponse>;
};

export function stage1Api(client: FitBudApiClient): Stage1FitBudClient {
  return client as Stage1FitBudClient;
}
