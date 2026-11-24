# Z14-26 copy changes (trainer web, D-W14-29)

| Where | Before | After |
|---|---|---|
| ExceptionDrawer acknowledge button | Mark reviewed | Noted, keep open |
| ExceptionDrawer timeline entry | Marked reviewed · you | Noted by you |
| ExceptionDrawer state line (new, when acknowledged) | (none) | Noted by you at {time} · still open |
| ExceptionDrawer helper (active) | Mark reviewed moves {first} to Reviewed. {first} leaves Home when {items}. | Noted keeps it open. {first} leaves Home when {items}. |
| ExceptionDrawer failure fallback | Could not mark reviewed. | Could not save your note. Try again. |
| Home section title | Reviewed, still open | Noted, still open |
| Home section count line | {n} reviewed item(s) still open | {n} noted item(s) still open |
| Home section row | Reviewed · {summary} | Noted · {summary} |
| Home row ⋯ menu | Mark reviewed | Noted, keep open |
| Home undo toast | Marked reviewed | Noted, kept open |
| Home all-clear card | Reviewed items that are still open stay in their own list. | Noted items that are still open stay in their own list. |
| BulkPanel helper | Mark reviewed still applies to {first} as a whole. | Noted, keep open still applies to {first} as a whole. |
| Specimens sample label | Mark reviewed | Noted, keep open |
| NoteComposer visibility | Switch "Visible to {first}" + "{He/She/They} sees it on Today and gets one notification." | Radio group "Only me" (default) / "{first} too"; line "Only you can see this note." or "{First} sees it on Today and gets one notification." Saved `visibility` values unchanged (private / client). |

Not changed on purpose: check-in "Reviewed" (a different concept: check-in review), "Visible to client" on check-in and design-system pages, all "Nudge" strings (Z14-15).
