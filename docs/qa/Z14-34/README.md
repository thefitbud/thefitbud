# Z14-34 · Meal photo queue: sign-out, pending edits, version after attach

No screen changes, so no screenshots. Automated cover:
`apps/mobile/src/trainee/food/mealPhotoJobs.test.ts` (sign-out, session ended, waiting behind edits/removals) and
`apps/mobile/src/trainee/mealActions.test.ts` (version after attach). The sign-out test was mutation-checked:
removing the discard call and its `discarded` flag makes it fail.

## Reproduce on a device (FitBud UI, new build)

1. **Sign-out clears the queue.** Airplane mode on. Log a meal, add a photo (it shows as waiting). Tap Sign out.
   Sign in as the same user, then as another user, with the network back: no photo uploads anywhere and the
   waiting photo is gone.
2. **Session ended keeps it.** Same set-up, but let the server end the session (revoke the device from the trainer
   side or expire it). Sign in again as the same user: the photo uploads. Sign in as a different user instead: they
   never see or send it.
3. **Edit then photo.** Offline, log a meal, add a photo, edit the meal. Go online: the edit sends first, then the
   photo attaches, and the edit is still there.
4. **Remove then photo.** Offline, add a photo to a logged meal, remove the meal. Go online: the meal is removed,
   no photo error appears.
5. **Edit after attach.** Attach a photo, then edit the same meal right away (and again after an app restart): the
   edit is accepted, not refused as out of date.
