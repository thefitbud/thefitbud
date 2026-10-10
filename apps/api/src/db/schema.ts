import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workout_executions_assignment_uidx").on(table.assignmentId),
    index("workout_executions_relationship_idx").on(
      table.coachingRelationshipId,
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
      ],
    }),
    notes: text("notes"),
    photoRequired: integer("photo_required", { mode: "boolean" })
      .notNull()
      .default(false),
    photoIntentJson: text("photo_intent_json"),
    mediaAssetId: text("media_asset_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("meal_compliance_assignment_uidx").on(table.assignmentId),
    index("meal_compliance_relationship_idx").on(table.coachingRelationshipId),
    index("meal_compliance_trainee_idx").on(table.traineeUserId),
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
    index("checkins_relationship_window_idx").on(
      table.coachingRelationshipId,
      table.windowEndsAt,
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
      enum: ["missed_workout", "overdue_meal", "overdue_checkin"],
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("exceptions_relationship_status_idx").on(
      table.coachingRelationshipId,
      table.status,
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
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
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
      enum: ["pending", "queued", "delivered", "read", "failed", "suppressed"],
    }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_uidx").on(table.dedupeKey),
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
    secondaryMusclesJson: text("secondary_muscles_json").notNull().default("[]"),
    equipmentJson: text("equipment_json").notNull().default("[]"),
    difficulty: text("difficulty", {
      enum: ["beginner", "intermediate", "advanced"],
    }),
    status: text("status", {
      enum: ["active", "archived"],
    })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("exercise_library_ownership_idx").on(table.ownership),
    index("exercise_library_trainer_idx").on(table.trainerUserId),
    index("exercise_library_status_idx").on(table.status),
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
      enum: ["indian"],
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("food_library_ownership_idx").on(table.ownership),
    index("food_library_cuisine_idx").on(table.cuisineRegion),
    index("food_library_trainer_idx").on(table.trainerUserId),
    index("food_library_status_idx").on(table.status),
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
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("food_library_servings_food_idx").on(table.foodLibraryItemId),
  ],
);
