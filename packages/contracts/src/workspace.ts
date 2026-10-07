import { z } from "zod";
import { checkinSchema, checkinStatusSchema } from "./checkin.js";
import { coachingConfigurationSchema } from "./configuration.js";
import { activeExceptionSummarySchema } from "./exception.js";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import { mealAssignmentStatusSchema } from "./meal.js";
import { effectivePlanResponseSchema } from "./plan.js";
import { progressSummarySchema } from "./progress.js";
import { onboardingStatusSchema } from "./relationship.js";
import { renewalStateSchema, subscriptionSchema } from "./subscription.js";
import { localDateSchema, workoutAssignmentStatusSchema } from "./workout.js";

export const workspaceActivityTypeSchema = z.enum(["workout", "meal", "checkin"]);
export type WorkspaceActivityType = z.infer<typeof workspaceActivityTypeSchema>;

const activityIdentitySchema = {
  id: uuidSchema,
  occurredAt: isoDateTimeSchema,
  localDate: localDateSchema,
  title: z.string().min(1).max(200),
};

/**
 * One workout, meal, or check-in row.
 * `planVersionId` is the version stored on that execution or assignment.
 */
export const workspaceActivityItemSchema = z.discriminatedUnion("type", [
  z.object({
    ...activityIdentitySchema,
    type: z.literal("workout"),
    state: workoutAssignmentStatusSchema,
    planVersionId: uuidSchema,
  }),
  z.object({
    ...activityIdentitySchema,
    type: z.literal("meal"),
    state: mealAssignmentStatusSchema,
    planVersionId: uuidSchema,
  }),
  z.object({
    ...activityIdentitySchema,
    type: z.literal("checkin"),
    state: checkinStatusSchema,
    planVersionId: z.null(),
  }),
]);
export type WorkspaceActivityItem = z.infer<typeof workspaceActivityItemSchema>;

export const workspaceActivityListResponseSchema = cursorPageSchema(
  workspaceActivityItemSchema,
);
export type WorkspaceActivityListResponse = z.infer<
  typeof workspaceActivityListResponseSchema
>;

export const workspaceActivityQuerySchema = z
  .object({
    type: workspaceActivityTypeSchema,
    state: z.string().min(1).optional(),
    occurredFrom: localDateSchema.optional(),
    occurredTo: localDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.state) return;
    const allowed =
      value.type === "workout"
        ? workoutAssignmentStatusSchema
        : value.type === "meal"
          ? mealAssignmentStatusSchema
          : checkinStatusSchema;
    if (!allowed.safeParse(value.state).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "State does not belong to the requested activity type.",
      });
    }
  });
export type WorkspaceActivityQuery = z.infer<typeof workspaceActivityQuerySchema>;

export const workspaceEffectivePlanSummarySchema = z.object({
  id: uuidSchema,
  title: z.string().min(1).max(160),
  effectiveFrom: isoDateTimeSchema.nullable(),
});
export type WorkspaceEffectivePlanSummary = z.infer<
  typeof workspaceEffectivePlanSummarySchema
>;

export const workspaceHeaderSchema = z.object({
  relationshipId: uuidSchema,
  traineeDisplayName: z.string().min(1).max(120),
  onboardingStatus: onboardingStatusSchema,
  effectivePlan: workspaceEffectivePlanSummarySchema.nullable(),
  primaryGoal: z.string().max(500).nullable(),
  renewalState: renewalStateSchema.nullable(),
});
export type WorkspaceHeader = z.infer<typeof workspaceHeaderSchema>;

export const workspaceOverviewSchema = z.object({
  openException: activeExceptionSummarySchema.nullable(),
  nextCheckin: checkinSchema.nullable(),
  recentActivity: z.array(workspaceActivityItemSchema).max(5),
  progress: progressSummarySchema,
});
export type WorkspaceOverview = z.infer<typeof workspaceOverviewSchema>;

export const workspaceConfigurationSectionSchema = z.object({
  configuration: coachingConfigurationSchema.nullable(),
  subscription: subscriptionSchema.nullable(),
});
export type WorkspaceConfigurationSection = z.infer<
  typeof workspaceConfigurationSectionSchema
>;

export const clientWorkspaceSchema = z.object({
  header: workspaceHeaderSchema,
  overview: workspaceOverviewSchema,
  plan: effectivePlanResponseSchema,
  configuration: workspaceConfigurationSectionSchema,
  history: z.object({
    relationshipId: uuidSchema,
  }),
});
export type ClientWorkspace = z.infer<typeof clientWorkspaceSchema>;
