/** Declarative demo accounts — see STAGE1-TASKS T24. */
export type DemoAccountSpec = {
  email: string;
  role: "trainer" | "trainee" | "invite";
  trainerEmail?: string;
  state: string;
  /** Realistic display name (decision 25 / mockups). */
  displayName: string;
};

export const DEMO_PASSWORD_PLAINTEXT = "FitBud-demo-2026";

/**
 * Display names match docs/spec/mockups (founder-approved). Emails stay
 * state-keyed so seed IDs remain stable.
 */
export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  { email: "rahul.coach@demo.fitbud.test", role: "trainer", state: "main_trainer", displayName: "Rahul Verma" },
  { email: "priya.coach@demo.fitbud.test", role: "trainer", state: "second_trainer", displayName: "Priya Malhotra" },
  /** Empty displayName → natural TW-02 first-run at /welcome. */
  { email: "nova.coach@demo.fitbud.test", role: "trainer", state: "first_run", displayName: "" },
  { email: "anita.invite@demo.fitbud.test", role: "invite", trainerEmail: "rahul.coach@demo.fitbud.test", state: "invite_pending", displayName: "Anita Desai" },
  { email: "vikram.onboarding@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "onboarding_incomplete", displayName: "Vikram Rao" },
  { email: "sneha.review@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "awaiting_review", displayName: "Sneha Kulkarni" },
  { email: "aarav.ontrack@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "active_on_track", displayName: "Aarav Shah" },
  { email: "rohan.slipping@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "slipping", displayName: "Rohan Mehta" },
  { email: "meera.ack@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "acknowledged", displayName: "Meera Iyer" },
  { email: "farhan.paused@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "reminders_paused", displayName: "Farhan Qureshi" },
  { email: "ishita.pushoff@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "notifications_off", displayName: "Ishita Banerjee" },
  { email: "kavya.ended@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "ended", displayName: "Kavya Menon" },
  { email: "nikhil.reactivate@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "reactivation_pending", displayName: "Nikhil Kapoor" },
  { email: "deepak.dubai@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "dubai_meal_times", displayName: "Deepak Nair" },
  // Extra attention clients so Home Needs attention can show ~8 rows (mockup).
  { email: "arjun.attention@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "attention_hole", displayName: "Arjun Deshmukh" },
  { email: "neha.attention@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "attention_hole", displayName: "Neha Joshi" },
  { email: "tanvi.attention@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "attention_hole", displayName: "Tanvi Rao" },
  { email: "lakshmi.foods@demo.fitbud.test", role: "trainee", trainerEmail: "priya.coach@demo.fitbud.test", state: "food_deviations", displayName: "Lakshmi Iyer" },
  { email: "karan.dual@demo.fitbud.test", role: "trainee", trainerEmail: "priya.coach@demo.fitbud.test", state: "dual_role", displayName: "Karan Mehra" },
];
