# QA-I2c · exercise base 2026.10.21-v3

Branch `claude/W1-library-lane`, 31 Oct 2026. Non-UI task, no frames.

## Numbers (local D1 after `pnpm db:reset` with I2d's file list, demo seed loaded)

| Check | Expected | Result |
|---|---|---|
| Global exercises (all `active`, `seed_version` 2026.10.21-v3) | 1362 | 1362 |
| Exercise media rows / distinct exercises | 919 / 460 | 919 / 460 |
| Media with empty `attribution` or `licence` | 0 | 0 |
| Media keys matching `^exercises/[a-z0-9-]+/[0-9]+\.(jpg\|jpeg\|png\|webp\|gif\|mp4)$` | all | all (918 `.png`, 1 `.jpg`, which is the source file's own extension) |
| Exercises without `youtube_search_url` / without a step | 0 / 0 | 0 / 0 |
| Instruction rows (steps, cues, mistakes) | 14037 | 14037 |
| `pragma_foreign_key_check` rows | 0 | 0 |
| Two emitter runs | identical bytes | identical (`emit-exercise-base.test.ts` also checks the committed file) |

The 353 exercises from `03_exercises.sql` keep their ids, slugs and `created_at`. Their names, steps and media now come from the base, for example "Bench press (barbell)" becomes "Barbell Bench Press".

## Checks
`pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:reset`: pass. For the trainer-web e2e, see the PR.
