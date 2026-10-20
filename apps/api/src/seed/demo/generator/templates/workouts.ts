/* Generated from the approved SEED_DESIGN.md catalogue (docs/seed/SEED_DESIGN.md §5). Edit there, keep slugs in library v2. */
export type WorkoutTemplateExercise = {
  slug: string;
  sets: number;
  /** Range or time as written by the coach, e.g. "8-12", "30 s", "AMRAP". */
  reps: string;
  rpe: number | null;
  restSeconds: number;
  progression: string;
};
export type WorkoutTemplateDay = { name: string; exercises: WorkoutTemplateExercise[] };
export type WorkoutTemplate = {
  code: string;
  title: string;
  forWhom: string;
  schedule: string;
  days: WorkoutTemplateDay[];
};

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    "code": "W01",
    "title": "Beginner Full Body · Gym · 3x (A/B)",
    "forWhom": "beginner gym clients, wk 1–8",
    "schedule": "Mon/Wed/Fri alternating A-B-A / B-A-B",
    "days": [
      {
        "name": "Full Body A",
        "exercises": [
          {
            "slug": "goblet-squat",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-cable-row",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "8-10",
            "rpe": 7,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "plank",
            "sets": 3,
            "reps": "30-45 s",
            "rpe": null,
            "restSeconds": 60,
            "progression": "+10 s/week"
          }
        ]
      },
      {
        "name": "Full Body B",
        "exercises": [
          {
            "slug": "leg-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-shoulder-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lying-leg-curls",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dead-bug",
            "sets": 3,
            "reps": "10/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "slow tempo"
          }
        ]
      }
    ]
  },
  {
    "code": "W02",
    "title": "Upper/Lower Hypertrophy · 4x",
    "forWhom": "intermediate muscle gain / recomposition",
    "schedule": "Mon U-A, Tue L-A, Thu U-B, Sat L-B",
    "days": [
      {
        "name": "Upper A",
        "exercises": [
          {
            "slug": "bench-press-barbell",
            "sets": 4,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "+2.5 kg when 4×8 @≤RPE8"
          },
          {
            "slug": "bent-over-row-barbell",
            "sets": 4,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "incline-dumbbell-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "side-lateral-raise",
            "sets": 3,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "triceps-pushdown-rope-attachment",
            "sets": 3,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Lower A",
        "exercises": [
          {
            "slug": "back-squat-barbell",
            "sets": 4,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "+5 kg when 4×8 @≤RPE8"
          },
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "leg-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lying-leg-curls",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "standing-calf-raises",
            "sets": 4,
            "reps": "10-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Upper B",
        "exercises": [
          {
            "slug": "overhead-press-barbell",
            "sets": 4,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "+2.5 kg when 4×8"
          },
          {
            "slug": "pull-up",
            "sets": 4,
            "reps": "6-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "add reps → add 2.5 kg belt"
          },
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-cable-row",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "barbell-curl",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "face-pull",
            "sets": 3,
            "reps": "15",
            "rpe": 8,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Lower B",
        "exercises": [
          {
            "slug": "deadlift-barbell",
            "sets": 3,
            "reps": "5",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "+5 kg/2 wk"
          },
          {
            "slug": "split-squat-with-dumbbell",
            "sets": 3,
            "reps": "8-10/leg",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "leg-extensions",
            "sets": 3,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-leg-curl",
            "sets": 3,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "hanging-leg-raise",
            "sets": 3,
            "reps": "10-12",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          }
        ]
      }
    ]
  },
  {
    "code": "W03",
    "title": "Push/Pull/Legs · 6x (lean bulk)",
    "forWhom": "advanced gain phase (Aarav block 2)",
    "schedule": "Mon–Sat P/P/L/P/P/L, Sun rest",
    "days": [
      {
        "name": "Push",
        "exercises": [
          {
            "slug": "bench-press-barbell",
            "sets": 4,
            "reps": "5-7",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "top set +2.5 kg/2 wk"
          },
          {
            "slug": "seated-dumbbell-press",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "incline-dumbbell-fly",
            "sets": 3,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "side-lateral-raise",
            "sets": 4,
            "reps": "12-20",
            "rpe": 9,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "triceps-overhead-extension-with-rope",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Pull",
        "exercises": [
          {
            "slug": "weighted-pull-ups",
            "sets": 4,
            "reps": "5-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "+1.25–2.5 kg"
          },
          {
            "slug": "t-bar-row-with-handle",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "one-arm-lat-pulldown",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "reverse-machine-fly",
            "sets": 3,
            "reps": "15",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "incline-dumbbell-curl",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Legs",
        "exercises": [
          {
            "slug": "back-squat-barbell",
            "sets": 4,
            "reps": "5-7",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "top set +5 kg/2 wk"
          },
          {
            "slug": "stiff-legged-barbell-deadlift",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "hack-squat",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-leg-curl",
            "sets": 3,
            "reps": "10-12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-calf-raise",
            "sets": 4,
            "reps": "12-15",
            "rpe": 9,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      }
    ]
  },
  {
    "code": "W04",
    "title": "Strength Block · 4x (SBD + OHP)",
    "forWhom": "strength goal / Arjun",
    "schedule": "Mon squat, Tue bench, Thu deadlift, Sat OHP+volume",
    "days": [
      {
        "name": "Squat day",
        "exercises": [
          {
            "slug": "back-squat-barbell",
            "sets": 5,
            "reps": "3-5",
            "rpe": 8,
            "restSeconds": 240,
            "progression": "wk1 RPE7 → wk3 RPE9, wk4 deload −40 % sets"
          },
          {
            "slug": "front-squat-barbell",
            "sets": 3,
            "reps": "6",
            "rpe": 7,
            "restSeconds": 180,
            "progression": "+2.5 kg/wk"
          },
          {
            "slug": "barbell-hip-thrust",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "ab-roller",
            "sets": 3,
            "reps": "8-10",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          }
        ]
      },
      {
        "name": "Bench day",
        "exercises": [
          {
            "slug": "bench-press-barbell",
            "sets": 5,
            "reps": "3-5",
            "rpe": 8,
            "restSeconds": 210,
            "progression": "wave as squat"
          },
          {
            "slug": "close-grip-barbell-bench-press",
            "sets": 3,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 4,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "face-pull",
            "sets": 3,
            "reps": "15",
            "rpe": 8,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Deadlift day",
        "exercises": [
          {
            "slug": "deadlift-barbell",
            "sets": 4,
            "reps": "2-4",
            "rpe": 8,
            "restSeconds": 240,
            "progression": "wave; deload wk4"
          },
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "6-8",
            "rpe": 7,
            "restSeconds": 150,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "chin-up",
            "sets": 4,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "reps"
          },
          {
            "slug": "farmer-s-carry",
            "sets": 3,
            "reps": "30 m",
            "rpe": null,
            "restSeconds": 90,
            "progression": "+2 kg/hand"
          }
        ]
      },
      {
        "name": "Press + volume",
        "exercises": [
          {
            "slug": "overhead-press-barbell",
            "sets": 5,
            "reps": "3-5",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "+1.25 kg/wk"
          },
          {
            "slug": "dips-chest-version",
            "sets": 3,
            "reps": "8-12",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "reps → weighted"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "leg-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      }
    ]
  },
  {
    "code": "W05",
    "title": "Home Dumbbell Fat-Loss · 4x",
    "forWhom": "home clients with 2 adjustable DBs (Pooja, Neha)",
    "schedule": "Mon/Tue/Thu/Sat",
    "days": [
      {
        "name": "Lower + core",
        "exercises": [
          {
            "slug": "goblet-squat",
            "sets": 4,
            "reps": "12-15",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-rear-lunge",
            "sets": 3,
            "reps": "10/leg",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "stiff-legged-dumbbell-deadlift",
            "sets": 3,
            "reps": "12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "glute-bridge",
            "sets": 3,
            "reps": "15",
            "rpe": null,
            "restSeconds": 45,
            "progression": "single-leg when 3×20"
          },
          {
            "slug": "plank",
            "sets": 3,
            "reps": "40 s",
            "rpe": null,
            "restSeconds": 45,
            "progression": "+5 s/wk"
          }
        ]
      },
      {
        "name": "Upper push/pull",
        "exercises": [
          {
            "slug": "dumbbell-floor-press",
            "sets": 4,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 4,
            "reps": "10-12/arm",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-shoulder-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "incline-push-up",
            "sets": 3,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 60,
            "progression": "lower the incline"
          },
          {
            "slug": "hammer-curls",
            "sets": 2,
            "reps": "12",
            "rpe": 8,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Circuit",
        "exercises": [
          {
            "slug": "surya-namaskar-sun-salutation",
            "sets": 1,
            "reps": "6 rounds",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+1 round/2 wk"
          },
          {
            "slug": "mountain-climbers",
            "sets": 4,
            "reps": "30 s",
            "rpe": null,
            "restSeconds": 30,
            "progression": "time"
          },
          {
            "slug": "bodyweight-squat",
            "sets": 4,
            "reps": "20",
            "rpe": null,
            "restSeconds": 30,
            "progression": "reps"
          },
          {
            "slug": "burpee",
            "sets": 4,
            "reps": "8",
            "rpe": null,
            "restSeconds": 45,
            "progression": "reps"
          },
          {
            "slug": "jumping-jacks",
            "sets": 4,
            "reps": "40 s",
            "rpe": null,
            "restSeconds": 30,
            "progression": "time"
          }
        ]
      },
      {
        "name": "Full body",
        "exercises": [
          {
            "slug": "dumbbell-squat",
            "sets": 3,
            "reps": "12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "bent-over-two-dumbbell-row",
            "sets": 3,
            "reps": "12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-step-ups",
            "sets": 3,
            "reps": "10/leg",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "push-up",
            "sets": 3,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          },
          {
            "slug": "russian-twist",
            "sets": 3,
            "reps": "20",
            "rpe": null,
            "restSeconds": 45,
            "progression": "reps"
          }
        ]
      }
    ]
  },
  {
    "code": "W06",
    "title": "Hotel Gym Express · 3x 35 min",
    "forWhom": "travelling executives (Farhan)",
    "schedule": "any 3 non-consecutive days",
    "days": [
      {
        "name": "Express A",
        "exercises": [
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "goblet-squat",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "treadmill-jog",
            "sets": 1,
            "reps": "12 min",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+1 min"
          }
        ]
      },
      {
        "name": "Express B",
        "exercises": [
          {
            "slug": "dumbbell-shoulder-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "split-squat-with-dumbbell",
            "sets": 3,
            "reps": "8-10/leg",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "push-up",
            "sets": 3,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          },
          {
            "slug": "stationary-bike",
            "sets": 1,
            "reps": "15 min intervals",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+1 interval"
          }
        ]
      },
      {
        "name": "Bodyweight (no gym)",
        "exercises": [
          {
            "slug": "hindu-squat-baithak",
            "sets": 4,
            "reps": "20",
            "rpe": null,
            "restSeconds": 45,
            "progression": "+5 reps"
          },
          {
            "slug": "hindu-push-up-dand",
            "sets": 4,
            "reps": "10",
            "rpe": null,
            "restSeconds": 60,
            "progression": "+2 reps"
          },
          {
            "slug": "bodyweight-walking-lunge",
            "sets": 3,
            "reps": "20 steps",
            "rpe": null,
            "restSeconds": 45,
            "progression": "reps"
          },
          {
            "slug": "plank",
            "sets": 3,
            "reps": "45 s",
            "rpe": null,
            "restSeconds": 45,
            "progression": "time"
          }
        ]
      }
    ]
  },
  {
    "code": "W07",
    "title": "Postpartum Return to Strength · 3x",
    "forWhom": "postpartum (Kavya); cleared by doctor",
    "schedule": "Mon/Wed/Fri",
    "days": [
      {
        "name": "Foundation A",
        "exercises": [
          {
            "slug": "dead-bug",
            "sets": 3,
            "reps": "8/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "slow, exhale on effort"
          },
          {
            "slug": "glute-bridge",
            "sets": 3,
            "reps": "12",
            "rpe": null,
            "restSeconds": 45,
            "progression": "→ single-leg"
          },
          {
            "slug": "goblet-squat",
            "sets": 3,
            "reps": "10",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "+2 kg/2 wk"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 3,
            "reps": "10/arm",
            "rpe": 6,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "bird-dog",
            "sets": 3,
            "reps": "8/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "hold 3 s"
          }
        ]
      },
      {
        "name": "Foundation B",
        "exercises": [
          {
            "slug": "kettlebell-one-legged-deadlift",
            "sets": 3,
            "reps": "8/leg",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "incline-push-up",
            "sets": 3,
            "reps": "8-12",
            "rpe": null,
            "restSeconds": 60,
            "progression": "lower incline"
          },
          {
            "slug": "dumbbell-step-ups",
            "sets": 3,
            "reps": "8/leg",
            "rpe": 6,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "side-plank",
            "sets": 3,
            "reps": "20 s/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "+5 s"
          },
          {
            "slug": "brisk-walk-outdoor",
            "sets": 1,
            "reps": "20 min",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+5 min/wk"
          }
        ]
      },
      {
        "name": "Strength C",
        "exercises": [
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "8",
            "rpe": 7,
            "restSeconds": 120,
            "progression": "+2.5 kg/wk"
          },
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "10",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "10",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "pallof-press",
            "sets": 3,
            "reps": "10/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "band"
          }
        ]
      }
    ]
  },
  {
    "code": "W08",
    "title": "Active Ageing · Knee-friendly · 3x",
    "forWhom": "50+ / BP / knees (Rajesh)",
    "schedule": "Tue/Thu/Sat + daily walk",
    "days": [
      {
        "name": "Strength A",
        "exercises": [
          {
            "slug": "dumbbell-squat-to-a-bench",
            "sets": 3,
            "reps": "10-12",
            "rpe": 6,
            "restSeconds": 90,
            "progression": "+1 kg/2 wk"
          },
          {
            "slug": "seated-cable-row",
            "sets": 3,
            "reps": "12",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "machine-bench-press",
            "sets": 3,
            "reps": "12",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "glute-bridge",
            "sets": 3,
            "reps": "15",
            "rpe": null,
            "restSeconds": 45,
            "progression": "hold 2 s"
          },
          {
            "slug": "standing-calf-raises",
            "sets": 3,
            "reps": "15",
            "rpe": 6,
            "restSeconds": 45,
            "progression": "reps"
          }
        ]
      },
      {
        "name": "Strength B",
        "exercises": [
          {
            "slug": "leg-press",
            "sets": 3,
            "reps": "12",
            "rpe": 6,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "12",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-dumbbell-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 6,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "bird-dog",
            "sets": 3,
            "reps": "8/side",
            "rpe": null,
            "restSeconds": 45,
            "progression": "hold"
          },
          {
            "slug": "farmer-s-carry",
            "sets": 3,
            "reps": "20 m",
            "rpe": null,
            "restSeconds": 60,
            "progression": "+1 kg"
          }
        ]
      },
      {
        "name": "Mobility + walk",
        "exercises": [
          {
            "slug": "world-s-greatest-stretch",
            "sets": 2,
            "reps": "5/side",
            "rpe": null,
            "restSeconds": 0,
            "progression": "—"
          },
          {
            "slug": "cat-stretch",
            "sets": 2,
            "reps": "8",
            "rpe": null,
            "restSeconds": 0,
            "progression": "—"
          },
          {
            "slug": "kneeling-hip-flexor",
            "sets": 2,
            "reps": "30 s/side",
            "rpe": null,
            "restSeconds": 0,
            "progression": "—"
          },
          {
            "slug": "brisk-walk-outdoor",
            "sets": 1,
            "reps": "40 min",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+5 min"
          }
        ]
      }
    ]
  },
  {
    "code": "W09",
    "title": "Glute & Lower Focus · 4x",
    "forWhom": "women's glute/strength (Fatima)",
    "schedule": "Mon/Tue/Thu/Sat",
    "days": [
      {
        "name": "Glutes heavy",
        "exercises": [
          {
            "slug": "barbell-hip-thrust",
            "sets": 4,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "+5 kg"
          },
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "split-squat-with-dumbbell",
            "sets": 3,
            "reps": "10/leg",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "thigh-abductor",
            "sets": 3,
            "reps": "15-20",
            "rpe": 9,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Upper",
        "exercises": [
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "8-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-dumbbell-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "seated-cable-row",
            "sets": 3,
            "reps": "12",
            "rpe": 8,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Quads + glutes",
        "exercises": [
          {
            "slug": "goblet-squat",
            "sets": 4,
            "reps": "10-12",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "leg-press",
            "sets": 3,
            "reps": "12-15",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "one-legged-cable-kickback",
            "sets": 3,
            "reps": "15/leg",
            "rpe": 9,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "leg-extensions",
            "sets": 3,
            "reps": "15",
            "rpe": 9,
            "restSeconds": 45,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      },
      {
        "name": "Posterior chain",
        "exercises": [
          {
            "slug": "sumo-deadlift",
            "sets": 3,
            "reps": "6-8",
            "rpe": 8,
            "restSeconds": 150,
            "progression": "+5 kg"
          },
          {
            "slug": "glute-ham-raise",
            "sets": 3,
            "reps": "6-10",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "reps"
          },
          {
            "slug": "lying-leg-curls",
            "sets": 3,
            "reps": "12",
            "rpe": 9,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "hip-lift-with-band",
            "sets": 3,
            "reps": "20",
            "rpe": null,
            "restSeconds": 45,
            "progression": "reps"
          }
        ]
      }
    ]
  },
  {
    "code": "W10",
    "title": "Duty-Day Express · 25 min · 3x",
    "forWhom": "shift workers (Priya S., Imran)",
    "schedule": "3 flexible days; required=false on post-night-shift days",
    "days": [
      {
        "name": "Express full body A",
        "exercises": [
          {
            "slug": "goblet-squat",
            "sets": 3,
            "reps": "12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "push-up",
            "sets": 3,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 3,
            "reps": "12/arm",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "mountain-climbers",
            "sets": 3,
            "reps": "30 s",
            "rpe": null,
            "restSeconds": 30,
            "progression": "time"
          }
        ]
      },
      {
        "name": "Express full body B",
        "exercises": [
          {
            "slug": "dumbbell-lunges",
            "sets": 3,
            "reps": "10/leg",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-shoulder-press",
            "sets": 3,
            "reps": "10-12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "stiff-legged-dumbbell-deadlift",
            "sets": 3,
            "reps": "12",
            "rpe": 7,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dead-bug",
            "sets": 3,
            "reps": "10/side",
            "rpe": null,
            "restSeconds": 30,
            "progression": "tempo"
          }
        ]
      },
      {
        "name": "Walk + mobility",
        "exercises": [
          {
            "slug": "brisk-walk-outdoor",
            "sets": 1,
            "reps": "30 min",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+5 min"
          },
          {
            "slug": "child-s-pose",
            "sets": 2,
            "reps": "45 s",
            "rpe": null,
            "restSeconds": 0,
            "progression": "—"
          },
          {
            "slug": "hamstring-stretch",
            "sets": 2,
            "reps": "30 s/side",
            "rpe": null,
            "restSeconds": 0,
            "progression": "—"
          }
        ]
      }
    ]
  },
  {
    "code": "W11",
    "title": "First Pull-up Program · 3x",
    "forWhom": "beginner women strength (Ananya)",
    "schedule": "Mon/Wed/Fri",
    "days": [
      {
        "name": "Pull focus",
        "exercises": [
          {
            "slug": "scapular-pull-up",
            "sets": 3,
            "reps": "8",
            "rpe": null,
            "restSeconds": 60,
            "progression": "→ band-assisted"
          },
          {
            "slug": "band-assisted-pull-up",
            "sets": 4,
            "reps": "5-8",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "lighter band when 4×8"
          },
          {
            "slug": "lat-pulldown-wide-grip",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "inverted-row",
            "sets": 3,
            "reps": "8-10",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "lower the bar"
          }
        ]
      },
      {
        "name": "Lower + push",
        "exercises": [
          {
            "slug": "goblet-squat",
            "sets": 3,
            "reps": "8-10",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "dumbbell-bench-press",
            "sets": 3,
            "reps": "8-10",
            "rpe": 7,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "romanian-deadlift-barbell",
            "sets": 3,
            "reps": "8-10",
            "rpe": 7,
            "restSeconds": 120,
            "progression": "+2.5 kg/wk"
          },
          {
            "slug": "plank",
            "sets": 3,
            "reps": "40 s",
            "rpe": null,
            "restSeconds": 45,
            "progression": "time"
          }
        ]
      },
      {
        "name": "Pull + core",
        "exercises": [
          {
            "slug": "chin-up",
            "sets": 3,
            "reps": "negatives × 3-5",
            "rpe": null,
            "restSeconds": 120,
            "progression": "5 s eccentric → full reps"
          },
          {
            "slug": "one-arm-dumbbell-row",
            "sets": 3,
            "reps": "10/arm",
            "rpe": 8,
            "restSeconds": 60,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "hanging-leg-raise",
            "sets": 3,
            "reps": "8",
            "rpe": null,
            "restSeconds": 60,
            "progression": "reps"
          },
          {
            "slug": "dumbbell-shoulder-press",
            "sets": 3,
            "reps": "10",
            "rpe": 7,
            "restSeconds": 75,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          }
        ]
      }
    ]
  },
  {
    "code": "W12",
    "title": "Police Fitness Prep · Strength + Run · 4x",
    "forWhom": "performance/test prep (Harpreet)",
    "schedule": "Mon strength, Tue run, Thu strength, Sat run",
    "days": [
      {
        "name": "Strength A",
        "exercises": [
          {
            "slug": "back-squat-barbell",
            "sets": 4,
            "reps": "5",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "+5 kg/wk"
          },
          {
            "slug": "pull-up",
            "sets": 4,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 120,
            "progression": "reps"
          },
          {
            "slug": "push-up",
            "sets": 4,
            "reps": "AMRAP",
            "rpe": null,
            "restSeconds": 90,
            "progression": "reps"
          },
          {
            "slug": "plank",
            "sets": 3,
            "reps": "60 s",
            "rpe": null,
            "restSeconds": 45,
            "progression": "time"
          }
        ]
      },
      {
        "name": "Intervals",
        "exercises": [
          {
            "slug": "treadmill-run",
            "sets": 6,
            "reps": "400 m @ goal pace",
            "rpe": null,
            "restSeconds": 90,
            "progression": "−2 s/rep/wk"
          },
          {
            "slug": "wind-sprints",
            "sets": 4,
            "reps": "60 m",
            "rpe": null,
            "restSeconds": 60,
            "progression": "—"
          }
        ]
      },
      {
        "name": "Strength B",
        "exercises": [
          {
            "slug": "deadlift-barbell",
            "sets": 4,
            "reps": "5",
            "rpe": 8,
            "restSeconds": 180,
            "progression": "+5 kg/wk"
          },
          {
            "slug": "overhead-press-barbell",
            "sets": 4,
            "reps": "6",
            "rpe": 8,
            "restSeconds": 120,
            "progression": "+2.5 kg"
          },
          {
            "slug": "bent-over-row-barbell",
            "sets": 3,
            "reps": "8",
            "rpe": 8,
            "restSeconds": 90,
            "progression": "double progression: add reps to top of range on all sets, then +2.5 kg (upper) / +5 kg (lower)"
          },
          {
            "slug": "front-box-jump",
            "sets": 4,
            "reps": "5",
            "rpe": null,
            "restSeconds": 90,
            "progression": "height"
          }
        ]
      },
      {
        "name": "Tempo run",
        "exercises": [
          {
            "slug": "treadmill-jog",
            "sets": 1,
            "reps": "25 min easy",
            "rpe": null,
            "restSeconds": 0,
            "progression": "+2 min/wk"
          },
          {
            "slug": "jump-rope-skipping",
            "sets": 5,
            "reps": "1 min",
            "rpe": null,
            "restSeconds": 30,
            "progression": "—"
          }
        ]
      }
    ]
  }
];

export type WorkoutTemplateCode = (typeof WORKOUT_TEMPLATES)[number]["code"];

export function workoutTemplate(code: string): WorkoutTemplate {
  const found = WORKOUT_TEMPLATES.find((t) => t.code === code);
  if (!found) throw new Error(`Unknown workout template ${code}`);
  return found;
}

export const WORKOUT_TEMPLATE_SLUGS: string[] = [
  ...new Set(WORKOUT_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.slug)))),
];
