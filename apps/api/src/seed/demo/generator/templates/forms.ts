/**
 * Trainer-owned onboarding and check-in forms (SEED_DESIGN.md §5.4, §5.5).
 * Versions are insert-only in the schema, so every version is its own row.
 */
import type {
  CheckinFieldDefinition,
  OnboardingFieldDefinition,
} from "@fitbud/contracts";

const opt = (id: string, label: string) => ({ id, label });

const GOAL_OPTIONS = [
  opt("fat_loss", "Lose fat"),
  opt("muscle_gain", "Build muscle"),
  opt("strength", "Get stronger"),
  opt("health", "Health markers (sugar, BP, PCOS)"),
  opt("performance", "Sport / test prep"),
  opt("consistency", "Build a routine"),
];

function of1Fields(version: 1 | 2): OnboardingFieldDefinition[] {
  const about = "About you";
  const health = "Health";
  const training = "Training";
  const food = "Food";
  const life = "Lifestyle";
  const fields: OnboardingFieldDefinition[] = [
    { id: "primary_goal", type: "single_choice", label: "What's the main goal for the next 3 months?", required: true, section: about, options: GOAL_OPTIONS },
    { id: "goal_detail", type: "long_text", label: "Tell me in your own words what success looks like", required: true, section: about, maxLength: 1000 },
    { id: "height_cm", type: "number", label: "Height", required: true, section: about, unit: "cm" },
    { id: "weight_kg", type: "number", label: "Current weight", required: true, section: about, unit: "kg" },
    { id: "occupation_schedule", type: "short_text", label: "Work hours and shift pattern", required: true, section: about },
    {
      id: "medical_conditions", type: "multiple_choice", label: "Any medical conditions?", required: true, section: health, highlight: true,
      options: [opt("none", "None"), opt("thyroid", "Thyroid"), opt("pcos", "PCOS/PCOD"), opt("diabetes", "Diabetes / prediabetes"), opt("bp", "High BP"), opt("asthma", "Asthma"), opt("other", "Other")],
    },
    { id: "medications", type: "short_text", label: "Medicines or supplements you take", required: false, section: health, highlight: true },
    { id: "injuries", type: "long_text", label: "Injuries or pain (knee, back, shoulder…)", required: false, section: health, highlight: true },
  ];
  if (version === 2) {
    fields.push({ id: "cycle_regular", type: "single_choice", label: "Are your periods regular? (skip if not applicable)", required: false, section: health, options: [opt("yes", "Yes"), opt("no", "No"), opt("na", "Not applicable")] });
  }
  fields.push(
    { id: "experience", type: "single_choice", label: "Training experience", required: true, section: training, options: [opt("none", "Never trained"), opt("lt1", "< 1 year"), opt("y1_3", "1–3 years"), opt("gt3", "3+ years")] },
    { id: "where_train", type: "single_choice", label: "Where will you train?", required: true, section: training, options: [opt("gym", "Gym"), opt("home", "Home"), opt("both", "Both / travel")] },
    { id: "equipment_home", type: "multiple_choice", label: "Equipment at home", required: false, section: training, options: [opt("none", "None"), opt("dumbbells", "Dumbbells"), opt("bands", "Bands"), opt("kettlebell", "Kettlebell"), opt("bench", "Bench"), opt("pullup_bar", "Pull-up bar")] },
    { id: "days_per_week", type: "number", label: "Days you can realistically train", required: true, section: training, unit: "days" },
    { id: "preferred_time", type: "single_choice", label: "Preferred workout time", required: true, section: training, options: [opt("early", "5–7 am"), opt("morning", "7–10 am"), opt("evening", "5–8 pm"), opt("late", "after 8 pm")] },
    {
      id: "diet_type", type: "single_choice", label: "Food preference", required: true, section: food,
      options: version === 2
        ? [opt("veg", "Vegetarian"), opt("veg_no_egg", "Vegetarian (no egg)"), opt("egg", "Eggetarian"), opt("nonveg", "Non-vegetarian"), opt("jain", "Jain"), opt("vegan", "Vegan")]
        : [opt("veg", "Vegetarian"), opt("egg", "Eggetarian"), opt("nonveg", "Non-vegetarian"), opt("jain", "Jain")],
    },
    { id: "cuisine", type: "single_choice", label: "Home cuisine", required: true, section: food, options: [opt("north", "North Indian"), opt("south", "South Indian"), opt("gujarati", "Gujarati"), opt("bengali", "Bengali"), opt("maharashtrian", "Maharashtrian"), opt("kerala", "Kerala"), opt("other", "Other")] },
    { id: "who_cooks", type: "single_choice", label: "Who cooks at home?", required: true, section: food, highlight: true, options: [opt("self", "Self"), opt("family", "Family"), opt("cook", "Cook / maid"), opt("tiffin", "Tiffin / outside")] },
    { id: "allergies", type: "short_text", label: "Allergies or foods you avoid", required: false, section: food, highlight: true },
  );
  if (version === 2) {
    fields.push({ id: "festival_fasting", type: "short_text", label: "Do you fast regularly (Navratri, Ekadashi, Ramzan, Karwa Chauth, Paryushan…)?", required: false, section: food, highlight: true });
  }
  fields.push(
    { id: "alcohol", type: "single_choice", label: "Alcohol", required: false, section: food, options: [opt("never", "Never"), opt("social", "Socially (≤2/month)"), opt("weekly", "Weekly")] },
    { id: "sleep_hours", type: "number", label: "Average sleep", required: true, section: life, unit: "hours" },
    { id: "steps", type: "number", label: "Average daily steps (if you know)", required: false, section: life, unit: "steps" },
    { id: "stress", type: "single_choice", label: "Stress level these days", required: false, section: life, options: [opt("low", "Low"), opt("medium", "Medium"), opt("high", "High")] },
    { id: "why_now", type: "long_text", label: "Why now? What's different this time?", required: false, section: life },
    { id: "photos_ok", type: "yes_no", label: "OK to share progress photos with me (private)?", required: true, section: "Consent" },
  );
  return fields;
}

const OF2_FIELDS: OnboardingFieldDefinition[] = [
  { id: "what_changed", type: "long_text", label: "What changed since we last worked together?", required: true },
  { id: "weight_kg", type: "number", label: "Current weight", required: true, unit: "kg" },
  { id: "new_injuries", type: "long_text", label: "Any new injuries or pain?", required: false, highlight: true },
  { id: "days_per_week", type: "number", label: "Days you can realistically train", required: true, unit: "days" },
  { id: "goal_now", type: "single_choice", label: "Main goal now", required: true, options: GOAL_OPTIONS },
];

const scale = (id: string, label: string, low: string, high: string): CheckinFieldDefinition => ({
  id, label, type: "scale_1_5", required: false, lowLabel: low, highLabel: high,
});
const weightField: CheckinFieldDefinition = { id: "body_weight", label: "Average morning weight this week", type: "measurement", measurementType: "body_weight_kg", required: false };
const waistField: CheckinFieldDefinition = { id: "waist", label: "Waist at navel", type: "measurement", measurementType: "waist_cm", required: false };
const wellbeingField: CheckinFieldDefinition = { id: "wellbeing", label: "One line: how was the week?", type: "short_text", required: true, maxLength: 1000 };
const notesField: CheckinFieldDefinition = { id: "notes", label: "Anything you need from me?", type: "long_text", required: false, maxLength: 2000 };
const sessionsField: CheckinFieldDefinition = { id: "sessions_done", label: "How many planned workouts did you complete?", type: "single_choice", required: false, options: [opt("all", "All"), opt("most", "Most"), opt("some", "Some"), opt("none", "None")] };
const painField: CheckinFieldDefinition = { id: "pain", label: "Any pain or niggles?", type: "yes_no", required: false };

function cf1Fields(version: 1 | 2): CheckinFieldDefinition[] {
  const fields: CheckinFieldDefinition[] = [
    weightField,
    waistField,
    { id: "photo_front", label: "Front photo", type: "photo_intent", photoSlot: "front", required: false, helpText: "Same light, fasted" },
    { id: "photo_side", label: "Side photo", type: "photo_intent", photoSlot: "side", required: false },
    { id: "photo_back", label: "Back photo", type: "photo_intent", photoSlot: "back", required: false },
    sessionsField,
    scale("training_feel", "How did training feel?", "Very easy", "Very hard"),
    scale("diet_adherence", "How closely did you follow the meal plan?", "Not at all", "100 %"),
    scale("energy", "Energy", "Low", "High"),
    scale("sleep", "Sleep quality", "Poor", "Great"),
    scale("stress", "Stress", "Low", "High"),
    scale("hunger", "Hunger between meals", "Low", "High"),
    painField,
  ];
  if (version === 2) {
    fields.push(
      { id: "steps_avg", label: "Average daily steps", type: "number", unit: "steps", required: false },
      { id: "cycle_phase", label: "Where are you in your cycle?", type: "single_choice", required: false, options: [opt("period", "Period"), opt("follicular", "Follicular"), opt("ovulation", "Ovulation"), opt("luteal", "Pre-period"), opt("na", "Not applicable")] },
    );
  }
  fields.push(
    wellbeingField,
    { id: "win", label: "One win this week", type: "short_text", required: false },
    { id: "obstacle", label: "What got in the way?", type: "short_text", required: false },
    notesField,
  );
  return fields;
}

const CF2_FIELDS: CheckinFieldDefinition[] = [
  weightField,
  { id: "top_squat", label: "Top squat set", type: "number", unit: "kg", required: false },
  { id: "top_bench", label: "Top bench set", type: "number", unit: "kg", required: false },
  { id: "top_deadlift", label: "Top deadlift set", type: "number", unit: "kg", required: false },
  sessionsField,
  scale("training_feel", "How did training feel?", "Very easy", "Very hard"),
  scale("sleep", "Sleep quality", "Poor", "Great"),
  painField,
  wellbeingField,
  notesField,
];

const CF3_FIELDS: CheckinFieldDefinition[] = [
  weightField,
  waistField,
  { id: "bp_reading", label: "Latest BP reading", type: "short_text", required: false, helpText: "e.g. 128/82" },
  { id: "fasting_sugar", label: "Fasting sugar", type: "number", unit: "mg/dL", required: false },
  { id: "steps_avg", label: "Average daily steps", type: "number", unit: "steps", required: false },
  scale("diet_adherence", "How closely did you follow the meal plan?", "Not at all", "100 %"),
  wellbeingField,
  { id: "goal_next_month", label: "Goal for next month", type: "short_text", required: false },
  notesField,
];

export type FormVersionSpec<F> = {
  /** Stable key for ids: demoUuid("form-version", trainer, key, version). */
  key: string;
  version: number;
  /** Days before reset day the version was created. */
  createdDaysAgo: number;
  fields: F[];
};
export type FormTemplateSpec<F> = {
  key: string;
  name: string;
  description: string;
  createdDaysAgo: number;
  versions: FormVersionSpec<F>[];
};

export const ONBOARDING_FORMS: FormTemplateSpec<OnboardingFieldDefinition>[] = [
  {
    key: "of1",
    name: "FitBud Intake",
    description: "Full intake: goals, health, training, food and lifestyle.",
    createdDaysAgo: 200,
    versions: [
      { key: "of1", version: 1, createdDaysAgo: 200, fields: of1Fields(1) },
      { key: "of1", version: 2, createdDaysAgo: 60, fields: of1Fields(2) },
    ],
  },
  {
    key: "of2",
    name: "Quick intake — returning client",
    description: "Short update for clients coming back after a break.",
    createdDaysAgo: 120,
    versions: [{ key: "of2", version: 1, createdDaysAgo: 120, fields: OF2_FIELDS }],
  },
];

export const CHECKIN_FORMS: FormTemplateSpec<CheckinFieldDefinition>[] = [
  {
    key: "cf1",
    name: "Weekly coaching check-in",
    description: "Weight, waist, photos, training and food adherence, one win and one obstacle.",
    createdDaysAgo: 200,
    versions: [
      { key: "cf1", version: 1, createdDaysAgo: 200, fields: cf1Fields(1) },
      { key: "cf1", version: 2, createdDaysAgo: 90, fields: cf1Fields(2) },
    ],
  },
  {
    key: "cf2",
    name: "Strength check-in",
    description: "Top sets on the main lifts, sessions done, sleep and pain.",
    createdDaysAgo: 170,
    versions: [{ key: "cf2", version: 1, createdDaysAgo: 170, fields: CF2_FIELDS }],
  },
  {
    key: "cf3",
    name: "Monthly maintenance review",
    description: "Health markers and habits for maintenance clients.",
    createdDaysAgo: 160,
    versions: [{ key: "cf3", version: 1, createdDaysAgo: 160, fields: CF3_FIELDS }],
  },
];
