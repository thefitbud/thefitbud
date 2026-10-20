/** Indian-English phrase banks (SEED_DESIGN.md §3.1–3.3). */
export const WINS = [
  "Hit all my sessions even with the quarter-end crunch",
  "Finally did 3 proper push-ups from the floor!",
  "Didn't touch the office samosas this week",
  "Walked 8k steps on 5 days, mostly after dinner",
  "Protein target done 6 out of 7 days",
  "Slept before 11 most nights",
  "Packed lunch from home every weekday",
  "Added 2.5 kg on the main lift",
  "No late-night snacking this week",
  "Did the Sunday session even after a long drive",
];
export const OBSTACLES = [
  "Back to back client calls till 9 pm, skipped one session",
  "Had a family function, ate whatever was there",
  "Travelled for work, hotel breakfast only",
  "Guests at home, cooking was not in my hands",
  "Periods week, felt bloated and low",
  "Bad sleep, kid was unwell",
  "Office party on Friday",
  "Rain all week, couldn't walk outside",
  "Deadline week, ordered food twice",
  "Nothing major, just lazy on Saturday",
];
export const WELLBEING_GOOD = [
  "Good overall, energy better in mornings",
  "Feeling strong, knees ok now",
  "Good week, clothes fitting better",
  "Energy is steady, no afternoon crash",
  "Positive week, felt in control of food",
];
export const WELLBEING_MEH = [
  "Bit tired, work is hectic",
  "Okay week, nothing special",
  "Mood low this week, honestly",
  "Stressed with work but managing",
  "Average, sleep was patchy",
];
export const QUESTIONS = [
  "Is it ok to replace paneer with tofu, paneer is getting boring?",
  "Should I take whey or is it not needed?",
  "Weight is stuck for 2 weeks, what to do?",
  "Can I have one cheat meal this weekend?",
  "Can we move leg day to the weekend?",
  "How much rice is ok at dinner?",
  "",
  "",
  "",
];
export const REVIEW_NOTES = [
  "Solid week. Keep the same plan and push the last set a bit harder.",
  "Good consistency. Trend is moving the right way, don't chase the daily scale.",
  "No stress about the function, back to plan from Monday. Keep protein up.",
  "Weight trend is still down even if the scale jumped — that's water from the salty dinner.",
  "Nice work on the steps. Let's keep sleep at 7 hours this week.",
  "Missed sessions are fine, just do the two most important ones next week.",
  "Great lifting this week. We'll add load on the main lift next session.",
  "Let's plan the travel days in advance — hotel workout + protein first.",
];
export const RESOLUTION_NOTES = [
  "Client was travelling — swapped to 30-min hotel workout",
  "Logged late, did the session",
  "Shifted the workout to Saturday this week",
  "Festival week — agreed flexible meals, protein target only",
  "Sick (viral fever) — rest till Monday",
  "Talked on WhatsApp, back on track tomorrow",
  "Ate at a family function, no action needed",
];
export const ASK_TOPICS: Array<[string, number]> = [
  ["portion_size", 22],
  ["substitute", 18],
  ["eating_out", 12],
  ["exercise_form", 12],
  ["festival", 8],
  ["supplement", 8],
  ["timing", 7],
  ["progress", 6],
  ["pain", 4],
  ["logging", 3],
];
export const ASK_ANSWERS: Record<string, string> = {
  portion_size: "Keep it to 2 rotis and 1 katori dal; add salad if still hungry.",
  substitute: "Yes, tofu works the same — 150 g instead of the paneer.",
  eating_out: "Pick tandoori/grilled + one roti, skip the gravy and dessert.",
  exercise_form: "Slow the lowering part, 3 seconds. Send me a video next session.",
  festival: "Enjoy the festival meal, keep breakfast and lunch on plan that day.",
  supplement: "Whey is optional — use it only on days you miss the protein target.",
  timing: "Have the snack 60–90 min before training, dinner after.",
  progress: "Look at the weekly average, not single days. We're still trending down.",
  pain: "Skip that exercise for now and use the swap I added. Tell me if it persists.",
  logging: "Pick the closest dish and adjust the portion — close enough is good.",
};
