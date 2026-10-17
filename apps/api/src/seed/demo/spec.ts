/** Declarative demo accounts — see STAGE1-TASKS T24. */
export type DemoAccountSpec = {
  email: string;
  role: "trainer" | "trainee" | "invite";
  trainerEmail?: string;
  state: string;
};

export const DEMO_PASSWORD_PLAINTEXT = "FitBud-demo-2026";

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  { email: "rahul.coach@demo.fitbud.test", role: "trainer", state: "main_trainer" },
  { email: "priya.coach@demo.fitbud.test", role: "trainer", state: "second_trainer" },
  { email: "anita.invite@demo.fitbud.test", role: "invite", trainerEmail: "rahul.coach@demo.fitbud.test", state: "invite_pending" },
  { email: "vikram.onboarding@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "onboarding_incomplete" },
  { email: "sneha.review@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "awaiting_review" },
  { email: "aarav.ontrack@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "active_on_track" },
  { email: "rohan.slipping@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "slipping" },
  { email: "meera.ack@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "acknowledged" },
  { email: "farhan.paused@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "reminders_paused" },
  { email: "ishita.pushoff@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "notifications_off" },
  { email: "kavya.ended@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "ended" },
  { email: "nikhil.reactivate@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "reactivation_pending" },
  { email: "deepak.dubai@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "dubai_meal_times" },
  { email: "lakshmi.foods@demo.fitbud.test", role: "trainee", trainerEmail: "priya.coach@demo.fitbud.test", state: "food_deviations" },
  { email: "karan.dual@demo.fitbud.test", role: "trainee", trainerEmail: "priya.coach@demo.fitbud.test", state: "dual_role" },
];
