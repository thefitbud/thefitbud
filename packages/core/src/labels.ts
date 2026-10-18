/**
 * Human-readable labels for every API enum the UI renders.
 * Sentence case. Never replace('_',' ') in components — use these maps.
 */

const LABELS = {
  // Adherence / lifecycle
  adherence_state: {
    on_track: "On track",
    needs_attention: "Needs attention",
    no_recent_data: "No recent data",
    not_available: "Not available",
  },
  onboarding_status: {
    invited: "Invited",
    onboarding_pending: "Onboarding",
    onboarding_submitted: "Awaiting review",
    coaching_ready: "Ready to coach",
    active: "Active",
    ended: "Ended",
  },
  relationship_status: {
    active: "Active",
    ended: "Ended",
  },
  invitation_status: {
    pending: "Pending",
    accepted: "Accepted",
    expired: "Expired",
    revoked: "Revoked",
  },

  // Exceptions
  exception_type: {
    missed_workout: "Missed workout",
    skipped_workout: "Skipped workout",
    overdue_meal: "Overdue meal",
    skipped_meal: "Skipped meal",
    meal_deviation: "Meal change",
    meal_logged_later: "Logged later",
    overdue_checkin: "Overdue check-in",
  },
  exception_severity: {
    critical: "Critical",
    attention: "Attention",
  },
  exception_status: {
    detected: "Detected",
    active: "Open",
    acknowledged: "Acknowledged",
    resolved: "Resolved",
  },
  exception_source: {
    workout_assignment: "Workout",
    meal_assignment: "Meal",
    checkin: "Check-in",
  },
  exception_action: {
    acknowledge: "Acknowledge",
    resolve: "Resolve",
  },
  intervention_kind: {
    note: "Note",
    acknowledge: "Acknowledge",
    resolve: "Resolve",
    plan_adjustment: "Plan adjustment",
    schedule_checkin: "Schedule check-in",
  },
  resolve_outcome: {
    talked: "Talked",
    plan_adjusted: "Plan adjusted",
    no_action: "No action",
    other: "Other",
    client_logged_later: "Client logged later",
  },

  // Check-ins
  checkin_status: {
    scheduled: "Scheduled",
    due: "Due",
    submitted: "Submitted",
    reviewed: "Reviewed",
    overdue: "Overdue",
  },
  checkin_record_status: {
    draft: "Draft",
    submitted: "Submitted",
  },
  checkin_review_outcome: {
    acknowledged: "Acknowledged",
    needs_follow_up: "Needs follow-up",
    adjust_coaching: "Adjust coaching",
  },

  // Meals / workouts
  meal_assignment_status: {
    pending: "Pending",
    confirmed: "Confirmed",
    modified: "Modified",
    skipped: "Skipped",
    logged_later: "Logged later",
    overdue: "Overdue",
  },
  meal_compliance_outcome: {
    confirmed: "Confirmed",
    modified: "Modified",
    skipped: "Skipped",
  },
  meal_deviation_kind: {
    portion_adjustment: "Portion adjustment",
    substitute: "Substitute",
    restaurant: "Restaurant",
    repeat_recent: "Repeat recent",
    manual: "Manual",
    other: "Other",
    logged_foods: "Logged foods",
  },
  workout_assignment_status: {
    assigned: "Assigned",
    in_progress: "In progress",
    paused: "Paused",
    completed: "Completed",
    modified: "Modified",
    skipped: "Skipped",
    missed: "Missed",
  },
  workout_execution_status: {
    started: "Started",
    paused: "Paused",
    completed: "Completed",
    modified: "Modified",
    skipped: "Skipped",
  },
  set_execution_status: {
    pending: "Pending",
    completed: "Completed",
    modified: "Modified",
    skipped: "Skipped",
  },
  exercise_execution_status: {
    pending: "Pending",
    completed: "Completed",
    skipped: "Skipped",
  },

  // Coach asks / topics (common)
  coach_ask_status: {
    open: "Open",
    answered: "Answered",
    expired: "Expired",
  },
  coach_ask_item_type: {
    meal_assignment: "Meal",
    workout_assignment: "Workout",
    exercise_execution: "Exercise",
    checkin: "Check-in",
    plan_version: "Plan",
  },
  coach_ask_topic: {
    portion_size: "Portion size",
    substitute: "Substitute",
    timing: "Timing",
    form: "Form",
    pain: "Pain",
    other: "Other",
    hunger: "Hunger",
    fullness: "Fullness",
    ingredients: "Ingredients",
    schedule: "Schedule",
  },

  // History
  history_kind: {
    onboarding_submitted: "Onboarding submitted",
    onboarding_reviewed: "Onboarding reviewed",
    configuration_activated: "Configuration activated",
    subscription_revision: "Subscription revision",
    plan_version: "Plan version",
    workout_execution: "Workout",
    meal_compliance: "Meal log",
    checkin_submitted: "Check-in submitted",
    checkin_reviewed: "Check-in reviewed",
    measurement: "Measurement",
    progress_entry: "Progress entry",
    progress_photo: "Progress photo",
    exception: "Needs attention",
    trainer_note: "Trainer note",
    intervention: "Intervention",
    meal_times_changed: "Meal times changed",
  },

  // Body / muscles (library + common UI)
  body_part: {
    upper_back: "Upper back",
    lower_back: "Lower back",
    chest: "Chest",
    shoulders: "Shoulders",
    arms: "Arms",
    biceps: "Biceps",
    triceps: "Triceps",
    core: "Core",
    abs: "Abs",
    glutes: "Glutes",
    quads: "Quads",
    hamstrings: "Hamstrings",
    calves: "Calves",
    full_body: "Full body",
    legs: "Legs",
    back: "Back",
  },

  // Progress / measurements
  measurement_type: {
    body_weight_kg: "Body weight",
    waist_cm: "Waist",
    hip_cm: "Hip",
    chest_cm: "Chest",
    other: "Other",
  },
  measurement_source: {
    trainee_entry: "Client entry",
    checkin: "Check-in",
    trainer_entry: "Trainer entry",
  },
  progress_entry_type: {
    progress_photo: "Progress photo",
    note: "Note",
    milestone: "Milestone",
  },
  media_type: {
    progress_photo: "Progress photo",
    meal_photo: "Meal photo",
    checkin_photo: "Check-in photo",
    avatar: "Avatar",
  },
  media_asset_status: {
    pending_upload: "Uploading",
    ready: "Ready",
    failed: "Failed",
  },

  // Plans / templates / config
  plan_version_status: {
    draft: "Draft",
    scheduled: "Scheduled",
    published: "Published",
    superseded: "Superseded",
    archived: "Archived",
  },
  plan_template_type: {
    workout: "Workout",
    nutrition: "Diet",
    combined: "Full plan",
  },
  meal_type: {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    other: "Other",
  },
  diet_change_scope: {
    today_onward: "Today onward",
    today_only: "Today only",
  },
  assignment_window_mode: {
    next_7_days: "Next 7 days",
    next_calendar_week: "Next calendar week",
    custom: "Custom dates",
  },
  assignment_schedule_status: {
    scheduled: "Scheduled",
    superseded: "Superseded",
    cancelled: "Cancelled",
  },
  coaching_configuration_status: {
    draft: "Draft",
    configured: "Configured",
    active: "Active",
    superseded: "Superseded",
  },
  meal_photo_requirement: {
    none: "Never",
    selected_meals: "Selected meals",
    all_meals: "All meals",
  },
  checkin_cadence: {
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    monthly: "Monthly",
  },
  payment_frequency: {
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
  },
  nutrition_basis: {
    per_100_g: "Per 100 g",
    per_100_ml: "Per 100 ml",
  },
  workspace_activity_type: {
    workout: "Workout",
    meal: "Meal",
    checkin: "Check-in",
  },
  onboarding_review_outcome: {
    coaching_ready: "Coaching ready",
  },
  trainer_note_visibility: {
    private: "Private",
    client: "Visible to client",
  },

  // Notifications
  notification_type: {
    workout_reminder: "Workout reminder",
    meal_reminder: "Meal reminder",
    checkin_reminder: "Check-in reminder",
    subscription_renewal_reminder: "Renewal reminder",
    daily_summary: "Daily summary",
    activity_nudge: "Nudge",
    plan_published: "Plan published",
    checkin_reviewed: "Check-in reviewed",
    coach_answered: "Coach answered",
    reminders_paused: "Reminders paused",
    relationship_ended: "Coaching ended",
    trainer_note_shared: "Note from coach",
    reactivation_requested: "Reactivation requested",
    trainer_ask_coach: "Asked coach",
    trainer_checkin_submitted: "Check-in submitted",
    trainer_intake_submitted: "Intake submitted",
    trainer_critical_digest: "Critical digest",
    trainer_renewal: "Renewal",
    trainer_meal_times_changed: "Meal times changed",
    admin_whatsapp_budget: "WhatsApp budget",
  },
  reminder_type: {
    workout_reminder: "Workout reminder",
    meal_reminder: "Meal reminder",
    checkin_reminder: "Check-in reminder",
    subscription_renewal_reminder: "Renewal reminder",
  },
  channel_preference: {
    app: "App",
    app_and_whatsapp: "App and WhatsApp",
  },
  notification_state: {
    pending: "Pending",
    delivered: "Delivered",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  responsiveness_label: {
    responsive: "Responsive",
    inconsistent: "Inconsistent",
    ignoring: "Ignoring",
    unknown: "Unknown",
  },

  // Roles / misc
  role: {
    trainer: "Trainer",
    trainee: "Client",
  },
  week_day_state: {
    done: "Done",
    partial: "Partial",
    missed: "Missed",
    rest: "Rest",
    future: "Upcoming",
    empty: "Empty",
  },
  food_classification: {
    veg: "Veg",
    non_veg: "Non-veg",
    egg: "Egg",
    vegan: "Vegan",
    unknown: "Unknown",
  },
  exercise_difficulty: {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  },
  library_item_status: {
    active: "Active",
    archived: "Archived",
  },
  renewal_state: {
    upcoming: "Upcoming",
    due: "Due",
    expired: "Expired",
  },
} as const;

export type LabelNamespace = keyof typeof LABELS;

type NamespaceLabels<N extends LabelNamespace> = (typeof LABELS)[N];

/** Look up a label for a known enum namespace. Falls back to sentence case. */
export function labelFor<N extends LabelNamespace>(
  namespace: N,
  value: string | null | undefined,
): string {
  if (value == null || value === "") return "";
  const map = LABELS[namespace] as Record<string, string>;
  const known = map[value];
  if (known) return known;
  return sentenceCaseEnum(value);
}

/** Generic enum → sentence-case label (underscores → spaces, first letter capped). */
export function sentenceCaseEnum(value: string): string {
  const cleaned = value.replace(/_/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Resolve a label from any known namespace that contains the value.
 * Prefer `labelFor(namespace, value)` when the namespace is known.
 */
export function enumLabel(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  for (const namespace of Object.keys(LABELS) as LabelNamespace[]) {
    const map = LABELS[namespace] as Record<string, string>;
    if (map[value]) return map[value];
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.warn(`[labels] unknown enum value: ${value}`);
  }
  return sentenceCaseEnum(value);
}

/** Every known label entry — used by unit tests for coverage. */
export function allLabelEntries(): Array<{
  namespace: LabelNamespace;
  value: string;
  label: string;
}> {
  const entries: Array<{
    namespace: LabelNamespace;
    value: string;
    label: string;
  }> = [];
  for (const namespace of Object.keys(LABELS) as LabelNamespace[]) {
    const map = LABELS[namespace] as NamespaceLabels<typeof namespace>;
    for (const [value, label] of Object.entries(map)) {
      entries.push({ namespace, value, label });
    }
  }
  return entries;
}

export { LABELS };
