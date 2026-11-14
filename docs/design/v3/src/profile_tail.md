## Open decisions for Firoz (with recommendation)

1. **Nudge templates and limit** — mocks show 3 templates, quiet hours 10 pm–7 am (push held until 7:00 am), and 2 nudges per client per day (TM-04n). *Rec:* keep 2/day; let the coach edit text but not the title.
2. **Push off for a client (TM-04o)** — mock warns "Ishita has turned off FitBud notifications" and still sends; she sees it in her in-app inbox next time she opens FitBud. *Rec:* keep this (no WhatsApp fallback); show "Push off" on the client header so the coach knows before tapping.
3. **Priya name clash** — Priya Sharma is a trainee in Rahul's roster and Karan's coach in the seed. *Rec:* rename the coach to e.g. "Priya Nair" in seed data.
4. **Meal ⋯ menu** — mapped to logged meal detail (TR-07g) / planned meal detail (TR-07j). *Rec:* keep; no separate action sheet.
5. **Invites on mobile** — Later (web). *Rec:* keep web-only for MVP; mobile shows "Invite pending" read-only.
6. **Intake answers on mobile (coach)** — Later (web TW-10). *Rec:* show a read-only summary in client ⋯ › Goal, intake, limitations (already mocked as a row) and deep link to web for full answers.
7. **Swipe actions on Needs you** — discoverability. *Rec:* keep the tap-through review screens as the primary path; swipe is a shortcut only.
8. **Reminder time editing** — Later. *Rec:* fixed defaults for MVP (workout 7 am, check-in Sunday 9 am); toggles only.
9. **Check-ins badge** — decided: badge = filter count incl. overdue (3). Mocks updated (TM-05c 1, TM-06c 2 after reviews).

## Deferred (marked, not mocked)

- In-person sessions, agenda and roll-call: **On hold, not mocked** (single "Log in person for {client}" TM-15a/b stays, reachable from client ⋯ menu).
- Reminder time editing; past-coaching history; meal picker for swaps; backdating weight; changing mobile/email; coach intake answers on mobile (web TW-10); invite management (web); plan building (web).
