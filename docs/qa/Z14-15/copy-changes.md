# Z14-15 copy changes (before → after)

D-W14-3 (no codes on screen, say what went wrong), D-W14-15 (Nudge becomes Remind), D-W14-29 (review words). Internal names (`activity_nudge`, `/nudges`, `NudgeSheet`, test ids, file names) are unchanged. Old stored notification rows keep the title they were saved with.

## Nudge → Remind

| Before | After | File |
|---|---|---|
| "{Coach} nudged you" (push and inbox title) | "{Coach} sent you a reminder" | apps/api/src/domain/reminders.ts |
| "Your coach nudged you" (fallback) | "Your coach sent you a reminder" | apps/api/src/domain/reminders.ts, apps/mobile/src/notifications/copy.ts, apps/mobile/src/trainer/sheets/NudgeSheet.tsx |
| "{Coach} nudged you" (inbox row title, stored or built) | "Reminder from {Coach first name}" (fallback "Reminder from your coach"; D-W14-15; the push title stays "{Coach} sent you a reminder") | apps/mobile/src/notifications/copy.ts, apps/mobile/src/trainee/NotificationsScreen.tsx |
| "Nudges can't include links." | "Reminders can't include links." | apps/api/src/routes/notifications.ts, NudgeSheet.tsx |
| "Invalid nudge request." | "Invalid reminder request." | apps/api/src/routes/notifications.ts |
| "Ended relationships do not send nudges." | "Ended relationships do not send reminders." | apps/api/src/routes/notifications.ts |
| "You can nudge this client again tomorrow." / "You can nudge again in N min" / "Nudge limit reached. Try again later." | "You can remind … again …" / "Reminder limit reached. Try again later." | apps/api/src/routes/notifications.ts |
| OpenAPI summary and description text | "reminder" wording | apps/api/src/routes/notifications.ts |
| "Nudge {first}" (sheet title) | "Remind {first}" | NudgeSheet.tsx |
| "Nudge {first} about…" | "Remind {first} about…" | NudgePickSheet.tsx |
| "Send nudge" | "Send reminder" | NudgeSheet.tsx |
| "Could not send the nudge. (NUDGE-ERR)" | "Could not send the reminder. Try again." | NudgeSheet.tsx |
| "You nudged {first} about this at {time}. You can nudge again tomorrow." | "You reminded {first} about this at {time}. You can remind again tomorrow." | sheets/nudgeContent.ts |
| "You can nudge {first} again tomorrow." | "You can remind {first} again tomorrow." | sheets/nudgeContent.ts |
| "Nudge sent to {first}'s inbox. …" / "Nudge sent. The push arrives …" / "Nudge sent to {first}" | "Reminder sent …" | sheets/nudgeContent.ts |
| "Nothing open to nudge about" | "Nothing open to remind about" | ClientStatusScreen.tsx |
| "Could not load open items. (NUDGE-ITEMS)" | "Could not load open items. Try again." | ClientStatusScreen.tsx |
| "Nudge" (check-in review button) | "Remind" | CheckinReviewScreen.tsx |
| "Nudge {name}" (check-ins list label) and "Nudge" | "Remind {name}" and "Remind" | checkinsList/List.tsx |
| "Nudges, notes, and check-in reviews from your coach." (Android channel) | "Reminders, notes, and check-in reviews from your coach." | notifications/androidChannels.ts |
| "help FitBud nudges reach you" | "help FitBud reminders reach you" | trainee/setup/OemBatterySheet.tsx |
| "Nudge" / "Nudging…" (activity row) | "Remind" / "Reminding…" | trainer-web ActivityRow.tsx |
| "Nudge" (side panel and check-ins page button) | "Remind" | ExceptionDrawer.tsx, CheckinsPage.tsx |
| "Nudge sent. It arrives after …", "Nudge sent to their inbox. …", "Nudge sent", "Already nudged about this today.", "Could not nudge" | "Reminder sent. …", "Reminder sent to their inbox. …", "Reminder sent", "Already reminded about this today.", "Could not send the reminder" | ExceptionDrawer.tsx |
| "A nudge now arrives after …", "Nudge limit reached. You can nudge again in …" | "A reminder now arrives after …", "Reminder limit reached. You can remind again in …" | side-panel/nudgeNotices.ts |
| "Push nudge" | "Push reminder" | DesignSystemPage.tsx |
| "Used in reminders: “{name} nudged you”" | "… “{name} sent you a reminder”" | ProfileSettingsPage.tsx |
| "Nudge waits until quiet hours end", "Could not nudge.", "Nudges are unavailable until you reconnect." | "The reminder waits …", "Could not send the reminder.", "Reminders are unavailable …" | ClientActivityPage.tsx |
| "Nudge queued" / "Could not nudge right now" / "Nudge" (Home action) | "Reminder sent" / "Could not send the reminder right now" / "Remind" | HomePage.tsx |
| "Plans, reminders and nudges stop today" | "Plans and reminders stop today" | CoachingLifecycleModals.tsx |
| `activity_nudge` label "Nudge" | "Reminder" | packages/core/src/labels.ts |

## Review words (D-W14-29)

| Before | After | File |
|---|---|---|
| Swipe action "Mark reviewed" | "Noted, keep open" | apps/mobile/src/components/SwipeActionRow.tsx |
| "{first} noted, still open · N still need you" | "{first} · Noted · still open · N still need you" (state line wording of the review frames) | AttentionTab.tsx |
| Chip label "Reviewed, still open" | "Noted, still open" | packages/core/src/labels.ts |
| Specimen row "Mark reviewed" | "Noted, keep open" | dev/SpecimensScreen.tsx |

Kept: the check-in review button "Mark reviewed" and "Also mark reviewed" (a different action: it marks a submitted check-in as reviewed).

## Bracketed codes removed from screens (codes stay in `reportError` tags and logs)

| Before | After |
|---|---|
| "Couldn't finish signing in (AUTH-PARSE / AUTH-SESSION). Try again." | "Couldn't finish signing in. Try again." |
| "Couldn't reach FitBud (AUTH-NET). Check your connection and try again." | same without the code |
| "FitBud had a problem on our side (AUTH-SRV). …", "Something went wrong (AUTH-UNK). …", "Too many tries (AUTH-RATE). …", "… use your password. (AUTH-RATE)" | same without the code |
| "Could not resolve. (RES-ERR)", "Could not save note. (NOTE-ERR)" | "Could not resolve. Try again.", "Could not save note. Try again." |
| "Couldn't check for your plan (WAIT-REFRESH). …", "Couldn't open WhatsApp (MORE-WA / ASK-WA). …", "Couldn't send your question (ASK-NET). …" | same without the code |
| "Couldn't load notifications (NOTIF-LOAD)", "Couldn't mark them as read (NOTIF-READ)", "Couldn't read the notifications (NOTIF-PARSE)" | same without the code |
| "Couldn't read what's saved on this phone (SYNC-STORE). …" | same without the code |
| "Something went wrong (STEPS-NATIVE / STEPS-READ / STEPS-SAVE). Try again.", "Couldn't open Play Store (STEPS-LINK). …" | same without the code |
| "Couldn't save. Try again. (CS-SAVE / CS-SUB-SAVE / CS-PAY-SAVE)", "Couldn't load client settings. (CS-LOAD)" | same without the code |
| "Not saved. Something went wrong on our side (LOG-WORKOUT / LOG-MEAL / LOG-MEASURE). …" | "… on our side. …" |
| "Couldn’t load this entry. LOG-LOAD", "… still here. LOG-SAVE" (trainer log screens) | "Couldn’t load this entry. Try again.", "… still here. Try again." |

## Errors that say what went wrong (`packages/api-client/src/errors.ts`)

| Case | Copy |
|---|---|
| Plain `Error` (for example "database is locked", "Network blip") | the context fallback, else "Something went wrong. Try again." (it used to show the error text if it read like a sentence) |
| `UserSafeError` (meal photo steps, meal sync, web sign-in flow) | its own static message |
| `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE`, status 413 | "That file is too big. Choose a smaller one and try again." |
| `REQUEST_TIMEOUT`, status 408 and 504 | "That took too long. Check your connection and try again." |
| `SERVICE_UNAVAILABLE`, status 503 | "FitBud is busy right now. Try again in a moment." |
