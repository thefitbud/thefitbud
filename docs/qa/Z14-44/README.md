# Z14-44 QA: live hints refresh only the cached days

No visual change. Device check for FitBud UI (after the next EAS build pair):

1. Trainee signed in, sitting on Today with the day loaded.
2. Trainer (or a second session) edits a meal for that trainee. Today stays on screen (no skeleton, no full-screen reload) and shows the change within a moment.
3. Trainer publishes a plan change. Today, Diet and Workout pick up the new plan underneath.
4. Trainer reviews a check-in or acknowledges an exception: only the unread count moves.
5. Airplane mode: nothing breaks; the next pull or return refreshes.

Unit evidence: `apps/mobile/src/trainee/realtimeDayUpdate.test.ts`.
