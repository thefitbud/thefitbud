import {
  apiErrorBodySchema,
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  activateConfigurationRequestSchema,
  coachingConfigurationSchema,
  configureConfigurationRequestSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  createOnboardingReviewRequestSchema,
  createOnboardingReviewResponseSchema,
  acknowledgeExceptionRequestSchema,
  attentionFeedResponseSchema,
  createInterventionRequestSchema,
  createPlanDraftFromVersionRequestSchema,
  createPlanRequestSchema,
  createPlanResponseSchema,
  applyPlanTemplateRequestSchema,
  applyPlanTemplateResponseSchema,
  createPlanTemplateFromVersionRequestSchema,
  createPlanTemplateRequestSchema,
  createExerciseLibraryItemRequestSchema,
  createFoodLibraryItemRequestSchema,
  createWebSessionRequestSchema,
  createWebSessionResponseSchema,
  effectivePlanResponseSchema,
  evaluateExceptionsResponseSchema,
  exceptionDetailSchema,
  exceptionListResponseSchema,
  exceptionSchema,
  clientDirectoryListResponseSchema,
  exerciseLibraryItemSchema,
  exerciseLibraryListResponseSchema,
  foodLibraryItemSchema,
  foodLibraryListResponseSchema,
  clientWorkspaceSchema,
  healthResponseSchema,
  historyListResponseSchema,
  workspaceActivityListResponseSchema,
  createOnboardingFormTemplateRequestSchema,
  createOnboardingFormTemplateVersionRequestSchema,
  forkOnboardingFormTemplateRequestSchema,
  forkPlanTemplateRequestSchema,
  onboardingFormResponseSchema,
  onboardingFormTemplateDetailSchema,
  onboardingFormTemplateListResponseSchema,
  onboardingFormVersionSchema,
  invitationListResponseSchema,
  invitationSchema,
  interventionListResponseSchema,
  interventionSchema,
  meResponseSchema,
  traineeProfileSchema,
  updateTraineeProfileRequestSchema,
  acknowledgePlanConsistencyRequestSchema,
  planConsistencyResponseSchema,
  planListResponseSchema,
  planTemplateListResponseSchema,
  planTemplateSchema,
  planVersionSchema,
  planWithVersionsSchema,
  publishPlanRequestSchema,
  resolveExceptionRequestSchema,
  relationshipListResponseSchema,
  coachingRelationshipSchema,
  saveConfigurationDraftRequestSchema,
  saveOnboardingDraftRequestSchema,
  saveSubscriptionRequestSchema,
  submitOnboardingRequestSchema,
  subscriptionAttentionResponseSchema,
  subscriptionSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  evaluateRemindersResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
  registerDeviceTokenRequestSchema,
  registerDeviceTokenResponseSchema,
  updateNotificationPreferencesRequestSchema,
  updatePlanTemplateRequestSchema,
  updateExerciseLibraryItemRequestSchema,
  updateFoodLibraryItemRequestSchema,
  realtimeEventSchema,
  realtimeSubscriptionTargetSchema,
  relationshipRealtimePath,
  updatePlanDraftRequestSchema,
  completeSetRequestSchema,
  completeWorkoutRequestSchema,
  checkinListResponseSchema,
  checkinReviewContextSchema,
  checkinSchema,
  confirmMealRequestSchema,
  createTrainerNoteRequestSchema,
  createMeasurementRequestSchema,
  createProgressEntryRequestSchema,
  createUploadTargetRequestSchema,
  createUploadTargetResponseSchema,
  deviateMealRequestSchema,
  downloadTargetResponseSchema,
  generateMealAssignmentsRequestSchema,
  generateMealAssignmentsResponseSchema,
  generateWorkoutAssignmentsRequestSchema,
  generateWorkoutAssignmentsResponseSchema,
  mealAssignmentListResponseSchema,
  mealAssignmentSchema,
  mealComplianceSchema,
  mealComplianceSummaryResponseSchema,
  measurementListResponseSchema,
  measurementSchema,
  mediaAssetSchema,
  progressEntryListResponseSchema,
  progressEntrySchema,
  progressSummarySchema,
  recordCheckinReviewRequestSchema,
  saveCheckinDraftRequestSchema,
  scheduleCheckinRequestSchema,
  scheduleCheckinResponseSchema,
  scheduleNextCheckinRequestSchema,
  skipMealRequestSchema,
  submitCheckinRequestSchema,
  trainerCheckinInboxResponseSchema,
  trainerNoteListResponseSchema,
  trainerNoteSchema,
  workoutAdherenceResponseSchema,
  workoutAssignmentListResponseSchema,
  workoutAssignmentSchema,
  workoutExecutionSchema,
  type AcceptInvitationRequest,
  type AcceptInvitationResponse,
  type AcknowledgeExceptionRequest,
  type ActivateConfigurationRequest,
  type AttentionFeedResponse,
  type CoachingConfiguration,
  type CoachingRelationship,
  type Checkin,
  type CheckinListResponse,
  type CheckinReviewContext,
  type CompleteSetRequest,
  type CompleteWorkoutRequest,
  type ConfirmMealRequest,
  type ConfigureConfigurationRequest,
  type CreateInterventionRequest,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type CreateMeasurementRequest,
  type CreateOnboardingReviewRequest,
  type CreateOnboardingReviewResponse,
  type CreatePlanDraftFromVersionRequest,
  type CreatePlanRequest,
  type CreatePlanResponse,
  type ApplyPlanTemplateRequest,
  type ApplyPlanTemplateResponse,
  type CreatePlanTemplateFromVersionRequest,
  type CreatePlanTemplateRequest,
  type CreateExerciseLibraryItemRequest,
  type CreateFoodLibraryItemRequest,
  type CreateProgressEntryRequest,
  type CreateTrainerNoteRequest,
  type CreateUploadTargetRequest,
  type CreateUploadTargetResponse,
  type CreateWebSessionRequest,
  type CreateWebSessionResponse,
  type DeviateMealRequest,
  type DownloadTargetResponse,
  type EffectivePlanResponse,
  type EvaluateExceptionsResponse,
  type Exception,
  type ExceptionDetail,
  type ExceptionListResponse,
  type AdherenceState,
  type ClientDirectoryListResponse,
  type ExerciseDifficulty,
  type ExerciseLibraryItem,
  type ExerciseLibraryListResponse,
  type FoodLibraryItem,
  type FoodLibraryListResponse,
  type GenerateMealAssignmentsRequest,
  type GenerateMealAssignmentsResponse,
  type GenerateWorkoutAssignmentsRequest,
  type GenerateWorkoutAssignmentsResponse,
  type ClientWorkspace,
  type HistoryItemKind,
  type HistoryListResponse,
  type PlanVersionStatus,
  type WorkspaceActivityListResponse,
  type WorkspaceActivityType,
  type HealthResponse,
  type CreateOnboardingFormTemplateRequest,
  type CreateOnboardingFormTemplateVersionRequest,
  type ForkOnboardingFormTemplateRequest,
  type ForkPlanTemplateRequest,
  type OnboardingStatus,
  type OnboardingFormResponse,
  type OnboardingFormTemplateDetail,
  type OnboardingFormTemplateListResponse,
  type OnboardingFormVersion,
  type Intervention,
  type InterventionListResponse,
  type Invitation,
  type InvitationListResponse,
  type MealAssignment,
  type MealAssignmentListResponse,
  type MealCompliance,
  type MealComplianceSummaryResponse,
  type Measurement,
  type MeasurementListResponse,
  type MediaAsset,
  type MeResponse,
  type AcknowledgePlanConsistencyRequest,
  type PlanConsistencyResponse,
  type PlanListResponse,
  type PlanTemplate,
  type PlanTemplateListResponse,
  type PlanVersion,
  type PlanWithVersions,
  type ProgressEntry,
  type ProgressEntryListResponse,
  type ProgressSummary,
  type PublishPlanRequest,
  type RecordCheckinReviewRequest,
  type RelationshipListResponse,
  type ResolveExceptionRequest,
  type SaveCheckinDraftRequest,
  type SaveConfigurationDraftRequest,
  type SaveOnboardingDraftRequest,
  type SaveSubscriptionRequest,
  type ScheduleCheckinRequest,
  type ScheduleCheckinResponse,
  type ScheduleNextCheckinRequest,
  type SkipMealRequest,
  type SubmitCheckinRequest,
  type SubmitOnboardingRequest,
  type Subscription,
  type SubscriptionAttentionResponse,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type EvaluateRemindersResponse,
  type NotificationListResponse,
  type NotificationPreferences,
  type RegisterDeviceTokenRequest,
  type RegisterDeviceTokenResponse,
  type UpdateNotificationPreferencesRequest,
  type RealtimeEvent,
  type RealtimeSubscriptionTarget,
  type TraineeProfile,
  type UpdateTraineeProfileRequest,
  type TrainerCheckinInboxResponse,
  type TrainerNote,
  type TrainerNoteListResponse,
  type UpdateExerciseLibraryItemRequest,
  type UpdateFoodLibraryItemRequest,
  type UpdatePlanDraftRequest,
  type UpdatePlanTemplateRequest,
  type WorkoutAdherenceResponse,
  type WorkoutAssignment,
  type WorkoutAssignmentListResponse,
  type WorkoutExecution,
} from "@fitbud/contracts";

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  getIdempotencyKey?: () => string | null | Promise<string | null>;
  getSelectedRole?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    requestId: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.details = input.details;
  }
}

export class FitBudApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: ApiClientOptions["getAccessToken"];
  private readonly getIdempotencyKey?: ApiClientOptions["getIdempotencyKey"];
  private readonly getSelectedRole?: ApiClientOptions["getSelectedRole"];
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAccessToken = options.getAccessToken;
    this.getIdempotencyKey = options.getIdempotencyKey;
    this.getSelectedRole = options.getSelectedRole;
    // Bind to globalThis so calling `this.fetchImpl(...)` does not throw Illegal invocation.
    this.fetchImpl =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async health(): Promise<HealthResponse> {
    return this.request("GET", "/health", healthResponseSchema);
  }

  async me(): Promise<MeResponse> {
    return this.request("GET", "/me", meResponseSchema, { auth: true });
  }

  async createWebSession(
    body: CreateWebSessionRequest,
  ): Promise<CreateWebSessionResponse> {
    const parsed = createWebSessionRequestSchema.parse(body);
    return this.request(
      "POST",
      "/auth/session",
      createWebSessionResponseSchema,
      { body: parsed },
    );
  }

  async endWebSession(): Promise<void> {
    await this.request("DELETE", "/auth/session", undefined, { auth: true });
  }

  async createInvitation(
    body: CreateInvitationRequest,
    idempotencyKey: string,
  ): Promise<CreateInvitationResponse> {
    const parsed = createInvitationRequestSchema.parse(body);
    return this.request(
      "POST",
      "/invitations",
      createInvitationResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listInvitations(query?: {
    cursor?: string;
    limit?: number;
  }): Promise<InvitationListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/invitations${suffix}`,
      invitationListResponseSchema,
      { auth: true },
    );
  }

  async getInvitation(invitationId: string): Promise<Invitation> {
    return this.request(
      "GET",
      `/invitations/${invitationId}`,
      invitationSchema,
      { auth: true },
    );
  }

  async acceptInvitation(
    body: AcceptInvitationRequest,
  ): Promise<AcceptInvitationResponse> {
    const parsed = acceptInvitationRequestSchema.parse(body);
    return this.request(
      "POST",
      "/invitations/accept",
      acceptInvitationResponseSchema,
      { auth: true, body: parsed },
    );
  }

  async listRelationships(query?: {
    cursor?: string;
    limit?: number;
  }): Promise<RelationshipListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/relationships${suffix}`,
      relationshipListResponseSchema,
      { auth: true },
    );
  }

  async getRelationship(relationshipId: string): Promise<CoachingRelationship> {
    return this.request(
      "GET",
      `/relationships/${relationshipId}`,
      coachingRelationshipSchema,
      { auth: true },
    );
  }

  async getCurrentOnboardingForm(
    relationshipId?: string,
  ): Promise<OnboardingFormVersion> {
    const suffix = relationshipId
      ? `?relationshipId=${encodeURIComponent(relationshipId)}`
      : "";
    return this.request(
      "GET",
      `/onboarding/forms/current${suffix}`,
      onboardingFormVersionSchema,
      { auth: true },
    );
  }

  async getOnboardingResponse(
    relationshipId: string,
  ): Promise<OnboardingFormResponse> {
    return this.request(
      "GET",
      `/onboarding/relationships/${relationshipId}`,
      onboardingFormResponseSchema,
      { auth: true },
    );
  }

  async saveOnboardingDraft(
    relationshipId: string,
    body: SaveOnboardingDraftRequest,
  ): Promise<OnboardingFormResponse> {
    const parsed = saveOnboardingDraftRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/onboarding/relationships/${relationshipId}/draft`,
      onboardingFormResponseSchema,
      { auth: true, body: parsed },
    );
  }

  async submitOnboarding(
    relationshipId: string,
    body: SubmitOnboardingRequest,
    idempotencyKey: string,
  ): Promise<OnboardingFormResponse> {
    const parsed = submitOnboardingRequestSchema.parse(body);
    return this.request(
      "POST",
      `/onboarding/relationships/${relationshipId}/submit`,
      onboardingFormResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listOnboardingFormTemplates(query?: {
    cursor?: string;
    limit?: number;
  }): Promise<OnboardingFormTemplateListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/onboarding/form-templates${suffix}`,
      onboardingFormTemplateListResponseSchema,
      { auth: true },
    );
  }

  async getOnboardingFormTemplate(
    templateId: string,
  ): Promise<OnboardingFormTemplateDetail> {
    return this.request(
      "GET",
      `/onboarding/form-templates/${templateId}`,
      onboardingFormTemplateDetailSchema,
      { auth: true },
    );
  }

  async createOnboardingFormTemplate(
    body: CreateOnboardingFormTemplateRequest,
    idempotencyKey: string,
  ): Promise<OnboardingFormTemplateDetail> {
    const parsed = createOnboardingFormTemplateRequestSchema.parse(body);
    return this.request(
      "POST",
      "/onboarding/form-templates",
      onboardingFormTemplateDetailSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async forkOnboardingFormTemplate(
    templateId: string,
    body: ForkOnboardingFormTemplateRequest,
    idempotencyKey: string,
  ): Promise<OnboardingFormTemplateDetail> {
    const parsed = forkOnboardingFormTemplateRequestSchema.parse(body);
    return this.request(
      "POST",
      `/onboarding/form-templates/${templateId}/fork`,
      onboardingFormTemplateDetailSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async createOnboardingFormTemplateVersion(
    templateId: string,
    body: CreateOnboardingFormTemplateVersionRequest,
    idempotencyKey: string,
  ): Promise<OnboardingFormTemplateDetail> {
    const parsed = createOnboardingFormTemplateVersionRequestSchema.parse(body);
    return this.request(
      "POST",
      `/onboarding/form-templates/${templateId}/versions`,
      onboardingFormTemplateDetailSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async reviewOnboarding(
    relationshipId: string,
    body: CreateOnboardingReviewRequest,
    idempotencyKey: string,
  ): Promise<CreateOnboardingReviewResponse> {
    const parsed = createOnboardingReviewRequestSchema.parse(body);
    return this.request(
      "POST",
      `/onboarding/relationships/${relationshipId}/review`,
      createOnboardingReviewResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getCoachingConfiguration(
    relationshipId: string,
  ): Promise<CoachingConfiguration> {
    return this.request(
      "GET",
      `/configurations/relationships/${relationshipId}`,
      coachingConfigurationSchema,
      { auth: true },
    );
  }

  async saveConfigurationDraft(
    relationshipId: string,
    body: SaveConfigurationDraftRequest,
  ): Promise<CoachingConfiguration> {
    const parsed = saveConfigurationDraftRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/configurations/relationships/${relationshipId}/draft`,
      coachingConfigurationSchema,
      { auth: true, body: parsed },
    );
  }

  async configureConfiguration(
    relationshipId: string,
    body: ConfigureConfigurationRequest,
    idempotencyKey: string,
  ): Promise<CoachingConfiguration> {
    const parsed = configureConfigurationRequestSchema.parse(body);
    return this.request(
      "POST",
      `/configurations/relationships/${relationshipId}/configure`,
      coachingConfigurationSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async createConfigurationVersion(
    relationshipId: string,
    body: ActivateConfigurationRequest,
    idempotencyKey: string,
  ): Promise<CoachingConfiguration> {
    const parsed = activateConfigurationRequestSchema.parse(body);
    return this.request(
      "POST",
      `/configurations/relationships/${relationshipId}/versions`,
      coachingConfigurationSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getSubscription(relationshipId: string): Promise<Subscription> {
    return this.request(
      "GET",
      `/relationships/${relationshipId}/subscription`,
      subscriptionSchema,
      { auth: true },
    );
  }

  async saveSubscription(
    relationshipId: string,
    body: SaveSubscriptionRequest,
    idempotencyKey: string,
  ): Promise<Subscription> {
    const parsed = saveSubscriptionRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/relationships/${relationshipId}/subscription`,
      subscriptionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listSubscriptionAttention(): Promise<SubscriptionAttentionResponse> {
    return this.request(
      "GET",
      "/subscriptions/attention",
      subscriptionAttentionResponseSchema,
      { auth: true },
    );
  }

  async activateConfiguration(
    relationshipId: string,
    body: ActivateConfigurationRequest,
    idempotencyKey: string,
  ): Promise<CoachingConfiguration> {
    const parsed = activateConfigurationRequestSchema.parse(body);
    return this.request(
      "POST",
      `/configurations/relationships/${relationshipId}/activate`,
      coachingConfigurationSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listPlans(
    relationshipId: string,
    query?: {
      cursor?: string;
      limit?: number;
      versionStatus?: PlanVersionStatus;
      effectiveFrom?: string;
      effectiveTo?: string;
    },
  ): Promise<PlanListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    if (query?.versionStatus) params.set("versionStatus", query.versionStatus);
    if (query?.effectiveFrom) params.set("effectiveFrom", query.effectiveFrom);
    if (query?.effectiveTo) params.set("effectiveTo", query.effectiveTo);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/plans/relationships/${relationshipId}${suffix}`,
      planListResponseSchema,
      { auth: true },
    );
  }

  async getEffectivePlan(
    relationshipId: string,
  ): Promise<EffectivePlanResponse> {
    return this.request(
      "GET",
      `/plans/relationships/${relationshipId}/effective`,
      effectivePlanResponseSchema,
      { auth: true },
    );
  }

  async createPlan(
    relationshipId: string,
    body: CreatePlanRequest,
    idempotencyKey: string,
  ): Promise<CreatePlanResponse> {
    const parsed = createPlanRequestSchema.parse(body);
    return this.request(
      "POST",
      `/plans/relationships/${relationshipId}`,
      createPlanResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getPlan(planId: string): Promise<PlanWithVersions> {
    return this.request("GET", `/plans/${planId}`, planWithVersionsSchema, {
      auth: true,
    });
  }

  async getPlanVersion(
    planId: string,
    versionId: string,
  ): Promise<PlanVersion> {
    return this.request(
      "GET",
      `/plans/${planId}/versions/${versionId}`,
      planVersionSchema,
      { auth: true },
    );
  }

  async updatePlanDraft(
    planId: string,
    versionId: string,
    body: UpdatePlanDraftRequest,
  ): Promise<PlanVersion> {
    const parsed = updatePlanDraftRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/plans/${planId}/versions/${versionId}`,
      planVersionSchema,
      { auth: true, body: parsed },
    );
  }

  async previewPlanVersion(
    planId: string,
    versionId: string,
  ): Promise<PlanVersion> {
    return this.request(
      "POST",
      `/plans/${planId}/versions/${versionId}/preview`,
      planVersionSchema,
      { auth: true, body: {} },
    );
  }

  async publishPlanVersion(
    planId: string,
    versionId: string,
    body: PublishPlanRequest,
    idempotencyKey: string,
  ): Promise<PlanVersion> {
    const parsed = publishPlanRequestSchema.parse(body);
    return this.request(
      "POST",
      `/plans/${planId}/versions/${versionId}/publish`,
      planVersionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getPlanConsistency(
    planId: string,
    versionId: string,
  ): Promise<PlanConsistencyResponse> {
    return this.request(
      "GET",
      `/plans/${planId}/versions/${versionId}/consistency`,
      planConsistencyResponseSchema,
      { auth: true },
    );
  }

  async acknowledgePlanConsistency(
    planId: string,
    versionId: string,
    body: AcknowledgePlanConsistencyRequest,
  ): Promise<PlanConsistencyResponse> {
    const parsed = acknowledgePlanConsistencyRequestSchema.parse(body);
    return this.request(
      "POST",
      `/plans/${planId}/versions/${versionId}/consistency-acknowledgement`,
      planConsistencyResponseSchema,
      { auth: true, body: parsed },
    );
  }

  async createPlanDraftFromVersion(
    planId: string,
    body: CreatePlanDraftFromVersionRequest,
    idempotencyKey: string,
  ): Promise<PlanVersion> {
    const parsed = createPlanDraftFromVersionRequestSchema.parse(body);
    return this.request(
      "POST",
      `/plans/${planId}/versions`,
      planVersionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async applyPlanTemplate(
    relationshipId: string,
    body: ApplyPlanTemplateRequest,
    idempotencyKey: string,
  ): Promise<ApplyPlanTemplateResponse> {
    const parsed = applyPlanTemplateRequestSchema.parse(body);
    return this.request(
      "POST",
      `/plans/relationships/${relationshipId}/from-template`,
      applyPlanTemplateResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listPlanTemplates(query?: {
    cursor?: string;
    limit?: number;
  }): Promise<PlanTemplateListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/templates${suffix}`,
      planTemplateListResponseSchema,
      { auth: true },
    );
  }

  async getPlanTemplate(templateId: string): Promise<PlanTemplate> {
    return this.request(
      "GET",
      `/templates/${templateId}`,
      planTemplateSchema,
      { auth: true },
    );
  }

  async createPlanTemplate(
    body: CreatePlanTemplateRequest,
    idempotencyKey: string,
  ): Promise<PlanTemplate> {
    const parsed = createPlanTemplateRequestSchema.parse(body);
    return this.request("POST", "/templates", planTemplateSchema, {
      auth: true,
      body: parsed,
      idempotencyKey,
    });
  }

  async createPlanTemplateFromVersion(
    body: CreatePlanTemplateFromVersionRequest,
    idempotencyKey: string,
  ): Promise<PlanTemplate> {
    const parsed = createPlanTemplateFromVersionRequestSchema.parse(body);
    return this.request(
      "POST",
      "/templates/from-plan-version",
      planTemplateSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async updatePlanTemplate(
    templateId: string,
    body: UpdatePlanTemplateRequest,
  ): Promise<PlanTemplate> {
    const parsed = updatePlanTemplateRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/templates/${templateId}`,
      planTemplateSchema,
      { auth: true, body: parsed },
    );
  }

  async forkPlanTemplate(
    templateId: string,
    body: ForkPlanTemplateRequest,
    idempotencyKey: string,
  ): Promise<PlanTemplate> {
    const parsed = forkPlanTemplateRequestSchema.parse(body);
    return this.request(
      "POST",
      `/templates/${templateId}/fork`,
      planTemplateSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async deletePlanTemplate(templateId: string): Promise<void> {
    await this.request("DELETE", `/templates/${templateId}`, undefined, {
      auth: true,
    });
  }

  async listClients(query?: {
    q?: string;
    status?: OnboardingStatus[];
    adherenceState?: AdherenceState[];
    goal?: string[];
    cursor?: string;
    limit?: number;
  }): Promise<ClientDirectoryListResponse> {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    for (const status of query?.status ?? []) params.append("status", status);
    for (const state of query?.adherenceState ?? []) {
      params.append("adherenceState", state);
    }
    for (const goal of query?.goal ?? []) params.append("goal", goal);
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/clients${suffix}`,
      clientDirectoryListResponseSchema,
      { auth: true },
    );
  }

  async getTraineeProfile(): Promise<TraineeProfile> {
    return this.request("GET", "/me/trainee-profile", traineeProfileSchema, {
      auth: true,
    });
  }

  async updateTraineeProfile(
    body: UpdateTraineeProfileRequest,
  ): Promise<TraineeProfile> {
    const parsed = updateTraineeProfileRequestSchema.parse(body);
    return this.request("PUT", "/me/trainee-profile", traineeProfileSchema, {
      auth: true,
      body: parsed,
    });
  }

  async listExerciseLibrary(query?: {
    cursor?: string;
    limit?: number;
    q?: string;
    muscleGroup?: string;
    equipment?: string;
    difficulty?: ExerciseDifficulty;
  }): Promise<ExerciseLibraryListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    if (query?.q) params.set("q", query.q);
    if (query?.muscleGroup) params.set("muscleGroup", query.muscleGroup);
    if (query?.equipment) params.set("equipment", query.equipment);
    if (query?.difficulty) params.set("difficulty", query.difficulty);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/libraries/exercises${suffix}`,
      exerciseLibraryListResponseSchema,
      { auth: true },
    );
  }

  async createExerciseLibraryItem(
    body: CreateExerciseLibraryItemRequest,
  ): Promise<ExerciseLibraryItem> {
    const parsed = createExerciseLibraryItemRequestSchema.parse(body);
    return this.request(
      "POST",
      "/libraries/exercises",
      exerciseLibraryItemSchema,
      { auth: true, body: parsed },
    );
  }

  async updateExerciseLibraryItem(
    itemId: string,
    body: UpdateExerciseLibraryItemRequest,
  ): Promise<ExerciseLibraryItem> {
    const parsed = updateExerciseLibraryItemRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/libraries/exercises/${itemId}`,
      exerciseLibraryItemSchema,
      { auth: true, body: parsed },
    );
  }

  async deleteExerciseLibraryItem(itemId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/libraries/exercises/${itemId}`,
      undefined,
      { auth: true },
    );
  }

  async listFoodLibrary(query?: {
    cursor?: string;
    limit?: number;
    q?: string;
  }): Promise<FoodLibraryListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    if (query?.q) params.set("q", query.q);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/libraries/foods${suffix}`,
      foodLibraryListResponseSchema,
      { auth: true },
    );
  }

  async createFoodLibraryItem(
    body: CreateFoodLibraryItemRequest,
  ): Promise<FoodLibraryItem> {
    const parsed = createFoodLibraryItemRequestSchema.parse(body);
    return this.request("POST", "/libraries/foods", foodLibraryItemSchema, {
      auth: true,
      body: parsed,
    });
  }

  async updateFoodLibraryItem(
    itemId: string,
    body: UpdateFoodLibraryItemRequest,
  ): Promise<FoodLibraryItem> {
    const parsed = updateFoodLibraryItemRequestSchema.parse(body);
    return this.request(
      "PUT",
      `/libraries/foods/${itemId}`,
      foodLibraryItemSchema,
      { auth: true, body: parsed },
    );
  }

  async deleteFoodLibraryItem(itemId: string): Promise<void> {
    await this.request("DELETE", `/libraries/foods/${itemId}`, undefined, {
      auth: true,
    });
  }

  async listWorkoutAssignments(
    relationshipId: string,
    query?: { fromDate?: string; toDate?: string },
  ): Promise<WorkoutAssignmentListResponse> {
    const params = new URLSearchParams();
    if (query?.fromDate) params.set("fromDate", query.fromDate);
    if (query?.toDate) params.set("toDate", query.toDate);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/workouts/relationships/${relationshipId}/assignments${suffix}`,
      workoutAssignmentListResponseSchema,
      { auth: true },
    );
  }

  async generateWorkoutAssignments(
    relationshipId: string,
    body: GenerateWorkoutAssignmentsRequest,
    idempotencyKey: string,
  ): Promise<GenerateWorkoutAssignmentsResponse> {
    const parsed = generateWorkoutAssignmentsRequestSchema.parse(body);
    return this.request(
      "POST",
      `/workouts/relationships/${relationshipId}/assignments/generate`,
      generateWorkoutAssignmentsResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getWorkoutAdherence(
    relationshipId: string,
    query?: { fromDate?: string; toDate?: string },
  ): Promise<WorkoutAdherenceResponse> {
    const params = new URLSearchParams();
    if (query?.fromDate) params.set("fromDate", query.fromDate);
    if (query?.toDate) params.set("toDate", query.toDate);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/workouts/relationships/${relationshipId}/adherence${suffix}`,
      workoutAdherenceResponseSchema,
      { auth: true },
    );
  }

  async getWorkoutAssignment(assignmentId: string): Promise<WorkoutAssignment> {
    return this.request(
      "GET",
      `/workouts/assignments/${assignmentId}`,
      workoutAssignmentSchema,
      { auth: true },
    );
  }

  async startWorkout(
    assignmentId: string,
    idempotencyKey: string,
  ): Promise<WorkoutExecution> {
    return this.request(
      "POST",
      `/workouts/assignments/${assignmentId}/start`,
      workoutExecutionSchema,
      { auth: true, body: {}, idempotencyKey },
    );
  }

  async getWorkoutExecution(executionId: string): Promise<WorkoutExecution> {
    return this.request(
      "GET",
      `/workouts/executions/${executionId}`,
      workoutExecutionSchema,
      { auth: true },
    );
  }

  async pauseWorkout(executionId: string): Promise<WorkoutExecution> {
    return this.request(
      "POST",
      `/workouts/executions/${executionId}/pause`,
      workoutExecutionSchema,
      { auth: true, body: {} },
    );
  }

  async resumeWorkout(executionId: string): Promise<WorkoutExecution> {
    return this.request(
      "POST",
      `/workouts/executions/${executionId}/resume`,
      workoutExecutionSchema,
      { auth: true, body: {} },
    );
  }

  async completeWorkoutSet(
    executionId: string,
    setExecutionId: string,
    body: CompleteSetRequest = {},
  ): Promise<WorkoutExecution> {
    const parsed = completeSetRequestSchema.parse(body);
    return this.request(
      "POST",
      `/workouts/executions/${executionId}/sets/${setExecutionId}/complete`,
      workoutExecutionSchema,
      { auth: true, body: parsed },
    );
  }

  async skipWorkoutSet(
    executionId: string,
    setExecutionId: string,
  ): Promise<WorkoutExecution> {
    return this.request(
      "POST",
      `/workouts/executions/${executionId}/sets/${setExecutionId}/skip`,
      workoutExecutionSchema,
      { auth: true, body: {} },
    );
  }

  async completeWorkout(
    executionId: string,
    body: CompleteWorkoutRequest,
    idempotencyKey: string,
  ): Promise<WorkoutExecution> {
    const parsed = completeWorkoutRequestSchema.parse(body);
    return this.request(
      "POST",
      `/workouts/executions/${executionId}/complete`,
      workoutExecutionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async skipWorkoutAssignment(
    assignmentId: string,
    idempotencyKey: string,
  ): Promise<WorkoutExecution> {
    return this.request(
      "POST",
      `/workouts/assignments/${assignmentId}/skip`,
      workoutExecutionSchema,
      { auth: true, body: {}, idempotencyKey },
    );
  }

  async listMealAssignments(
    relationshipId: string,
    query?: { fromDate?: string; toDate?: string },
  ): Promise<MealAssignmentListResponse> {
    const params = new URLSearchParams();
    if (query?.fromDate) params.set("fromDate", query.fromDate);
    if (query?.toDate) params.set("toDate", query.toDate);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/meals/relationships/${relationshipId}/assignments${suffix}`,
      mealAssignmentListResponseSchema,
      { auth: true },
    );
  }

  async generateMealAssignments(
    relationshipId: string,
    body: GenerateMealAssignmentsRequest,
    idempotencyKey: string,
  ): Promise<GenerateMealAssignmentsResponse> {
    const parsed = generateMealAssignmentsRequestSchema.parse(body);
    return this.request(
      "POST",
      `/meals/relationships/${relationshipId}/assignments/generate`,
      generateMealAssignmentsResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getMealCompliance(
    relationshipId: string,
    query?: { fromDate?: string; toDate?: string },
  ): Promise<MealComplianceSummaryResponse> {
    const params = new URLSearchParams();
    if (query?.fromDate) params.set("fromDate", query.fromDate);
    if (query?.toDate) params.set("toDate", query.toDate);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/meals/relationships/${relationshipId}/compliance${suffix}`,
      mealComplianceSummaryResponseSchema,
      { auth: true },
    );
  }

  async getMealAssignment(assignmentId: string): Promise<MealAssignment> {
    return this.request(
      "GET",
      `/meals/assignments/${assignmentId}`,
      mealAssignmentSchema,
      { auth: true },
    );
  }

  async confirmMeal(
    assignmentId: string,
    body: ConfirmMealRequest,
    idempotencyKey: string,
  ): Promise<MealCompliance> {
    const parsed = confirmMealRequestSchema.parse(body);
    return this.request(
      "POST",
      `/meals/assignments/${assignmentId}/confirm`,
      mealComplianceSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async deviateMeal(
    assignmentId: string,
    body: DeviateMealRequest,
    idempotencyKey: string,
  ): Promise<MealCompliance> {
    const parsed = deviateMealRequestSchema.parse(body);
    return this.request(
      "POST",
      `/meals/assignments/${assignmentId}/deviate`,
      mealComplianceSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async skipMeal(
    assignmentId: string,
    body: SkipMealRequest,
    idempotencyKey: string,
  ): Promise<MealCompliance> {
    const parsed = skipMealRequestSchema.parse(body);
    return this.request(
      "POST",
      `/meals/assignments/${assignmentId}/skip`,
      mealComplianceSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listCheckins(
    relationshipId: string,
    query?: {
      fromDate?: string;
      toDate?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<CheckinListResponse> {
    const params = new URLSearchParams();
    if (query?.fromDate) params.set("fromDate", query.fromDate);
    if (query?.toDate) params.set("toDate", query.toDate);
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/checkins/relationships/${relationshipId}${suffix}`,
      checkinListResponseSchema,
      { auth: true },
    );
  }

  async listTrainerCheckinInbox(): Promise<TrainerCheckinInboxResponse> {
    return this.request(
      "GET",
      "/checkins/inbox",
      trainerCheckinInboxResponseSchema,
      { auth: true },
    );
  }

  async scheduleCheckin(
    relationshipId: string,
    body: ScheduleCheckinRequest,
    idempotencyKey: string,
  ): Promise<ScheduleCheckinResponse> {
    const parsed = scheduleCheckinRequestSchema.parse(body);
    return this.request(
      "POST",
      `/checkins/relationships/${relationshipId}/schedule`,
      scheduleCheckinResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async scheduleNextCheckin(
    relationshipId: string,
    body: ScheduleNextCheckinRequest,
    idempotencyKey: string,
  ): Promise<ScheduleCheckinResponse> {
    const parsed = scheduleNextCheckinRequestSchema.parse(body);
    return this.request(
      "POST",
      `/checkins/relationships/${relationshipId}/schedule-next`,
      scheduleCheckinResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async ensureDueCheckin(
    relationshipId: string,
    idempotencyKey: string,
  ): Promise<ScheduleCheckinResponse> {
    return this.request(
      "POST",
      `/checkins/relationships/${relationshipId}/ensure-due`,
      scheduleCheckinResponseSchema,
      { auth: true, body: {}, idempotencyKey },
    );
  }

  async getCheckin(checkinId: string): Promise<Checkin> {
    return this.request("GET", `/checkins/${checkinId}`, checkinSchema, {
      auth: true,
    });
  }

  async saveCheckinDraft(
    checkinId: string,
    body: SaveCheckinDraftRequest,
  ): Promise<Checkin> {
    const parsed = saveCheckinDraftRequestSchema.parse(body);
    return this.request("PUT", `/checkins/${checkinId}/draft`, checkinSchema, {
      auth: true,
      body: parsed,
    });
  }

  async submitCheckin(
    checkinId: string,
    body: SubmitCheckinRequest,
    idempotencyKey: string,
  ): Promise<Checkin> {
    const parsed = submitCheckinRequestSchema.parse(body);
    return this.request(
      "POST",
      `/checkins/${checkinId}/submit`,
      checkinSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getCheckinReviewContext(
    checkinId: string,
  ): Promise<CheckinReviewContext> {
    return this.request(
      "GET",
      `/checkins/${checkinId}/review-context`,
      checkinReviewContextSchema,
      { auth: true },
    );
  }

  async recordCheckinReview(
    checkinId: string,
    body: RecordCheckinReviewRequest,
    idempotencyKey: string,
  ): Promise<Checkin> {
    const parsed = recordCheckinReviewRequestSchema.parse(body);
    return this.request(
      "POST",
      `/checkins/${checkinId}/review`,
      checkinSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listTrainerNotes(
    relationshipId: string,
  ): Promise<TrainerNoteListResponse> {
    return this.request(
      "GET",
      `/checkins/relationships/${relationshipId}/notes`,
      trainerNoteListResponseSchema,
      { auth: true },
    );
  }

  async createTrainerNote(
    relationshipId: string,
    body: CreateTrainerNoteRequest,
    idempotencyKey: string,
  ): Promise<TrainerNote> {
    const parsed = createTrainerNoteRequestSchema.parse(body);
    return this.request(
      "POST",
      `/checkins/relationships/${relationshipId}/notes`,
      trainerNoteSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getAttentionFeed(query?: {
    limit?: number;
  }): Promise<AttentionFeedResponse> {
    const params = new URLSearchParams();
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/exceptions/attention${suffix}`,
      attentionFeedResponseSchema,
      { auth: true },
    );
  }

  async getException(exceptionId: string): Promise<ExceptionDetail> {
    return this.request(
      "GET",
      `/exceptions/${exceptionId}`,
      exceptionDetailSchema,
      { auth: true },
    );
  }

  async acknowledgeException(
    exceptionId: string,
    body: AcknowledgeExceptionRequest,
    idempotencyKey: string,
  ): Promise<Exception> {
    const parsed = acknowledgeExceptionRequestSchema.parse(body);
    return this.request(
      "POST",
      `/exceptions/${exceptionId}/acknowledge`,
      exceptionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async resolveException(
    exceptionId: string,
    body: ResolveExceptionRequest,
    idempotencyKey: string,
  ): Promise<Exception> {
    const parsed = resolveExceptionRequestSchema.parse(body);
    return this.request(
      "POST",
      `/exceptions/${exceptionId}/resolve`,
      exceptionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async evaluateExceptions(
    relationshipId: string,
    idempotencyKey: string,
  ): Promise<EvaluateExceptionsResponse> {
    return this.request(
      "POST",
      `/exceptions/relationships/${relationshipId}/evaluate`,
      evaluateExceptionsResponseSchema,
      { auth: true, body: {}, idempotencyKey },
    );
  }

  async listExceptions(
    relationshipId: string,
    query?: { status?: string },
  ): Promise<ExceptionListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/exceptions/relationships/${relationshipId}${suffix}`,
      exceptionListResponseSchema,
      { auth: true },
    );
  }

  async listInterventions(
    relationshipId: string,
  ): Promise<InterventionListResponse> {
    return this.request(
      "GET",
      `/exceptions/relationships/${relationshipId}/interventions`,
      interventionListResponseSchema,
      { auth: true },
    );
  }

  async createIntervention(
    relationshipId: string,
    body: CreateInterventionRequest,
    idempotencyKey: string,
  ): Promise<Intervention> {
    const parsed = createInterventionRequestSchema.parse(body);
    return this.request(
      "POST",
      `/exceptions/relationships/${relationshipId}/interventions`,
      interventionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async getClientWorkspace(relationshipId: string): Promise<ClientWorkspace> {
    return this.request(
      "GET",
      `/workspaces/relationships/${relationshipId}`,
      clientWorkspaceSchema,
      { auth: true },
    );
  }

  async listWorkspaceActivity(
    relationshipId: string,
    query: {
      type: WorkspaceActivityType;
      state?: string;
      occurredFrom?: string;
      occurredTo?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<WorkspaceActivityListResponse> {
    const params = new URLSearchParams();
    params.set("type", query.type);
    if (query.state) params.set("state", query.state);
    if (query.occurredFrom) params.set("occurredFrom", query.occurredFrom);
    if (query.occurredTo) params.set("occurredTo", query.occurredTo);
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    return this.request(
      "GET",
      `/workspaces/relationships/${relationshipId}/activity?${params.toString()}`,
      workspaceActivityListResponseSchema,
      { auth: true },
    );
  }

  async getProgressSummary(relationshipId: string): Promise<ProgressSummary> {
    return this.request(
      "GET",
      `/progress/relationships/${relationshipId}`,
      progressSummarySchema,
      { auth: true },
    );
  }

  async listHistory(
    relationshipId: string,
    query?: {
      cursor?: string;
      limit?: number;
      kind?: HistoryItemKind;
      occurredFrom?: string;
      occurredTo?: string;
    },
  ): Promise<HistoryListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit != null) params.set("limit", String(query.limit));
    if (query?.kind) params.set("kind", query.kind);
    if (query?.occurredFrom) params.set("occurredFrom", query.occurredFrom);
    if (query?.occurredTo) params.set("occurredTo", query.occurredTo);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/history/relationships/${relationshipId}${suffix}`,
      historyListResponseSchema,
      { auth: true },
    );
  }

  async listMeasurements(
    relationshipId: string,
    query?: { cursor?: string; limit?: number },
  ): Promise<MeasurementListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/progress/relationships/${relationshipId}/measurements${suffix}`,
      measurementListResponseSchema,
      { auth: true },
    );
  }

  async createMeasurement(
    relationshipId: string,
    body: CreateMeasurementRequest,
    idempotencyKey: string,
  ): Promise<Measurement> {
    const parsed = createMeasurementRequestSchema.parse(body);
    return this.request(
      "POST",
      `/progress/relationships/${relationshipId}/measurements`,
      measurementSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async listProgressEntries(
    relationshipId: string,
    query?: { cursor?: string; limit?: number },
  ): Promise<ProgressEntryListResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(
      "GET",
      `/progress/relationships/${relationshipId}/entries${suffix}`,
      progressEntryListResponseSchema,
      { auth: true },
    );
  }

  async createProgressEntry(
    relationshipId: string,
    body: CreateProgressEntryRequest,
    idempotencyKey: string,
  ): Promise<ProgressEntry> {
    const parsed = createProgressEntryRequestSchema.parse(body);
    return this.request(
      "POST",
      `/progress/relationships/${relationshipId}/entries`,
      progressEntrySchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async createUploadTarget(
    body: CreateUploadTargetRequest,
    idempotencyKey: string,
  ): Promise<CreateUploadTargetResponse> {
    const parsed = createUploadTargetRequestSchema.parse(body);
    return this.request(
      "POST",
      "/files/upload-targets",
      createUploadTargetResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  }

  async uploadMediaContent(
    uploadUrlOrMediaAssetId: string,
    body: ArrayBuffer | Uint8Array | Blob,
    contentType: string,
  ): Promise<MediaAsset> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": contentType,
    };
    const usesSignedUrl =
      uploadUrlOrMediaAssetId.includes("exp=") &&
      uploadUrlOrMediaAssetId.includes("sig=");
    if (!usesSignedUrl) {
      const token = this.getAccessToken ? await this.getAccessToken() : null;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const role = this.getSelectedRole ? await this.getSelectedRole() : null;
      if (role) {
        headers["x-fitbud-role"] = role;
      }
    }

    const path = usesSignedUrl
      ? uploadUrlOrMediaAssetId
      : `/files/${uploadUrlOrMediaAssetId}/content`;
    const response = await this.fetchImpl(
      path.startsWith("http") ? path : `${this.baseUrl}${path}`,
      {
        method: "PUT",
        headers,
        body,
        credentials: "include",
      },
    );
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = apiErrorBodySchema.safeParse(json);
      if (parsedError.success) {
        throw new ApiClientError({
          code: parsedError.data.error.code,
          message: parsedError.data.error.message,
          requestId: parsedError.data.error.requestId,
          status: response.status,
          details: parsedError.data.error.details,
        });
      }
      throw new ApiClientError({
        code: "UNKNOWN_ERROR",
        message: `Request failed with status ${response.status}`,
        requestId: "unknown",
        status: response.status,
      });
    }
    const envelope = json as { data: unknown };
    return mediaAssetSchema.parse(envelope.data);
  }

  async getDownloadTarget(
    mediaAssetId: string,
  ): Promise<DownloadTargetResponse> {
    return this.request(
      "GET",
      `/files/${mediaAssetId}/download-target`,
      downloadTargetResponseSchema,
      { auth: true },
    );
  }

  async pushSync(body: SyncPushRequest): Promise<SyncPushResponse> {
    const parsed = syncPushRequestSchema.parse(body);
    return this.request("POST", "/sync/push", syncPushResponseSchema, {
      auth: true,
      body: parsed,
    });
  }

  async pullSync(query?: {
    cursor?: string | null;
    limit?: number;
  }): Promise<SyncPullResponse> {
    const params = new URLSearchParams();
    if (query?.cursor) params.set("cursor", query.cursor);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request("GET", `/sync/pull${suffix}`, syncPullResponseSchema, {
      auth: true,
    });
  }

  async registerDeviceToken(
    body: RegisterDeviceTokenRequest,
  ): Promise<RegisterDeviceTokenResponse> {
    const parsed = registerDeviceTokenRequestSchema.parse(body);
    return this.request(
      "POST",
      "/notifications/device-tokens",
      registerDeviceTokenResponseSchema,
      { auth: true, body: parsed },
    );
  }

  async revokeDeviceToken(input: {
    token?: string;
    deviceTokenId?: string;
    installationId?: string;
  }): Promise<{ revoked: number }> {
    const result = await this.request<{ revoked: number }>(
      "DELETE",
      "/notifications/device-tokens",
      {
        parse: (value: unknown) => {
          const record = value as { revoked?: unknown };
          if (typeof record?.revoked !== "number") {
            throw new Error("Invalid revoke device token response");
          }
          return { revoked: record.revoked };
        },
      },
      { auth: true, body: input },
    );
    return result;
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.request(
      "GET",
      "/notifications/preferences",
      notificationPreferencesSchema,
      { auth: true },
    );
  }

  async updateNotificationPreferences(
    body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferences> {
    const parsed = updateNotificationPreferencesRequestSchema.parse(body);
    return this.request(
      "PUT",
      "/notifications/preferences",
      notificationPreferencesSchema,
      { auth: true, body: parsed },
    );
  }

  async listNotifications(): Promise<NotificationListResponse> {
    return this.request("GET", "/notifications", notificationListResponseSchema, {
      auth: true,
    });
  }

  async evaluateReminders(): Promise<EvaluateRemindersResponse> {
    return this.request(
      "POST",
      "/notifications/reminders/evaluate",
      evaluateRemindersResponseSchema,
      { auth: true },
    );
  }

  /**
   * Fetch authorized realtime subscription metadata.
   * Events are refetch/sync hints — REST and sync remain authoritative.
   */
  async getRealtimeConnection(
    relationshipId: string,
  ): Promise<RealtimeSubscriptionTarget> {
    return this.request(
      "GET",
      `/realtime/relationships/${relationshipId}/connection`,
      realtimeSubscriptionTargetSchema,
      { auth: true },
    );
  }

  /**
   * Build a WebSocket URL for a relationship room.
   * Pass accessToken as query for environments that cannot set WS headers.
   * On message: parse RealtimeEvent and refetch/sync — never treat as state.
   */
  realtimeWebSocketUrl(
    relationshipId: string,
    options?: { accessToken?: string | null; role?: string | null },
  ): string {
    const path = relationshipRealtimePath(relationshipId);
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.accessToken) {
      url.searchParams.set("access_token", options.accessToken);
    }
    if (options?.role) {
      url.searchParams.set("role", options.role);
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  /**
   * Thin WebSocket listener. Calls onEvent with validated envelopes.
   * Caller must refetch/sync authoritative state — events are hints only.
   */
  subscribeRealtime(
    relationshipId: string,
    handlers: {
      onEvent: (event: RealtimeEvent) => void;
      onError?: (error: unknown) => void;
      onClose?: () => void;
      WebSocketImpl?: typeof WebSocket;
    },
  ): { close: () => void } {
    const WebSocketImpl = handlers.WebSocketImpl ?? globalThis.WebSocket;
    if (!WebSocketImpl) {
      handlers.onError?.(new Error("WebSocket is not available in this runtime."));
      return { close: () => undefined };
    }

    let closed = false;
    let socket: WebSocket | null = null;

    void (async () => {
      try {
        const token = this.getAccessToken ? await this.getAccessToken() : null;
        const role = this.getSelectedRole ? await this.getSelectedRole() : null;
        const url = this.realtimeWebSocketUrl(relationshipId, {
          accessToken: token,
          role,
        });
        socket = new WebSocketImpl(url);
        socket.addEventListener("message", (message) => {
          try {
            const data =
              typeof message.data === "string"
                ? JSON.parse(message.data)
                : message.data;
            const event = realtimeEventSchema.parse(data);
            handlers.onEvent(event);
          } catch (error) {
            handlers.onError?.(error);
          }
        });
        socket.addEventListener("error", (error) => {
          handlers.onError?.(error);
        });
        socket.addEventListener("close", () => {
          if (!closed) handlers.onClose?.();
        });
      } catch (error) {
        handlers.onError?.(error);
      }
    })();

    return {
      close: () => {
        closed = true;
        try {
          socket?.close();
        } catch {
          // ignore
        }
      },
    };
  }

  private async request<T>(
    method: string,
    path: string,
    schema: { parse: (value: unknown) => T } | undefined,
    options: {
      auth?: boolean;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.auth) {
      const token = this.getAccessToken ? await this.getAccessToken() : null;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const role = this.getSelectedRole ? await this.getSelectedRole() : null;
      if (role) {
        headers["x-fitbud-role"] = role;
      }
    }

    const idempotencyKey =
      options.idempotencyKey ??
      (this.getIdempotencyKey ? await this.getIdempotencyKey() : null);
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "include",
    });

    const json: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsedError = apiErrorBodySchema.safeParse(json);
      if (parsedError.success) {
        throw new ApiClientError({
          code: parsedError.data.error.code,
          message: parsedError.data.error.message,
          requestId: parsedError.data.error.requestId,
          status: response.status,
          details: parsedError.data.error.details,
        });
      }
      throw new ApiClientError({
        code: "UNKNOWN_ERROR",
        message: `Request failed with status ${response.status}`,
        requestId: "unknown",
        status: response.status,
      });
    }

    if (schema === undefined) {
      return undefined as T;
    }

    const envelope = json as { data?: unknown };
    return schema.parse(envelope.data);
  }
}
