import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    firebaseUid: text("firebase_uid").notNull(),
    accountState: text("account_state", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_firebase_uid_uidx").on(table.firebaseUid)],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["trainer", "trainee"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_roles_user_role_uidx").on(table.userId, table.role),
    index("user_roles_user_idx").on(table.userId),
  ],
);

export const trainerProfiles = sqliteTable(
  "trainer_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    displayName: text("display_name").notNull(),
    whatsappE164: text("whatsapp_e164"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("trainer_profiles_user_uidx").on(table.userId)],
);

export const traineeProfiles = sqliteTable(
  "trainee_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    displayName: text("display_name").notNull(),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("trainee_profiles_user_uidx").on(table.userId)],
);

export const webSessions = sqliteTable(
  "web_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("web_sessions_token_hash_uidx").on(table.tokenHash),
    index("web_sessions_user_idx").on(table.userId),
  ],
);

/** Prevents duplicate side effects for retryable mutations. */
export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    operation: text("operation").notNull(),
    keyHash: text("key_hash").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: text("response_body").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_actor_op_key_uidx").on(
      table.actorUserId,
      table.operation,
      table.keyHash,
    ),
  ],
);

export const clientInvitations = sqliteTable(
  "client_invitations",
  {
    id: text("id").primaryKey(),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    recipientEmail: text("recipient_email").notNull(),
    recipientDisplayName: text("recipient_display_name"),
    recipientWhatsappE164: text("recipient_whatsapp_e164"),
    tokenHash: text("token_hash").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "expired", "revoked"],
    })
      .notNull()
      .default("pending"),
    expiresAt: text("expires_at").notNull(),
    acceptedUserId: text("accepted_user_id").references(() => users.id),
    onboardingFormTemplateVersionId: text("onboarding_form_template_version_id")
      .notNull()
      .references(() => onboardingFormVersions.id),
    reissuedFromId: text("reissued_from_id"),
    revokedAt: text("revoked_at"),
    emailSentAt: text("email_sent_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("client_invitations_token_hash_uidx").on(table.tokenHash),
    index("client_invitations_trainer_idx").on(table.trainerUserId),
    index("client_invitations_trainer_email_idx").on(
      table.trainerUserId,
      table.recipientEmail,
    ),
    index("client_invitations_form_version_idx").on(
      table.onboardingFormTemplateVersionId,
    ),
  ],
);

export const coachingRelationships = sqliteTable(
  "coaching_relationships",
  {
    id: text("id").primaryKey(),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: ["active", "ended"],
    })
      .notNull()
      .default("active"),
    invitationId: text("invitation_id").references(() => clientInvitations.id),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    endedByUserId: text("ended_by_user_id").references(() => users.id),
    endReason: text("end_reason"),
    reactivatedAt: text("reactivated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("coaching_relationships_trainer_trainee_uidx").on(
      table.trainerUserId,
      table.traineeUserId,
    ),
    index("coaching_relationships_trainer_idx").on(table.trainerUserId),
    index("coaching_relationships_trainee_idx").on(table.traineeUserId),
  ],
);

/** Parent of immutable onboarding form versions. Global rows have no trainer. */
export const onboardingFormTemplates = sqliteTable(
  "onboarding_form_templates",
  {
    id: text("id").primaryKey(),
    ownership: text("ownership", { enum: ["global", "trainer"] }).notNull(),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("onboarding_form_templates_ownership_idx").on(
      table.ownership,
      table.trainerUserId,
    ),
  ],
);

export const onboardingFormVersions = sqliteTable(
  "onboarding_form_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => onboardingFormTemplates.id),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    scope: text("scope", { enum: ["global", "trainer"] })
      .notNull()
      .default("global"),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    schemaJson: text("schema_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_form_versions_template_version_uidx").on(
      table.templateId,
      table.version,
    ),
    uniqueIndex("onboarding_form_versions_global_key_version_uidx")
      .on(table.key, table.version)
      .where(sql`${table.scope} = 'global'`),
    uniqueIndex("onboarding_form_versions_trainer_key_version_uidx")
      .on(table.trainerUserId, table.key, table.version)
      .where(sql`${table.scope} = 'trainer'`),
  ],
);

export const onboardingFormResponses = sqliteTable(
  "onboarding_form_responses",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    onboardingFormVersionId: text("onboarding_form_version_id")
      .notNull()
      .references(() => onboardingFormVersions.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    answersJson: text("answers_json").notNull().default("{}"),
    version: integer("version").notNull().default(0),
    submittedAt: text("submitted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_form_responses_relationship_uidx").on(
      table.coachingRelationshipId,
    ),
    index("onboarding_form_responses_trainee_idx").on(table.traineeUserId),
  ],
);

export const onboardingReviews = sqliteTable(
  "onboarding_reviews",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    onboardingFormResponseId: text("onboarding_form_response_id")
      .notNull()
      .references(() => onboardingFormResponses.id),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    outcome: text("outcome", { enum: ["coaching_ready"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("onboarding_reviews_response_uidx").on(
      table.onboardingFormResponseId,
    ),
    index("onboarding_reviews_relationship_idx").on(table.coachingRelationshipId),
  ],
);

export const coachingConfigurations = sqliteTable(
  "coaching_configurations",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    status: text("status", {
      enum: ["draft", "configured", "active", "superseded"],
    })
      .notNull()
      .default("draft"),
    versionNumber: integer("version_number").notNull().default(1),
    recordVersion: integer("record_version").notNull().default(0),
    goalShort: text("goal_short"),
    goalDescription: text("goal_description"),
    notes: text("notes"),
    configuredAt: text("configured_at"),
    activatedAt: text("activated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("coaching_configurations_relationship_version_uidx").on(
      table.coachingRelationshipId,
      table.versionNumber,
    ),
    uniqueIndex("coaching_configurations_one_active_uidx")
      .on(table.coachingRelationshipId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("coaching_configurations_one_open_uidx")
      .on(table.coachingRelationshipId)
      .where(sql`${table.status} in ('draft', 'configured')`),
    index("coaching_configurations_status_idx").on(table.status),
  ],
);

/** Append-only subscription revisions for one coaching relationship. */
export const subscriptionVersions = sqliteTable(
  "subscription_versions",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    versionNumber: integer("version_number").notNull(),
    planName: text("plan_name").notNull(),
    paymentFrequency: text("payment_frequency", {
      enum: ["weekly", "monthly", "quarterly", "yearly"],
    }).notNull(),
    startsOn: text("starts_on").notNull(),
    renewsOn: text("renews_on").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("subscription_versions_relationship_version_uidx").on(
      table.coachingRelationshipId,
      table.versionNumber,
    ),
    index("subscription_versions_relationship_idx").on(
      table.coachingRelationshipId,
    ),
  ],
);

export const workoutExpectations = sqliteTable(
  "workout_expectations",
  {
    id: text("id").primaryKey(),
    coachingConfigurationId: text("coaching_configuration_id")
      .notNull()
      .references(() => coachingConfigurations.id),
    sessionsPerWeek: integer("sessions_per_week").notNull(),
    completionWindowHours: integer("completion_window_hours").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workout_expectations_configuration_uidx").on(
      table.coachingConfigurationId,
    ),
  ],
);

export const nutritionExpectations = sqliteTable(
  "nutrition_expectations",
  {
    id: text("id").primaryKey(),
    coachingConfigurationId: text("coaching_configuration_id")
      .notNull()
      .references(() => coachingConfigurations.id),
    mealsPerDay: integer("meals_per_day").notNull(),
    confirmationWindowHours: integer("confirmation_window_hours").notNull(),
    photoRequirement: text("photo_requirement", {
      enum: ["none", "selected_meals", "all_meals"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("nutrition_expectations_configuration_uidx").on(
      table.coachingConfigurationId,
    ),
  ],
);

export const checkinSchedules = sqliteTable(
  "checkin_schedules",
  {
    id: text("id").primaryKey(),
    coachingConfigurationId: text("coaching_configuration_id")
      .notNull()
      .references(() => coachingConfigurations.id),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    cadence: text("cadence", {
      enum: ["weekly", "biweekly", "monthly"],
    }).notNull(),
    dueWindowHours: integer("due_window_hours").notNull(),
    preferredCheckinFormVersionId: text("preferred_checkin_form_version_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("checkin_schedules_configuration_uidx").on(
      table.coachingConfigurationId,
    ),
    index("checkin_schedules_relationship_idx").on(table.coachingRelationshipId),
  ],
);

export const trackingRequirements = sqliteTable(
  "tracking_requirements",
  {
    id: text("id").primaryKey(),
    coachingConfigurationId: text("coaching_configuration_id")
      .notNull()
      .references(() => coachingConfigurations.id),
    requireBodyWeight: integer("require_body_weight", { mode: "boolean" })
      .notNull()
      .default(false),
    requireProgressPhotos: integer("require_progress_photos", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    requireSessionRpe: integer("require_session_rpe", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("tracking_requirements_configuration_uidx").on(
      table.coachingConfigurationId,
    ),
  ],
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("plans_relationship_idx").on(table.coachingRelationshipId),
  ],
);

export const planVersions = sqliteTable(
  "plan_versions",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    versionNumber: integer("version_number").notNull(),
    status: text("status", {
      enum: ["draft", "published", "scheduled", "effective", "superseded"],
    })
      .notNull()
      .default("draft"),
    recordVersion: integer("record_version").notNull().default(0),
    contentJson: text("content_json").notNull(),
    creationSource: text("creation_source", {
      enum: ["blank", "previous_version", "template", "adjustment"],
    })
      .notNull()
      .default("blank"),
    /** Provenance only. Not a live join back to plan_templates. */
    sourceTemplateId: text("source_template_id"),
    publishedAt: text("published_at"),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("plan_versions_plan_version_number_uidx").on(
      table.planId,
      table.versionNumber,
    ),
    index("plan_versions_plan_status_idx").on(table.planId, table.status),
    index("plan_versions_status_effective_idx").on(
      table.status,
      table.effectiveFrom,
    ),
  ],
);

/** Diet-adjustment scope and consistency acknowledgement for one plan version. */
export const planAssignmentPolicies = sqliteTable("plan_assignment_policies", {
  planVersionId: text("plan_version_id")
    .primaryKey()
    .references(() => planVersions.id),
  dietAdjustmentScope: text("diet_adjustment_scope", {
    enum: ["today_onward", "today_only"],
  }),
  dietScopeLocalDate: text("diet_scope_local_date"),
  futureMealPlanVersionId: text("future_meal_plan_version_id").references(
    () => planVersions.id,
  ),
  consistencyAckFingerprint: text("consistency_ack_fingerprint"),
});

export const workoutAssignments = sqliteTable(
  "workout_assignments",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    planVersionId: text("plan_version_id")
      .notNull()
      .references(() => planVersions.id),
    workoutDayId: text("workout_day_id").notNull(),
    workoutDayName: text("workout_day_name").notNull(),
    workoutDayJson: text("workout_day_json").notNull(),
    localDate: text("local_date").notNull(),
    windowStartsAt: text("window_starts_at").notNull(),
    windowEndsAt: text("window_ends_at").notNull(),
    scheduleStatus: text("schedule_status", {
      enum: ["scheduled", "superseded"],
    })
      .notNull()
      .default("scheduled"),
    supersededAt: text("superseded_at"),
    supersededByPlanVersionId: text("superseded_by_plan_version_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workout_assignments_rel_version_day_date_uidx").on(
      table.coachingRelationshipId,
      table.planVersionId,
      table.workoutDayId,
      table.localDate,
    ),
    index("workout_assignments_relationship_date_idx").on(
      table.coachingRelationshipId,
      table.localDate,
    ),
    index("workout_assignments_window_ends_idx").on(table.windowEndsAt),
  ],
);

export const workoutExecutions = sqliteTable(
  "workout_executions",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => workoutAssignments.id),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    planVersionId: text("plan_version_id")
      .notNull()
      .references(() => planVersions.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: ["started", "paused", "completed", "modified", "skipped"],
    }).notNull(),
    recordVersion: integer("record_version").notNull().default(0),
    startedAt: text("started_at").notNull(),
    pausedAt: text("paused_at"),
    completedAt: text("completed_at"),
    sessionRpe: integer("session_rpe"),
    requireSessionRpe: integer("require_session_rpe", { mode: "boolean" })
      .notNull()
      .default(false),
    loggedLate: integer("logged_late", { mode: "boolean" }).notNull().default(false),
    clientLoggedAt: text("client_logged_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workout_executions_assignment_uidx").on(table.assignmentId),
    index("workout_executions_relationship_idx").on(
      table.coachingRelationshipId,
    ),
    index("workout_executions_relationship_completed_idx").on(
      table.coachingRelationshipId,
      table.completedAt,
    ),
    index("workout_executions_trainee_idx").on(table.traineeUserId),
  ],
);

export const exerciseExecutions = sqliteTable(
  "exercise_executions",
  {
    id: text("id").primaryKey(),
    workoutExecutionId: text("workout_execution_id")
      .notNull()
      .references(() => workoutExecutions.id),
    exerciseId: text("exercise_id").notNull(),
    name: text("name").notNull(),
    order: integer("order").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "skipped"],
    })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("exercise_executions_workout_idx").on(table.workoutExecutionId),
  ],
);

export const setExecutions = sqliteTable(
  "set_executions",
  {
    id: text("id").primaryKey(),
    exerciseExecutionId: text("exercise_execution_id")
      .notNull()
      .references(() => exerciseExecutions.id),
    setTargetId: text("set_target_id").notNull(),
    order: integer("order").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "modified", "skipped"],
    })
      .notNull()
      .default("pending"),
    prescribedReps: integer("prescribed_reps"),
    prescribedLoadLabel: text("prescribed_load_label"),
    actualReps: integer("actual_reps"),
    actualLoadLabel: text("actual_load_label"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("set_executions_exercise_idx").on(table.exerciseExecutionId),
  ],
);

export const mealAssignments = sqliteTable(
  "meal_assignments",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    planVersionId: text("plan_version_id")
      .notNull()
      .references(() => planVersions.id),
    mealPrescriptionId: text("meal_prescription_id").notNull(),
    mealName: text("meal_name").notNull(),
    mealPrescriptionJson: text("meal_prescription_json").notNull(),
    localDate: text("local_date").notNull(),
    windowStartsAt: text("window_starts_at").notNull(),
    windowEndsAt: text("window_ends_at").notNull(),
    photoRequired: integer("photo_required", { mode: "boolean" })
      .notNull()
      .default(false),
    scheduleStatus: text("schedule_status", {
      enum: ["scheduled", "superseded"],
    })
      .notNull()
      .default("scheduled"),
    supersededAt: text("superseded_at"),
    supersededByPlanVersionId: text("superseded_by_plan_version_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("meal_assignments_rel_version_meal_date_uidx").on(
      table.coachingRelationshipId,
      table.planVersionId,
      table.mealPrescriptionId,
      table.localDate,
    ),
    index("meal_assignments_relationship_date_idx").on(
      table.coachingRelationshipId,
      table.localDate,
    ),
    index("meal_assignments_window_ends_idx").on(table.windowEndsAt),
  ],
);

export const mealCompliance = sqliteTable(
  "meal_compliance",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => mealAssignments.id),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    planVersionId: text("plan_version_id")
      .notNull()
      .references(() => planVersions.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    outcome: text("outcome", {
      enum: ["confirmed", "modified", "skipped"],
    }).notNull(),
    recordVersion: integer("record_version").notNull().default(0),
    loggedAt: text("logged_at").notNull(),
    deviationKind: text("deviation_kind", {
      enum: [
        "portion_adjustment",
        "substitute",
        "restaurant",
        "repeat_recent",
        "manual",
        "other",
        "logged_foods",
      ],
    }),
    notes: text("notes"),
    photoRequired: integer("photo_required", { mode: "boolean" })
      .notNull()
      .default(false),
    photoIntentJson: text("photo_intent_json"),
    mediaAssetId: text("media_asset_id"),
    itemsJson: text("items_json"),
    kcalScaled: integer("kcal_scaled"),
    proteinScaled: integer("protein_scaled"),
    carbsScaled: integer("carbs_scaled"),
    fatScaled: integer("fat_scaled"),
    loggedLate: integer("logged_late", { mode: "boolean" }).notNull().default(false),
    loggedAfterResolve: integer("logged_after_resolve", { mode: "boolean" })
      .notNull()
      .default(false),
    clientLoggedAt: text("client_logged_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("meal_compliance_assignment_uidx").on(table.assignmentId),
    index("meal_compliance_relationship_idx").on(table.coachingRelationshipId),
    index("meal_compliance_relationship_logged_idx").on(
      table.coachingRelationshipId,
      table.loggedAt,
    ),
    index("meal_compliance_trainee_idx").on(table.traineeUserId),
  ],
);

/** Parent of immutable check-in form versions. Separate from onboarding forms. */
export const checkinFormTemplates = sqliteTable(
  "checkin_form_templates",
  {
    id: text("id").primaryKey(),
    ownership: text("ownership", { enum: ["global", "trainer"] }).notNull(),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("checkin_form_templates_ownership_idx").on(
      table.ownership,
      table.trainerUserId,
    ),
  ],
);

export const checkinFormVersions = sqliteTable(
  "checkin_form_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => checkinFormTemplates.id),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    scope: text("scope", { enum: ["global", "trainer"] })
      .notNull()
      .default("global"),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    schemaJson: text("schema_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("checkin_form_versions_template_version_uidx").on(
      table.templateId,
      table.version,
    ),
    uniqueIndex("checkin_form_versions_global_key_version_uidx")
      .on(table.key, table.version)
      .where(sql`${table.scope} = 'global'`),
    uniqueIndex("checkin_form_versions_trainer_key_version_uidx")
      .on(table.trainerUserId, table.key, table.version)
      .where(sql`${table.scope} = 'trainer'`),
  ],
);

export const checkins = sqliteTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    checkinScheduleId: text("checkin_schedule_id").references(
      () => checkinSchedules.id,
    ),
    localDate: text("local_date").notNull(),
    windowStartsAt: text("window_starts_at").notNull(),
    windowEndsAt: text("window_ends_at").notNull(),
    recordStatus: text("record_status", {
      enum: ["draft", "submitted"],
    })
      .notNull()
      .default("draft"),
    recordVersion: integer("record_version").notNull().default(0),
    definitionVersion: integer("definition_version").notNull().default(1),
    checkinFormVersionId: text("checkin_form_version_id")
      .notNull()
      .references(() => checkinFormVersions.id),
    answersJson: text("answers_json"),
    submittedAt: text("submitted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("checkins_relationship_local_date_uidx").on(
      table.coachingRelationshipId,
      table.localDate,
    ),
    index("checkins_form_version_idx").on(table.checkinFormVersionId),
    index("checkins_relationship_window_idx").on(
      table.coachingRelationshipId,
      table.windowEndsAt,
    ),
    index("checkins_relationship_submitted_idx").on(
      table.coachingRelationshipId,
      table.submittedAt,
    ),
    index("checkins_record_status_idx").on(table.recordStatus),
  ],
);

export const checkinReviews = sqliteTable(
  "checkin_reviews",
  {
    id: text("id").primaryKey(),
    checkinId: text("checkin_id")
      .notNull()
      .references(() => checkins.id),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    outcome: text("outcome", {
      enum: ["acknowledged", "needs_follow_up", "adjust_coaching"],
    }).notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("checkin_reviews_checkin_uidx").on(table.checkinId),
    index("checkin_reviews_relationship_idx").on(table.coachingRelationshipId),
  ],
);

export const trainerNotes = sqliteTable(
  "trainer_notes",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    checkinId: text("checkin_id").references(() => checkins.id),
    body: text("body").notNull(),
    visibility: text("visibility", { enum: ["private", "client"] })
      .notNull()
      .default("private"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    sharedAt: text("shared_at"),
    unsharedAt: text("unshared_at"),
    seenAt: text("seen_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("trainer_notes_relationship_idx").on(
      table.coachingRelationshipId,
      table.createdAt,
    ),
    index("trainer_notes_checkin_idx").on(table.checkinId),
  ],
);

export const exceptions = sqliteTable(
  "exceptions",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    type: text("type", {
      enum: [
        "missed_workout",
        "skipped_workout",
        "overdue_meal",
        "skipped_meal",
        "meal_deviation",
        "meal_logged_later",
        "overdue_checkin",
      ],
    }).notNull(),
    severity: text("severity", {
      enum: ["critical", "attention"],
    }).notNull(),
    status: text("status", {
      enum: ["detected", "active", "acknowledged", "resolved"],
    }).notNull(),
    ruleVersion: text("rule_version").notNull(),
    sourceEntityType: text("source_entity_type", {
      enum: ["workout_assignment", "meal_assignment", "checkin"],
    }).notNull(),
    sourceEntityId: text("source_entity_id").notNull(),
    summary: text("summary").notNull(),
    detailsJson: text("details_json"),
    detectedAt: text("detected_at").notNull(),
    activatedAt: text("activated_at"),
    acknowledgedAt: text("acknowledged_at"),
    resolvedAt: text("resolved_at"),
    resolutionOutcome: text("resolution_outcome"),
    resolutionNote: text("resolution_note"),
    closedReason: text("closed_reason"),
    sourceLoggedLateAt: text("source_logged_late_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("exceptions_relationship_status_detected_idx").on(
      table.coachingRelationshipId,
      table.status,
      table.detectedAt,
    ),
    index("exceptions_status_detected_idx").on(table.status, table.detectedAt),
    index("exceptions_source_idx").on(
      table.sourceEntityType,
      table.sourceEntityId,
      table.type,
    ),
  ],
);

export const exceptionActions = sqliteTable(
  "exception_actions",
  {
    id: text("id").primaryKey(),
    exceptionId: text("exception_id")
      .notNull()
      .references(() => exceptions.id),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action", {
      enum: ["acknowledge", "resolve"],
    }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("exception_actions_exception_idx").on(table.exceptionId)],
);

export const interventions = sqliteTable(
  "interventions",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    trainerUserId: text("trainer_user_id")
      .notNull()
      .references(() => users.id),
    exceptionId: text("exception_id").references(() => exceptions.id),
    checkinId: text("checkin_id").references(() => checkins.id),
    kind: text("kind", {
      enum: [
        "note",
        "acknowledge",
        "resolve",
        "plan_adjustment",
        "schedule_checkin",
      ],
    }).notNull(),
    summary: text("summary").notNull(),
    resultingPlanVersionId: text("resulting_plan_version_id").references(
      () => planVersions.id,
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("interventions_relationship_idx").on(
      table.coachingRelationshipId,
      table.createdAt,
    ),
    index("interventions_exception_idx").on(table.exceptionId),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    uploaderUserId: text("uploader_user_id")
      .notNull()
      .references(() => users.id),
    mediaType: text("media_type", {
      enum: ["progress_photo", "meal_photo", "checkin_photo", "avatar"],
    }).notNull(),
    status: text("status", {
      enum: ["pending_upload", "ready", "failed"],
    }).notNull(),
    /** Internal R2 object key — never treat as authorization or return as permission. */
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size"),
    originalFilename: text("original_filename"),
    domainEntityType: text("domain_entity_type", {
      enum: ["meal_compliance", "progress_entry", "measurement", "checkin"],
    }),
    domainEntityId: text("domain_entity_id"),
    recordVersion: integer("record_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    uploadedAt: text("uploaded_at"),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_uidx").on(table.objectKey),
    index("media_assets_relationship_idx").on(
      table.coachingRelationshipId,
      table.createdAt,
    ),
    index("media_assets_status_idx").on(table.status),
    index("media_assets_domain_idx").on(
      table.domainEntityType,
      table.domainEntityId,
    ),
  ],
);

export const measurements = sqliteTable(
  "measurements",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: ["body_weight_kg", "waist_cm", "hip_cm", "chest_cm", "other"],
    }).notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    observedAt: text("observed_at").notNull(),
    source: text("source", {
      enum: ["trainee_entry", "checkin", "trainer_entry"],
    }).notNull(),
    checkinId: text("checkin_id").references(() => checkins.id),
    mediaAssetId: text("media_asset_id").references(() => mediaAssets.id),
    recordVersion: integer("record_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("measurements_relationship_observed_idx").on(
      table.coachingRelationshipId,
      table.observedAt,
    ),
    index("measurements_trainee_idx").on(table.traineeUserId),
    index("measurements_checkin_idx").on(table.checkinId),
  ],
);

export const progressEntries = sqliteTable(
  "progress_entries",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    entryType: text("entry_type", {
      enum: ["progress_photo", "note", "milestone"],
    }).notNull(),
    title: text("title"),
    body: text("body"),
    observedAt: text("observed_at").notNull(),
    mediaAssetId: text("media_asset_id").references(() => mediaAssets.id),
    recordVersion: integer("record_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("progress_entries_relationship_observed_idx").on(
      table.coachingRelationshipId,
      table.observedAt,
    ),
    index("progress_entries_trainee_idx").on(table.traineeUserId),
  ],
);

/**
 * Incremental authorized sync sequence for trainee offline pull.
 * Payloads stay in domain tables; this log carries identifiers and versions.
 */
export const changeLog = sqliteTable(
  "change_log",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    entityType: text("entity_type", {
      enum: [
        "effective_plan",
        "workout_assignment",
        "workout_execution",
        "meal_assignment",
        "meal_compliance",
        "checkin",
        "measurement",
      ],
    }).notNull(),
    recordId: text("record_id").notNull(),
    changeKind: text("change_kind", {
      enum: ["upsert", "tombstone"],
    }).notNull(),
    serverVersion: integer("server_version"),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => users.id),
    changedAt: text("changed_at").notNull(),
  },
  (table) => [
    uniqueIndex("change_log_sequence_uidx").on(table.sequence),
    index("change_log_trainee_seq_idx").on(table.traineeUserId, table.sequence),
    index("change_log_relationship_seq_idx").on(
      table.coachingRelationshipId,
      table.sequence,
    ),
  ],
);

/** Tracks accepted mobile sync mutation identifiers for safe retries. */
export const syncMutations = sqliteTable(
  "sync_mutations",
  {
    id: text("id").primaryKey(),
    mutationId: text("mutation_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    operation: text("operation").notNull(),
    entityType: text("entity_type").notNull(),
    recordId: text("record_id"),
    resultStatus: text("result_status", {
      enum: ["applied", "already_applied", "rejected", "conflicted"],
    }).notNull(),
    serverVersion: integer("server_version"),
    resultBody: text("result_body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sync_mutations_actor_mutation_uidx").on(
      table.actorUserId,
      table.mutationId,
    ),
    uniqueIndex("sync_mutations_actor_idempotency_uidx").on(
      table.actorUserId,
      table.idempotencyKey,
    ),
    index("sync_mutations_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

/** Push-delivery registrations. Tokens are revocable and deduplicated. */
export const deviceTokens = sqliteTable(
  "device_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    platform: text("platform", { enum: ["ios", "android", "web"] }).notNull(),
    provider: text("provider", { enum: ["fcm"] }).notNull(),
    token: text("token").notNull(),
    installationId: text("installation_id").notNull(),
    status: text("status", { enum: ["active", "revoked"] }).notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("device_tokens_token_uidx").on(table.token),
    uniqueIndex("device_tokens_user_installation_uidx").on(
      table.userId,
      table.installationId,
    ),
    index("device_tokens_user_status_idx").on(table.userId, table.status),
  ],
);

/** Per-user notification channel and category preferences. */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id),
    pushEnabled: integer("push_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    workoutReminder: integer("workout_reminder", { mode: "boolean" })
      .notNull()
      .default(true),
    mealReminder: integer("meal_reminder", { mode: "boolean" })
      .notNull()
      .default(true),
    checkinReminder: integer("checkin_reminder", { mode: "boolean" })
      .notNull()
      .default(true),
    subscriptionRenewalReminder: integer("subscription_renewal_reminder", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    dailySummaryReminder: integer("daily_summary_reminder", { mode: "boolean" })
      .notNull()
      .default(true),
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    channelPreference: text("channel_preference").notNull().default("app"),
    whatsappOptInGranted: integer("whatsapp_opt_in_granted", { mode: "boolean" })
      .notNull()
      .default(false),
    whatsappOptInAt: text("whatsapp_opt_in_at"),
    whatsappOptInSource: text("whatsapp_opt_in_source"),
    whatsappOptInTextVersion: text("whatsapp_opt_in_text_version"),
    preferredWorkoutTime: text("preferred_workout_time"),
    locale: text("locale"),
    trainerCategoriesJson: text("trainer_categories_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

/** Supported reminder behavior for a coaching relationship. */
export const reminderRules = sqliteTable(
  "reminder_rules",
  {
    id: text("id").primaryKey(),
    coachingRelationshipId: text("coaching_relationship_id")
      .notNull()
      .references(() => coachingRelationships.id),
    reminderType: text("reminder_type", {
      enum: [
        "workout_reminder",
        "meal_reminder",
        "checkin_reminder",
        "subscription_renewal_reminder",
      ],
    }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("reminder_rules_relationship_type_uidx").on(
      table.coachingRelationshipId,
      table.reminderType,
    ),
    index("reminder_rules_relationship_idx").on(table.coachingRelationshipId),
  ],
);

/**
 * In-product notification intent. Deduplication key prevents duplicate
 * user-visible reminders for the same occurrence across cron/queue retries.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => users.id),
    coachingRelationshipId: text("coaching_relationship_id").references(
      () => coachingRelationships.id,
    ),
    notificationType: text("notification_type", {
      enum: [
        "workout_reminder",
        "meal_reminder",
        "checkin_reminder",
        "subscription_renewal_reminder",
        "daily_summary",
        "activity_nudge",
        "plan_published",
        "checkin_reviewed",
        "coach_answered",
        "reminders_paused",
        "relationship_ended",
        "trainer_note_shared",
        "reactivation_requested",
        "trainer_ask_coach",
        "trainer_checkin_submitted",
        "trainer_intake_submitted",
        "trainer_critical_digest",
        "trainer_renewal",
        "trainer_meal_times_changed",
        "admin_whatsapp_budget",
      ],
    }).notNull(),
    domainEntityType: text("domain_entity_type", {
      enum: [
        "workout_assignment",
        "meal_assignment",
        "checkin",
        "coaching_relationship",
      ],
    }).notNull(),
    domainEntityId: text("domain_entity_id").notNull(),
    state: text("state", {
      enum: [
        "pending",
        "queued",
        "delivered",
        "read",
        "failed",
        "suppressed",
        "deferred",
      ],
    }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
    openedAt: text("opened_at"),
    priority: integer("priority"),
    mergeGroup: text("merge_group"),
    payloadJson: text("payload_json"),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_uidx").on(table.dedupeKey),
    index("notifications_relationship_created_idx").on(
      table.coachingRelationshipId,
      table.createdAt,
    ),
    index("notifications_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    index("notifications_recipient_state_idx").on(
      table.recipientUserId,
      table.state,
    ),
  ],
);

/**
 * Channel delivery attempts. Provider acceptance is recorded here and is
 * never treated as workflow/domain completion.
 */
export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id),
    deviceTokenId: text("device_token_id").references(() => deviceTokens.id),
    channel: text("channel", { enum: ["push"] }).notNull(),
    providerStatus: text("provider_status", {
      enum: ["queued", "accepted", "failed", "skipped"],
    }).notNull(),
    providerMessageId: text("provider_message_id"),
    failureCategory: text("failure_category"),
    attemptNumber: integer("attempt_number").notNull(),
    acceptedAt: text("accepted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("notification_deliveries_notification_idx").on(table.notificationId),
    index("notification_deliveries_provider_status_idx").on(
      table.providerStatus,
    ),
  ],
);


/** Idempotent asynchronous work metadata (queue remains infrastructure). */
export const scheduledJobs = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    jobType: text("job_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    dueAt: text("due_at").notNull(),
    state: text("state", {
      enum: ["pending", "processing", "completed", "failed"],
    }).notNull(),
    domainEntityType: text("domain_entity_type"),
    domainEntityId: text("domain_entity_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCategory: text("last_error_category"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("scheduled_jobs_dedupe_key_uidx").on(table.dedupeKey),
    index("scheduled_jobs_due_state_idx").on(table.dueAt, table.state),
  ],
);

/**
 * Reusable plan structures. Global rows are read-only bases with no trainer.
 * Copying into a client plan stores provenance on the plan version and never
 * aliases live client state. Trainer rows stay editable in place.
 */
export const planTemplates = sqliteTable(
  "plan_templates",
  {
    id: text("id").primaryKey(),
    ownership: text("ownership", {
      enum: ["global", "trainer"],
    }).notNull(),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    title: text("title").notNull(),
    templateType: text("template_type", {
      enum: ["workout", "nutrition", "combined"],
    }).notNull(),
    contentJson: text("content_json").notNull(),
    recordVersion: integer("record_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("plan_templates_ownership_idx").on(
      table.ownership,
      table.trainerUserId,
    ),
    index("plan_templates_trainer_idx").on(table.trainerUserId),
    index("plan_templates_trainer_updated_idx").on(
      table.trainerUserId,
      table.updatedAt,
    ),
    check(
      "plan_templates_ownership_chk",
      sql`(${table.ownership} = 'global' AND ${table.trainerUserId} IS NULL) OR (${table.ownership} = 'trainer' AND ${table.trainerUserId} IS NOT NULL)`,
    ),
  ],
);

/**
 * Exercise identity and coaching metadata. Prescription targets live on the
 * plan or template snapshot, not on this row.
 */

export const librarySources = sqliteTable("library_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  url: text("url").notNull(),
  licence: text("licence").notNull(),
  licenceUrl: text("licence_url"),
  attribution: text("attribution").notNull(),
  checksumSha256: text("checksum_sha256"),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull(),
});

export const librarySeedVersions = sqliteTable("library_seed_versions", {
  id: text("id").primaryKey(),
  version: text("version").notNull().unique(),
  contentSha256: text("content_sha256").notNull(),
  foodCount: integer("food_count").notNull(),
  exerciseCount: integer("exercise_count").notNull(),
  templateCount: integer("template_count").notNull(),
  appliedAt: text("applied_at").notNull(),
  notes: text("notes"),
});

export const libraryIdRedirects = sqliteTable("library_id_redirects", {
  oldId: text("old_id").primaryKey(),
  entity: text("entity", {
    enum: ["food", "exercise", "food_serving"],
  }).notNull(),
  newId: text("new_id").notNull(),
  reason: text("reason").notNull(),
  seedVersion: text("seed_version").notNull(),
});

export const nutrients = sqliteTable("nutrients", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit", { enum: ["kcal", "g", "mg", "ug"] }).notNull(),
  category: text("category").notNull(),
  isCore: integer("is_core", { mode: "boolean" }).notNull().default(false),
  usdaNutrientIds: text("usda_nutrient_ids"),
  sortOrder: integer("sort_order").notNull(),
});

export const servingUnits = sqliteTable("serving_units", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["mass", "volume", "household", "count"],
  }).notNull(),
  typicalGramsScaled: integer("typical_grams_scaled"),
  notes: text("notes"),
});

export const muscles = sqliteTable("muscles", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const equipment = sqliteTable("equipment", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  homeFriendly: integer("home_friendly", { mode: "boolean" })
    .notNull()
    .default(false),
  sortOrder: integer("sort_order").notNull(),
});

export const movementPatterns = sqliteTable("movement_patterns", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const exerciseCategories = sqliteTable("exercise_categories", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const loggingTypes = sqliteTable("logging_types", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  fieldsJson: text("fields_json").notNull(),
});

export const exerciseLibraryItems = sqliteTable(
  "exercise_library_items",
  {
    id: text("id").primaryKey(),
    ownership: text("ownership", {
      enum: ["global", "trainer"],
    }).notNull(),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    name: text("name").notNull(),
    instructions: text("instructions"),
    primaryMusclesJson: text("primary_muscles_json").notNull().default("[]"),
    secondaryMusclesJson: text("secondary_muscles_json")
      .notNull()
      .default("[]"),
    equipmentJson: text("equipment_json").notNull().default("[]"),
    difficulty: text("difficulty", {
      enum: ["beginner", "intermediate", "advanced"],
    }),
    status: text("status", {
      enum: ["active", "archived"],
    })
      .notNull()
      .default("active"),
    slug: text("slug"),
    categoryCode: text("category_code").references(() => exerciseCategories.code),
    movementPatternCode: text("movement_pattern_code").references(
      () => movementPatterns.code,
    ),
    loggingTypeCode: text("logging_type_code").references(
      () => loggingTypes.code,
    ),
    setting: text("setting"),
    mechanic: text("mechanic"),
    force: text("force"),
    laterality: text("laterality"),
    safetyNote: text("safety_note"),
    sourceId: text("source_id").references(() => librarySources.id),
    sourceRef: text("source_ref"),
    sourceName: text("source_name"),
    reviewStatus: text("review_status"),
    seedVersion: text("seed_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("exercise_library_ownership_idx").on(table.ownership),
    index("exercise_library_trainer_idx").on(table.trainerUserId),
    index("exercise_library_status_idx").on(table.status),
    uniqueIndex("exercise_library_global_slug_uidx")
      .on(table.slug)
      .where(sql`${table.ownership} = 'global'`),
    index("exercise_library_pattern_idx").on(
      table.movementPatternCode,
      table.setting,
    ),
  ],
);

/**
 * Food identity. Canonical nutrients are scaled integers on an explicit basis.
 * Servings are separate rows. Plan snapshots do not join back to this table.
 */
export const foodLibraryItems = sqliteTable(
  "food_library_items",
  {
    id: text("id").primaryKey(),
    ownership: text("ownership", {
      enum: ["global", "trainer"],
    }).notNull(),
    trainerUserId: text("trainer_user_id").references(() => users.id),
    name: text("name").notNull(),
    cuisineRegion: text("cuisine_region", {
      enum: ["indian", "indian_pantry", "global"],
    }).notNull(),
    classification: text("classification", {
      enum: [
        "raw_ingredient",
        "generic_food",
        "prepared_food",
        "branded_product",
      ],
    }),
    nutritionBasis: text("nutrition_basis", {
      enum: ["per_100_g", "per_100_ml"],
    }),
    energyKcalScaled: integer("energy_kcal_scaled"),
    proteinScaled: integer("protein_grams_scaled"),
    carbsScaled: integer("carbs_grams_scaled"),
    fatScaled: integer("fat_grams_scaled"),
    notes: text("notes"),
    description: text("description"),
    status: text("status", {
      enum: ["active", "archived"],
    })
      .notNull()
      .default("active"),
    slug: text("slug"),
    foodType: text("food_type"),
    foodGroup: text("food_group"),
    dishCategory: text("dish_category"),
    cuisine: text("cuisine", {
      enum: ["indian", "indian_pantry", "global"],
    }),
    region: text("region"),
    cookingState: text("cooking_state"),
    cookingMethod: text("cooking_method"),
    dietTagsJson: text("diet_tags_json").notNull().default("[]"),
    mealTypesJson: text("meal_types_json").notNull().default("[]"),
    carbsAvailableScaled: integer("carbs_available_grams_scaled"),
    fibreScaled: integer("fibre_grams_scaled"),
    sugarsScaled: integer("sugars_grams_scaled"),
    satFatScaled: integer("sat_fat_grams_scaled"),
    sodiumMgScaled: integer("sodium_mg_scaled"),
    sourceId: text("source_id").references(() => librarySources.id),
    sourceRef: text("source_ref"),
    sourceName: text("source_name"),
    defaultServingId: text("default_serving_id"),
    reviewStatus: text("review_status"),
    seedVersion: text("seed_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("food_library_ownership_idx").on(table.ownership),
    index("food_library_cuisine_idx").on(table.cuisineRegion),
    index("food_library_trainer_idx").on(table.trainerUserId),
    index("food_library_status_idx").on(table.status),
    uniqueIndex("food_library_global_slug_uidx")
      .on(table.slug)
      .where(sql`${table.ownership} = 'global'`),
    index("food_library_group_idx").on(table.foodGroup, table.dishCategory),
    index("food_library_source_idx").on(table.sourceId, table.sourceRef),
  ],
);

/** Food-specific household or measured servings. Conversion is not universal. */
export const foodLibraryServings = sqliteTable(
  "food_library_servings",
  {
    id: text("id").primaryKey(),
    foodLibraryItemId: text("food_library_item_id")
      .notNull()
      .references(() => foodLibraryItems.id),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    conversionScaled: integer("conversion_scaled"),
    quantityScaled: integer("quantity_scaled").notNull().default(1_000_000),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    provenance: text("provenance"),
    plausible: integer("plausible", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    seedVersion: text("seed_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("food_library_servings_food_idx").on(table.foodLibraryItemId),
  ],
);

export const foodLibraryNutrients = sqliteTable(
  "food_library_nutrients",
  {
    foodLibraryItemId: text("food_library_item_id")
      .notNull()
      .references(() => foodLibraryItems.id, { onDelete: "cascade" }),
    nutrientCode: text("nutrient_code")
      .notNull()
      .references(() => nutrients.code),
    amountScaled: integer("amount_scaled").notNull(),
    provenance: text("provenance").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.foodLibraryItemId, table.nutrientCode] }),
  ],
);

export const foodLibraryAliases = sqliteTable(
  "food_library_aliases",
  {
    id: text("id").primaryKey(),
    foodLibraryItemId: text("food_library_item_id")
      .notNull()
      .references(() => foodLibraryItems.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    aliasNorm: text("alias_norm").notNull(),
    lang: text("lang").notNull(),
    provenance: text("provenance").notNull(),
    confidence: text("confidence", {
      enum: ["high", "medium", "low"],
    }).notNull(),
    seedVersion: text("seed_version"),
  },
  (table) => [
    uniqueIndex("food_library_aliases_uidx").on(
      table.foodLibraryItemId,
      table.lang,
      table.aliasNorm,
    ),
    index("food_library_aliases_norm_idx").on(table.aliasNorm),
  ],
);

export const foodLibraryRecipeIngredients = sqliteTable(
  "food_library_recipe_ingredients",
  {
    id: text("id").primaryKey(),
    foodLibraryItemId: text("food_library_item_id")
      .notNull()
      .references(() => foodLibraryItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    ingredientName: text("ingredient_name").notNull(),
    sourceIngredientName: text("source_ingredient_name"),
    amountScaled: integer("amount_scaled"),
    unit: text("unit"),
    sourceFoodCode: text("source_food_code"),
    ingredientFoodId: text("ingredient_food_id").references(
      () => foodLibraryItems.id,
    ),
  },
  (table) => [
    uniqueIndex("food_library_recipe_ingredients_pos_uidx").on(
      table.foodLibraryItemId,
      table.position,
    ),
  ],
);

const exerciseLibraryItemFk = () =>
  text("exercise_library_item_id")
    .notNull()
    .references(() => exerciseLibraryItems.id, { onDelete: "cascade" });

export const exerciseLibraryMuscles = sqliteTable(
  "exercise_library_muscles",
  {
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    muscleCode: text("muscle_code")
      .notNull()
      .references(() => muscles.code),
    role: text("role", { enum: ["primary", "secondary"] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseLibraryItemId, table.muscleCode] }),
    index("exercise_library_muscles_muscle_idx").on(table.muscleCode, table.role),
  ],
);

export const exerciseLibraryEquipment = sqliteTable(
  "exercise_library_equipment",
  {
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    equipmentCode: text("equipment_code")
      .notNull()
      .references(() => equipment.code),
  },
  (table) => [
    primaryKey({
      columns: [table.exerciseLibraryItemId, table.equipmentCode],
    }),
  ],
);

export const exerciseLibraryAliases = sqliteTable(
  "exercise_library_aliases",
  {
    id: text("id").primaryKey(),
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    alias: text("alias").notNull(),
    aliasNorm: text("alias_norm").notNull(),
    lang: text("lang").notNull(),
    provenance: text("provenance").notNull(),
    confidence: text("confidence", {
      enum: ["high", "medium", "low"],
    }).notNull(),
    seedVersion: text("seed_version"),
  },
  (table) => [
    uniqueIndex("exercise_library_aliases_uidx").on(
      table.exerciseLibraryItemId,
      table.lang,
      table.aliasNorm,
    ),
  ],
);

export const exerciseLibraryInstructions = sqliteTable(
  "exercise_library_instructions",
  {
    id: text("id").primaryKey(),
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    kind: text("kind", { enum: ["step", "cue", "mistake"] }).notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    lang: text("lang").notNull().default("en"),
    provenance: text("provenance").notNull(),
  },
  (table) => [
    uniqueIndex("exercise_library_instructions_uidx").on(
      table.exerciseLibraryItemId,
      table.kind,
      table.lang,
      table.position,
    ),
  ],
);

export const exerciseLibraryRelations = sqliteTable(
  "exercise_library_relations",
  {
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    relatedExerciseId: text("related_exercise_id")
      .notNull()
      .references(() => exerciseLibraryItems.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "alternative",
        "home_alternative",
        "gym_alternative",
        "progression",
        "regression",
      ],
    }).notNull(),
    method: text("method").notNull(),
    confidence: text("confidence").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.exerciseLibraryItemId, table.relatedExerciseId, table.kind],
    }),
  ],
);

export const exerciseLibraryMedia = sqliteTable(
  "exercise_library_media",
  {
    id: text("id").primaryKey(),
    exerciseLibraryItemId: exerciseLibraryItemFk(),
    kind: text("kind", { enum: ["illustration", "photo", "video"] }).notNull(),
    frame: text("frame"),
    storageKey: text("storage_key").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => librarySources.id),
    sourceRef: text("source_ref"),
    licence: text("licence").notNull(),
    attribution: text("attribution").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("exercise_library_media_ex_idx").on(
      table.exerciseLibraryItemId,
      table.sortOrder,
    ),
  ],
);

export const userIdentities = sqliteTable("user_identities", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  emailNorm: text("email_norm").unique(),
  mobileE164: text("mobile_e164").unique(),
  passwordHash: text("password_hash"),
  passwordUpdatedAt: text("password_updated_at"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authOtps = sqliteTable("auth_otps", {
  id: text("id").primaryKey(),
  identifierHash: text("identifier_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose", {
    enum: ["login", "reset", "invite"],
  }).notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  channelsSent: text("channels_sent").notNull().default("[]"),
  consumedAt: text("consumed_at"),
  invalidatedAt: text("invalidated_at"),
  createdAt: text("created_at").notNull(),
  ipHash: text("ip_hash"),
});

export const authRateLimits = sqliteTable("auth_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStart: text("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const devMailOutbox = sqliteTable("dev_mail_outbox", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body"),
  createdAt: text("created_at").notNull(),
});

export const reactivationRequests = sqliteTable("reactivation_requests", {
  id: text("id").primaryKey(),
  relationshipId: text("relationship_id")
    .notNull()
    .references(() => coachingRelationships.id, { onDelete: "cascade" }),
  trainerUserId: text("trainer_user_id")
    .notNull()
    .references(() => users.id),
  status: text("status", {
    enum: ["pending", "confirmed", "cancelled", "expired"],
  }).notNull(),
  intakeUpdateRequested: integer("intake_update_requested", { mode: "boolean" })
    .notNull()
    .default(false),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const coachAsks = sqliteTable("coach_asks", {
  id: text("id").primaryKey(),
  relationshipId: text("relationship_id")
    .notNull()
    .references(() => coachingRelationships.id, { onDelete: "cascade" }),
  traineeUserId: text("trainee_user_id")
    .notNull()
    .references(() => users.id),
  itemType: text("item_type", {
    enum: [
      "meal_assignment",
      "workout_assignment",
      "exercise_execution",
      "checkin",
      "plan_version",
    ],
  }).notNull(),
  itemId: text("item_id").notNull(),
  topic: text("topic").notNull(),
  askedAt: text("asked_at").notNull(),
  lastAskedAt: text("last_asked_at").notNull(),
  askCount: integer("ask_count").notNull().default(1),
  status: text("status", {
    enum: ["open", "answered", "expired"],
  }).notNull(),
  answeredAt: text("answered_at"),
  answeredBy: text("answered_by").references(() => users.id),
  trainerNoteId: text("trainer_note_id").references(() => trainerNotes.id),
});

export const mealTimeOverrides = sqliteTable(
  "meal_time_overrides",
  {
    relationshipId: text("relationship_id")
      .notNull()
      .references(() => coachingRelationships.id, { onDelete: "cascade" }),
    slotKey: text("slot_key").notNull(),
    dayPattern: text("day_pattern", {
      enum: ["all", "weekdays", "weekends"],
    }).notNull(),
    time: text("time").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.relationshipId, table.slotKey, table.dayPattern],
    }),
  ],
);

export const traineeCustomFoods = sqliteTable("trainee_custom_foods", {
  id: text("id").primaryKey(),
  traineeUserId: text("trainee_user_id")
    .notNull()
    .references(() => users.id),
  relationshipId: text("relationship_id")
    .notNull()
    .references(() => coachingRelationships.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kcalScaled: integer("kcal_scaled").notNull(),
  proteinScaled: integer("protein_scaled"),
  carbsScaled: integer("carbs_scaled"),
  fatScaled: integer("fat_scaled"),
  servingLabel: text("serving_label").notNull(),
  createdAt: text("created_at").notNull(),
});

export const reminderStates = sqliteTable("reminder_states", {
  traineeUserId: text("trainee_user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  consecutiveIgnores: integer("consecutive_ignores").notNull().default(0),
  mode: text("mode").notNull().default("normal"),
  pausedUntil: text("paused_until"),
  lastEvaluatedAt: text("last_evaluated_at"),
  updatedAt: text("updated_at").notNull(),
});

export const whatsappTemplates = sqliteTable("whatsapp_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  language: text("language").notNull().default("en"),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  bodyJson: text("body_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const whatsappMessages = sqliteTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  templateKey: text("template_key").notNull(),
  toHash: text("to_hash").notNull(),
  wamid: text("wamid"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  relationshipId: text("relationship_id").references(() => coachingRelationships.id),
  traineeUserId: text("trainee_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const whatsappLedger = sqliteTable("whatsapp_ledger", {
  id: text("id").primaryKey(),
  monthKey: text("month_key").notNull(),
  templateKey: text("template_key").notNull(),
  messageId: text("message_id").references(() => whatsappMessages.id),
  estCostPaise: integer("est_cost_paise").notNull(),
  costPaise: integer("cost_paise"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const whatsappWebhookEvents = sqliteTable("whatsapp_webhook_events", {
  id: text("id").primaryKey(),
  receivedAt: text("received_at").notNull(),
  kind: text("kind").notNull(),
});

export const whatsappOptOuts = sqliteTable("whatsapp_opt_outs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  at: text("at").notNull(),
  source: text("source").notNull(),
});
