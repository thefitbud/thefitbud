/** Eight extra Rahul clients for the realistic demo world (SEED_DESIGN.md §4 #17–24). */
import type { DemoAccountSpec } from "./spec.js";

export const DEMO_EXTRA_ACCOUNTS: DemoAccountSpec[] = [
  { email: "siddharth.yearly@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "maintenance_yearly", displayName: "Siddharth Jain" },
  { email: "ananya.newbie@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "honeymoon_beginner", displayName: "Ananya Bose" },
  { email: "imran.nightshift@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "reactivated_shift", displayName: "Imran Sheikh" },
  { email: "pooja.silent@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "silent_lapsed", displayName: "Pooja Agarwal" },
  { email: "rajesh.senior@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "senior_maintenance", displayName: "Rajesh Pillai" },
  { email: "fatima.london@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "london_timezone", displayName: "Fatima Khan" },
  { email: "harpreet.ready@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "coaching_ready", displayName: "Harpreet Singh" },
  { email: "divya.wedding@demo.fitbud.test", role: "trainee", trainerEmail: "rahul.coach@demo.fitbud.test", state: "deadline_wedding", displayName: "Divya Nair" },
];
