/**
 * Persona sheet for the realistic demo world (SEED_DESIGN.md §4, §5.6).
 * Day offsets are relative to the reset day R (IST). Negative = past.
 */
export type AdherenceProfile = "A" | "B" | "C" | "D" | "E" | "H";

export type PlanStep = {
  /** Day offset (from R) this version became effective. */
  fromDay: number;
  workout: string | null;
  diet: string | null;
  dietScale?: number;
  loadScale?: number;
  /** Shown as plan version change reason in notes. */
  reason: string;
};

export type PersonaConfig = {
  email: string;
  trainerEmail: string;
  timezone: string;
  city: string;
  job: string;
  goalShort: string;
  goalDescription: string;
  planTitle: string;
  /** Days since started_at. */
  tenureDays: number;
  profile: AdherenceProfile;
  /** Plan history oldest → newest. Last entry is the effective version. */
  plan: PlanStep[];
  checkin: {
    weekday: number;
    cadence: "weekly" | "biweekly" | "monthly";
    form: "global" | "cf1v1" | "cf1v2" | "cf2" | "cf3";
  };
  onboardingForm: "global" | "of1v1" | "of1v2";
  subscription: {
    planName: string;
    frequency: "weekly" | "monthly" | "quarterly" | "yearly";
    /** Day offset of the latest renews_on. */
    renewsDay: number;
  };
  sex: "Male" | "Female";
  heightCm: number;
  weight: { start: number; now: number };
  waistStart: number;
  /** Working loads (kg) used for loadLabel + progression. */
  loads: Record<string, number>;
  /** Behaviour events (day offsets, inclusive). */
  events?: Array<{ from: number; to: number; kind: string; mealMult: number; workoutMult: number; note: string }>;
  /** Only for the 8 fully generated personas. */
  bio?: { age: number; birthMonthDay: string };
};

const RAHUL = "rahul.coach@demo.fitbud.test";
const PRIYA = "priya.coach@demo.fitbud.test";

const GYM_LOADS = {
  "bench-press-barbell": 50,
  "bent-over-row-barbell": 45,
  "incline-dumbbell-press": 16,
  "lat-pulldown-wide-grip": 45,
  "side-lateral-raise": 6,
  "triceps-pushdown-rope-attachment": 20,
  "back-squat-barbell": 70,
  "romanian-deadlift-barbell": 60,
  "leg-press": 120,
  "lying-leg-curls": 30,
  "standing-calf-raises": 40,
  "overhead-press-barbell": 32.5,
  "dumbbell-bench-press": 18,
  "seated-cable-row": 45,
  "barbell-curl": 20,
  "face-pull": 15,
  "deadlift-barbell": 90,
  "split-squat-with-dumbbell": 12,
  "leg-extensions": 35,
  "seated-leg-curl": 30,
  "goblet-squat": 16,
  "dumbbell-shoulder-press": 12,
};
const scaleLoads = (loads: Record<string, number>, factor: number) =>
  Object.fromEntries(Object.entries(loads).map(([k, v]) => [k, Math.round((v * factor) / 1.25) * 1.25]));

export const PERSONA_CONFIGS: PersonaConfig[] = [
  {
    email: "aarav.ontrack@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Ahmedabad", job: "Product manager",
    goalShort: "Lean bulk", goalDescription: "Add 4–5 kg over 6 months while keeping waist under 84 cm.", planTitle: "Lean bulk · Block 3",
    tenureDays: 154, profile: "A",
    plan: [
      { fromDay: -154, workout: "W01", diet: "N05", dietScale: 0.95, reason: "Starting block: learn the lifts" },
      { fromDay: -112, workout: "W03", diet: "N05", reason: "Block 2: push/pull/legs for more volume" },
      { fromDay: -14, workout: "W02", diet: "N05", dietScale: 1.02, reason: "Block 3: upper/lower, +50 kcal" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Muscle Gain 24-week", frequency: "quarterly", renewsDay: 20 },
    sex: "Male", heightCm: 176, weight: { start: 72.7, now: 76.8 }, waistStart: 82, loads: scaleLoads(GYM_LOADS, 1.15),
    events: [{ from: -75, to: -71, kind: "wedding", mealMult: 0.5, workoutMult: 0.2, note: "Cousin's wedding in Vadodara" }],
  },
  {
    email: "rohan.slipping@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Delhi", job: "Pharma sales executive",
    goalShort: "Lose 6 kg", goalDescription: "Get from 90 kg to 84 kg and keep it off through the sales season.", planTitle: "Fat loss \u00b7 Phase 2",
    tenureDays: 98, profile: "D",
    plan: [
      { fromDay: -98, workout: "W02", diet: "N06", dietScale: 1.08, reason: "Phase 1: upper/lower 4x, ~1,900 kcal" },
      { fromDay: -35, workout: "W02", diet: "N06", reason: "Phase 2: weight stalled, −150 kcal" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Fat Loss · Phase 2", frequency: "monthly", renewsDay: -3 },
    sex: "Male", heightCm: 174, weight: { start: 90.6, now: 86.4 }, waistStart: 98, loads: GYM_LOADS,
    events: [{ from: -9, to: 0, kind: "work", mealMult: 0.85, workoutMult: 0.5, note: "Quarter-end sales targets + Navratri parties" }],
  },
  {
    email: "meera.ack@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Chennai", job: "School principal",
    goalShort: "PCOS-friendly fat loss", goalDescription: "Steady fat loss with regular cycles; waist down 6–8 cm.", planTitle: "PCOS care",
    tenureDays: 182, profile: "B",
    plan: [
      { fromDay: -182, workout: "W05", diet: "N02", reason: "Home dumbbell start" },
      { fromDay: -98, workout: "W01", diet: "N02", reason: "Joined the gym near school" },
      { fromDay: -20, workout: "W01", diet: "N02", dietScale: 0.97, reason: "Lunch portions trimmed" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "PCOS Care Quarterly", frequency: "quarterly", renewsDay: 0 },
    sex: "Female", heightCm: 158, weight: { start: 68.0, now: 62.4 }, waistStart: 92, loads: scaleLoads(GYM_LOADS, 0.5),
  },
  {
    email: "farhan.paused@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Bengaluru", job: "Strategy consultant",
    goalShort: "Maintain muscle while traveling", goalDescription: "Hold 78 kg and strength through a Mon–Thu travel schedule.", planTitle: "Travel-proof maintenance",
    tenureDays: 210, profile: "C",
    plan: [
      { fromDay: -210, workout: "W06", diet: "N09", reason: "Hotel-gym express sessions" },
      { fromDay: -120, workout: "W06", diet: "N09", dietScale: 0.97, reason: "Added a no-gym bodyweight day" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Executive Monthly", frequency: "monthly", renewsDay: 12 },
    sex: "Male", heightCm: 180, weight: { start: 79.5, now: 78.2 }, waistStart: 88, loads: GYM_LOADS,
  },
  {
    email: "ishita.pushoff@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Kolkata", job: "UX designer",
    goalShort: "Rebuild morning routine", goalDescription: "Train before work 3–4 days a week and stop skipping breakfast.", planTitle: "Morning routine",
    tenureDays: 70, profile: "C",
    plan: [
      { fromDay: -70, workout: "W05", diet: "N10", reason: "Home start" },
      { fromDay: -35, workout: "W01", diet: "N10", reason: "Joined a gym near office" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Lifestyle Monthly", frequency: "monthly", renewsDay: 18 },
    sex: "Female", heightCm: 162, weight: { start: 61.0, now: 59.3 }, waistStart: 78, loads: scaleLoads(GYM_LOADS, 0.45),
  },
  {
    email: "kavya.ended@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Kochi", job: "Architect (maternity leave)",
    goalShort: "Postpartum strength return", goalDescription: "Rebuild core and strength after delivery; deadlift 40 kg.", planTitle: "Postpartum return",
    tenureDays: 122, profile: "B",
    plan: [
      { fromDay: -122, workout: "W07", diet: "N07", dietScale: 1.12, reason: "Weeks 1–8 (lactation +300 kcal)" },
      { fromDay: -66, workout: "W07", diet: "N07", reason: "Weeks 9–16: adds Strength C" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Postpartum 16-week", frequency: "monthly", renewsDay: -10 },
    sex: "Female", heightCm: 160, weight: { start: 70.5, now: 64.5 }, waistStart: 90, loads: scaleLoads(GYM_LOADS, 0.45),
  },
  {
    email: "nikhil.reactivate@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Gurugram", job: "Bank VP",
    goalShort: "Restart after travel break", goalDescription: "Lose 8 kg; restart once back from the US secondment.", planTitle: "Fat loss",
    tenureDays: 136, profile: "D",
    plan: [
      { fromDay: -136, workout: "W02", diet: "N06", dietScale: 1.1, reason: "Upper/lower start" },
      { fromDay: -60, workout: "W02", diet: "N06", reason: "Travel: lower calories, same split" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Fat Loss Quarterly", frequency: "quarterly", renewsDay: -10 },
    sex: "Male", heightCm: 178, weight: { start: 94.0, now: 90.1 }, waistStart: 102, loads: GYM_LOADS,
    events: [{ from: -55, to: -12, kind: "travel", mealMult: 0.45, workoutMult: 0.3, note: "Six-week US secondment" }],
  },
  {
    email: "deepak.dubai@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Dubai", city: "Dubai", job: "Oil & gas engineer",
    goalShort: "Lose 8 kg", goalDescription: "From 92 to 84 kg before the family trip home in December.", planTitle: "NRI fat loss",
    tenureDays: 91, profile: "B",
    plan: [
      { fromDay: -91, workout: "W02", diet: "N07", reason: "Upper/lower + Kerala meals" },
      { fromDay: -42, workout: "W02", diet: "N07", dietScale: 0.94, reason: "−150 kcal, 15-min cardio finisher" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "NRI Fat Loss Monthly", frequency: "monthly", renewsDay: 9 },
    sex: "Male", heightCm: 175, weight: { start: 92.0, now: 86.8 }, waistStart: 101, loads: GYM_LOADS,
  },
  {
    email: "arjun.attention@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Chandigarh", job: "Startup founder",
    goalShort: "Build strength", goalDescription: "Squat 130, bench 90, deadlift 160 by March.", planTitle: "Strength block",
    tenureDays: 140, profile: "B",
    plan: [
      { fromDay: -140, workout: "W04", diet: "N06", dietScale: 1.3, reason: "Block 1" },
      { fromDay: -56, workout: "W04", diet: "N06", dietScale: 1.3, loadScale: 1.08, reason: "Block 2: heavier waves" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Strength 12-week", frequency: "quarterly", renewsDay: 35 },
    sex: "Male", heightCm: 181, weight: { start: 82.0, now: 83.5 }, waistStart: 86, loads: { ...scaleLoads(GYM_LOADS, 1.3), "back-squat-barbell": 100, "deadlift-barbell": 130 },
    events: [{ from: -12, to: -6, kind: "work", mealMult: 0.8, workoutMult: 0.5, note: "Fund-raise week" }],
  },
  {
    email: "neha.attention@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Hyderabad", job: "HR business partner",
    goalShort: "Lose 4 kg", goalDescription: "Drop 4 kg and feel lighter by Sankranti.", planTitle: "Fat loss starter",
    tenureDays: 49, profile: "C",
    plan: [
      { fromDay: -49, workout: "W05", diet: "N01", reason: "Home dumbbells" },
      { fromDay: -21, workout: "W05", diet: "N01", dietScale: 0.97, reason: "Smaller dinner portions" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Fat Loss Monthly", frequency: "monthly", renewsDay: 11 },
    sex: "Female", heightCm: 160, weight: { start: 66.0, now: 64.4 }, waistStart: 84, loads: { "goblet-squat": 8, "dumbbell-floor-press": 6, "one-arm-dumbbell-row": 8, "dumbbell-shoulder-press": 5 },
  },
  {
    email: "tanvi.attention@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Jaipur", job: "PG medical resident",
    goalShort: "Stay consistent", goalDescription: "Three short sessions a week around 24-hour duty shifts.", planTitle: "Duty-day express",
    tenureDays: 84, profile: "C",
    plan: [
      { fromDay: -84, workout: "W10", diet: "N03", reason: "Duty-day express start" },
      { fromDay: -42, workout: "W10", diet: "N03", dietScale: 1.03, reason: "Added post-duty snack" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Student Monthly", frequency: "monthly", renewsDay: 22 },
    sex: "Female", heightCm: 156, weight: { start: 57.0, now: 56.2 }, waistStart: 74, loads: { "goblet-squat": 8, "one-arm-dumbbell-row": 8, "dumbbell-lunges": 5, "dumbbell-shoulder-press": 5, "stiff-legged-dumbbell-deadlift": 8 },
  },
  {
    email: "lakshmi.foods@demo.fitbud.test", trainerEmail: PRIYA, timezone: "Asia/Kolkata", city: "Coimbatore", job: "Textile business owner",
    goalShort: "Stabilize weekday meals", goalDescription: "Regular weekday meals and a 3 kg loss without crash dieting.", planTitle: "Weekday rhythm",
    tenureDays: 77, profile: "B",
    plan: [
      { fromDay: -77, workout: "W01", diet: "N02", reason: "Full-body start" },
      { fromDay: -30, workout: "W01", diet: "N02", dietScale: 0.95, reason: "Canteen lunches: lighter dinner" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Lifestyle Quarterly", frequency: "quarterly", renewsDay: 14 },
    sex: "Female", heightCm: 157, weight: { start: 71.0, now: 69.1 }, waistStart: 90, loads: scaleLoads(GYM_LOADS, 0.45),
  },
  {
    email: "karan.dual@demo.fitbud.test", trainerEmail: PRIYA, timezone: "Asia/Kolkata", city: "Mumbai", job: "Freelance personal trainer",
    goalShort: "Coach + train dual role", goalDescription: "Recomposition: lose 2 cm waist, keep lifts.", planTitle: "Recomp",
    tenureDays: 63, profile: "A",
    plan: [
      { fromDay: -63, workout: "W02", diet: "N07", dietScale: 1.15, reason: "Upper/lower" },
      { fromDay: -28, workout: "W02", diet: "N07", dietScale: 1.1, reason: "Small calorie trim" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "global" }, onboardingForm: "global",
    subscription: { planName: "Coach Plan Monthly", frequency: "monthly", renewsDay: 16 },
    sex: "Male", heightCm: 177, weight: { start: 79.0, now: 78.1 }, waistStart: 84, loads: scaleLoads(GYM_LOADS, 1.25),
  },
  // ── 8 new Rahul clients (fully generated) ─────────────────────────────
  {
    email: "siddharth.yearly@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Indore", job: "Chartered accountant (family firm)",
    goalShort: "Reverse prediabetes", goalDescription: "HbA1c under 5.7 and 7 kg down; walk 8k a day.", planTitle: "Metabolic health",
    tenureDays: 238, profile: "A",
    plan: [
      { fromDay: -238, workout: "W08", diet: "N03", reason: "Knee-friendly start" },
      { fromDay: -98, workout: "W01", diet: "N03", dietScale: 1.03, reason: "Ready for the full-body gym plan" },
    ],
    checkin: { weekday: 0, cadence: "biweekly", form: "cf3" }, onboardingForm: "of1v1",
    subscription: { planName: "Metabolic Health Yearly", frequency: "yearly", renewsDay: 127 },
    sex: "Male", heightCm: 170, weight: { start: 86.0, now: 78.2 }, waistStart: 100, loads: scaleLoads(GYM_LOADS, 0.7),
    bio: { age: 45, birthMonthDay: "01-14" },
  },
  {
    email: "ananya.newbie@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Bengaluru", job: "Software engineer (SDE-1)",
    goalShort: "First pull-up", goalDescription: "One strict pull-up by Christmas, and feel strong.", planTitle: "First pull-up",
    tenureDays: 35, profile: "H",
    plan: [{ fromDay: -35, workout: "W11", diet: "N04", dietScale: 1.03, reason: "First pull-up program" }],
    checkin: { weekday: 1, cadence: "weekly", form: "cf2" }, onboardingForm: "of1v2",
    subscription: { planName: "Starter Weekly", frequency: "weekly", renewsDay: 2 },
    sex: "Female", heightCm: 163, weight: { start: 56.0, now: 55.6 }, waistStart: 72, loads: { "lat-pulldown-wide-grip": 25, "goblet-squat": 10, "dumbbell-bench-press": 7.5, "romanian-deadlift-barbell": 30, "one-arm-dumbbell-row": 10, "dumbbell-shoulder-press": 5 },
    bio: { age: 24, birthMonthDay: "07-03" },
  },
  {
    email: "imran.nightshift@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Lucknow", job: "ICU doctor (night shifts)",
    goalShort: "Lose 8 kg", goalDescription: "Lose 8 kg despite rotating night shifts.", planTitle: "Shift-proof fat loss",
    tenureDays: 133, profile: "C",
    plan: [
      { fromDay: -133, workout: "W10", diet: "N06", dietScale: 1.03, reason: "Duty-day express" },
      { fromDay: -63, workout: "W10", diet: "N06", reason: "Back after the break: same plan, new shift times" },
    ],
    checkin: { weekday: 3, cadence: "weekly", form: "cf1v2" }, onboardingForm: "of1v1",
    subscription: { planName: "Fat Loss Quarterly", frequency: "quarterly", renewsDay: 0 },
    sex: "Male", heightCm: 172, weight: { start: 95.0, now: 90.4 }, waistStart: 104, loads: { "goblet-squat": 20, "one-arm-dumbbell-row": 22, "dumbbell-lunges": 12, "dumbbell-shoulder-press": 14, "stiff-legged-dumbbell-deadlift": 20 },
    events: [{ from: -100, to: -64, kind: "pause", mealMult: 0, workoutMult: 0, note: "Coaching paused (burnout after ICU rota)" }],
    bio: { age: 39, birthMonthDay: "11-21" },
  },
  {
    email: "pooja.silent@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Noida", job: "Homemaker",
    goalShort: "Lose post-pregnancy weight", goalDescription: "Lose 6 kg of post-pregnancy weight at home.", planTitle: "Home fit",
    tenureDays: 63, profile: "E",
    plan: [{ fromDay: -63, workout: "W05", diet: "N01", reason: "Home dumbbell plan" }],
    checkin: { weekday: 0, cadence: "weekly", form: "cf1v2" }, onboardingForm: "of1v2",
    subscription: { planName: "Home Fit Monthly", frequency: "monthly", renewsDay: -3 },
    sex: "Female", heightCm: 155, weight: { start: 72.0, now: 71.0 }, waistStart: 94, loads: { "goblet-squat": 8, "dumbbell-floor-press": 5, "one-arm-dumbbell-row": 6, "dumbbell-shoulder-press": 4 },
    events: [{ from: -16, to: 0, kind: "family", mealMult: 0, workoutMult: 0, note: "Kids' exams + mother-in-law visiting" }],
    bio: { age: 34, birthMonthDay: "04-18" },
  },
  {
    email: "rajesh.senior@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Thiruvananthapuram", job: "Retired Navy officer",
    goalShort: "Mobility + BP control", goalDescription: "BP under 130/85 without new medicines; walk pain-free.", planTitle: "Active ageing",
    tenureDays: 196, profile: "A",
    plan: [{ fromDay: -196, workout: "W08", diet: "N07", dietScale: 0.96, reason: "Knee-friendly strength + daily walk" }],
    checkin: { weekday: 6, cadence: "monthly", form: "cf3" }, onboardingForm: "of1v1",
    subscription: { planName: "Active Ageing Yearly", frequency: "yearly", renewsDay: 169 },
    sex: "Male", heightCm: 171, weight: { start: 81.0, now: 77.4 }, waistStart: 96, loads: { "dumbbell-squat-to-a-bench": 10, "seated-cable-row": 35, "machine-bench-press": 30, "leg-press": 80, "lat-pulldown-wide-grip": 35, "seated-dumbbell-press": 8, "farmer-s-carry": 14 },
    bio: { age: 52, birthMonthDay: "08-27" },
  },
  {
    email: "fatima.london@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Europe/London", city: "London", job: "Data analyst",
    goalShort: "Glute & strength focus", goalDescription: "Hip thrust 100 kg and a stronger lower body.", planTitle: "Glute focus",
    tenureDays: 105, profile: "B",
    plan: [
      { fromDay: -105, workout: "W09", diet: "N09", dietScale: 0.9, reason: "Glute & lower focus" },
      { fromDay: -49, workout: "W09", diet: "N09", dietScale: 0.9, loadScale: 1.1, reason: "Block 2 loads" },
    ],
    checkin: { weekday: 6, cadence: "weekly", form: "cf1v2" }, onboardingForm: "of1v1",
    subscription: { planName: "NRI Monthly", frequency: "monthly", renewsDay: 13 },
    sex: "Female", heightCm: 165, weight: { start: 63.0, now: 62.1 }, waistStart: 76, loads: { "barbell-hip-thrust": 70, "romanian-deadlift-barbell": 45, "split-squat-with-dumbbell": 10, "dumbbell-bench-press": 10, "lat-pulldown-wide-grip": 35, "goblet-squat": 16, "leg-press": 90, "sumo-deadlift": 60, "seated-dumbbell-press": 7.5, "seated-cable-row": 30 },
    bio: { age: 29, birthMonthDay: "02-09" },
  },
  {
    email: "harpreet.ready@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Ludhiana", job: "Police exam aspirant",
    goalShort: "Strength + 1.6 km under 6 min", goalDescription: "Pass the police physical: 1.6 km under 6 minutes, 10 pull-ups.", planTitle: "Police fitness prep",
    tenureDays: 4, profile: "A",
    plan: [],
    checkin: { weekday: 0, cadence: "weekly", form: "cf2" }, onboardingForm: "of1v2",
    subscription: { planName: "Performance Monthly", frequency: "monthly", renewsDay: 26 },
    sex: "Male", heightCm: 180, weight: { start: 74.0, now: 74.0 }, waistStart: 80, loads: {},
    bio: { age: 27, birthMonthDay: "12-30" },
  },
  {
    email: "divya.wedding@demo.fitbud.test", trainerEmail: RAHUL, timezone: "Asia/Kolkata", city: "Mumbai", job: "Brand manager",
    goalShort: "Lose 5 kg before wedding", goalDescription: "Lose 5 kg and tone arms before the December wedding.", planTitle: "Bridal 12-week",
    tenureDays: 70, profile: "A",
    plan: [
      { fromDay: -70, workout: "W02", diet: "N04", dietScale: 0.95, reason: "Upper/lower 4x" },
      { fromDay: -28, workout: "W05", diet: "N04", dietScale: 0.95, reason: "Extra conditioning day for the last 6 weeks" },
    ],
    checkin: { weekday: 0, cadence: "weekly", form: "cf1v2" }, onboardingForm: "of1v2",
    subscription: { planName: "Bridal 12-week", frequency: "weekly", renewsDay: 4 },
    sex: "Female", heightCm: 164, weight: { start: 64.0, now: 60.1 }, waistStart: 80, loads: { ...scaleLoads(GYM_LOADS, 0.5), "goblet-squat": 12, "dumbbell-floor-press": 8, "one-arm-dumbbell-row": 10 },
    bio: { age: 31, birthMonthDay: "05-30" },
  },
];

export function personaConfig(email: string): PersonaConfig | undefined {
  return PERSONA_CONFIGS.find((p) => p.email === email);
}

/** Emails of personas created entirely by the generator (not in history.ts). */
export const GENERATED_PERSONA_EMAILS = PERSONA_CONFIGS.filter((p) => p.bio).map((p) => p.email);
