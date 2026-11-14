# Nudge vs WhatsApp: the rule (clarified by Firoz, decided 10 Nov 2026)

## The rule

| | **Nudge** | **WhatsApp** |
|---|---|---|
| What it is | A **FitBud push notification**, always | A **redirect only**: FitBud opens the WhatsApp app with a prefilled message |
| Who sends | FitBud's server, when the coach taps **Send nudge** | The coach, by pressing **Send inside WhatsApp**. FitBud never sends. |
| Where | Trainer mobile **and** trainer web | Only where it already exists: trainee **Ask Rahul**, trainer **Reply on WhatsApp**, and the WhatsApp button on client detail |
| UI label | "Nudge", helper "Sends {firstName} a push notification" | "Reply on WhatsApp", "Ask {coach}" |

Don't add new WhatsApp entry points, and never present Nudge as a WhatsApp message.

## What the code on `main` does today (checked at 6ed1410e)

- **Trainer web (correct channel):** calls `POST /notifications/relationships/:relationshipId/nudges` (`apps/api/src/routes/notifications.ts:917`, client in `packages/api-client/src/index.ts:2218`). It sends one `activity_nudge` push tied to **one unresolved workout, meal or check-in**.
  - Copy is fixed: title "Quick reminder from your coach", body "Log it when you can." The device chooses the text by notification type (`apps/mobile/src/notifications/copy.ts:146` and `:206`), so the server sends no custom text today.
  - Deferred to the end of quiet hours.
  - Blocked when the client has paused reminders (`REMINDERS_PAUSED`), the item is resolved (`ACTIVITY_RESOLVED`) or the relationship has ended.
  - **1 nudge per item per 4 h** (`ACTIVITY_NUDGE_ITEM_COOLDOWN_HOURS = 4`) and **3 per trainer per hour** (`ACTIVITY_NUDGE_HOURLY_LIMIT = 3`, `packages/core/src/reminder.ts:33-34`). Over the limit returns 429.
- **Trainer mobile (wrong channel):** `apps/mobile/src/trainer/sheets/NudgeSheet.tsx` is documented as "Frame 34: WhatsApp prefill preview… opens wa.me". It calls `openContextualWhatsApp` with a drafted text. **This is wrong:** mobile Nudge must send the push, like web.

## MVP target

1. The coach opens Nudge on an item (missed workout, missed meal, check-in due). The sheet shows **short per-item templates** (chips) and the coach **can edit the body**.
2. The **title is fixed: "{Coach} nudged you"** (e.g. "Rahul nudged you"). The body is the chosen or edited text.
3. **Tapping the push deep-links to the item** (that workout, meal or check-in). It also appears in the trainee's in-app notification list.
4. **Limits:** keep all existing server rules (quiet-hours deferral, paused reminders, resolved item, 1 per item per 4 h, 3 per trainer per hour) **plus 2 per client per day**. When blocked, the sheet shows why and when the coach can nudge again (see TM-04n).
5. Quiet hours: the sheet warns "It's 10:40 pm for Rohan… The push arrives at 7:00 am" (TM-04c).
6. If the client has turned off OS notifications, the nudge still lands in the in-app list; the sheet says so (TM-04o). If reminders are **paused**, Nudge is unavailable (current server behaviour).
7. **Later:** a general nudge not tied to an item.

**Changes this needs (engineering, not part of the design task):**
- **Server:** accept an optional `body` (length-limited and sanitised) on the nudges endpoint, store it, and send it in the push payload. Change the title to "{coach} nudged you". Add the per-client daily limit (`NUDGE_LIMIT`).
- **Device copy:** prefer the server body for `activity_nudge` and keep "Log it when you can." as the fallback.
- **Mobile:** switch `NudgeSheet` from `openContextualWhatsApp` to the nudges API with templates, edit, preview, quiet-hours and limit states (mocks TM-04b, c, m, n, o and TM-03j). **Web:** add the same templates and editing to the drawer.

## Mocks that show this

- **Trainer:** TM-04b (sheet), TM-04c (quiet hours), TM-04m (sent), TM-04n (limit), TM-04o (push off), TM-03j (pick the item from client detail), TM-06d (overdue check-in, "Sends Farhan a push notification").
- **Trainee:** TR-15a ("Rahul nudged you" in the notification list) and TR-15c (lock-screen push).
- The sheet preview header in TM-04b reads "Rahul · FitBud". Refinement should make the preview title read "Rahul nudged you" to match the target.
