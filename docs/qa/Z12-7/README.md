# Z12-7 · Intake review + notes

Captures against locked frames 146, 147, 188, 189 (1440×900).
Demo trainer `rahul.coach@demo.fitbud.test`. Body work only (D-W12b-3):
stepper, Next step / Timeline, Review flags, centred not-submitted state,
NoteComposer About / Visible / Earlier / delete quote. Header meta deferred
to Z12-53. Global styles untouched (D-W12b-2).

| Frame | Capture | Grade | Notes |
|---|---|---|---|
| 146 intake submitted | `146-trainer-web-intake-review-web-1440x900.png` | **CLOSE** | Stepper + Next step / Timeline + unsticky Mark ready. Seed Default onboarding has no `highlight` fields, so Review flags / “2 flagged” copy absent (code path covered in unit test). Invited timeline only when invitation list still returns the accepted invite. Header meta → Z12-53. |
| 147 not submitted | `147-trainer-web-intake-not-submitted-web-1440x900.png` | **CLOSE** | Centred empty state, ink Remind on WhatsApp, section progress, Next step + Timeline. Seed draft is 1 of 1 section vs frame sample 3 of 5. Invited row may be missing (accepted invite not in list). |
| 188 note composer | `188-trainer-web-note-composer-web-1440x900.png` | **CLOSE** | About select, Visible to Rohan switch + helper, of-counter, Earlier notes with Edit/Delete. Drawer title still “Add note for …” (WorkspaceModals outside `files_owned`). |
| 189 note delete | `189-trainer-web-note-delete-web-1440x900.png` | **CLOSE** | Quoted body + “You can't undo this.” + destructive Delete note. Overview Coach-notes delete dialog (ClientOverviewPage) still old copy — out of files_owned. |

## Checks

- `OnboardingReviewPage.test.tsx` + `NoteComposer.test.tsx` (12) pass
- `pnpm --filter @fitbud/trainer-web lint` pass
- `pnpm --filter @fitbud/trainer-web typecheck` pass
- design-review tool: skip — "design-review tool not on main yet" (spec until Z11-1); eye grades above

## Scripts

```bash
TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-7/capture.mjs
```

## Decide-and-note

- Timeline **Invited** uses `listInvitations` match on `coachingRelationshipId`; accepted invites may not appear, so the row is omitted rather than inventing a date.
- **Review** flags render only when the pinned form sets `highlight: true` (never inferred). Sneha’s seeded Default onboarding form has no highlights; Next step copy drops the “flagged answers” clause when count is 0.
- Note delete confirm lives in `NoteComposer` (frame 189). Overview’s separate confirm stays for Z12-6 / a later pass.
- Visible switch label is `Visible to {firstName}` per frame 188 (supersedes TW-34 “Visible to client” wording for this drawer).
