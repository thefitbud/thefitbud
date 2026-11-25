# Live exception resolver: what each control does (trainer web, origin/main e679b85d)

> **Repo copy, 25 Nov 2026.** This is the 19 Nov snapshot of the live resolver (`ExceptionDrawer` + `side-panel/*`), kept so W13-6 and W13-11 restyle the flow without changing it. Screenshots `a01`… are the ones this file cites, halved to 1x (1440 px wide) and palette-reduced; the rest, the `walk-*.log` files and the capture scripts are not in the repo. **Since this was written W14 changed the words** (D-W14-15, D-W14-29; Z14-15, Z14-26): "Nudge" is now **"Remind"** ("Reminder sent", "Already reminded about this today."), "Mark reviewed" is now **"Noted, keep open"** (timeline "Noted by you", state line "Noted by you at {time} · still open", helper "Noted keeps it open. {First} leaves Home when …"), and "Reviewed, still open" is now **"Noted, still open"**. The behaviour in this file is otherwise current. Screenshots still show the old words; follow the new ones.

Captured 19 Nov 2026, 11:10–11:25 IST. The trainer web app and API ran locally from `/workspace/tfb`, signed in as the demo trainer from the seed data (see `docs/LOCAL_TESTING.md`). Everything was driven with playwright-core and Chrome at 1440×900 and iPad 1024×768, both at 2x. The database was reseeded after the runs that changed data.
Component: `components/ExceptionDrawer.tsx` (`screen-TW-05`, "Needs attention detail"), plus `side-panel/PanelHeader`, `ResolveForm`, `AlsoOpenList`, `BulkPanel` and `RemindersDrawer`.

Screenshot prefixes:
- `a*`: navigation, read-only.
- `b*`: actions that change data.
- `c*`: other clients, direct links and client pages.
- `d*`: iPad.
The matching `walk-*.log` / `run*.out` files hold the full panel text at every step.

## 1. How the panel opens

| Entry | URL | Mode | What you get |
|---|---|---|---|
| Home › Needs attention row (click anywhere on the row) | `/?client=<relationshipId>` | **List mode** | Pager `‹ n of m ›`, progress dashes, the "Also open for {name}" list. Items are newest first, at most 10, then "n more open items · Open client" (a01) |
| Home row › **Review** button | `/?exception=<id>` | Single item | No pager and no Also-open. Copy says "when every item is resolved" (c01) |
| Client › Overview › Needs attention › **Review** | `/clients/:rid/overview?exception=<id>` | Single item, the same right-docked drawer (not a modal) | The ⋯ menu has no "Resolve several…" (c20, c21) |
| `/exceptions/:id` (old links) | redirects to `/?exception=<id>` | Single item | |
| Unknown or deleted id | `/?exception=<bad>` | Gone state | "This item no longer exists / It was removed, so there is nothing to review." and Close. The header shows a placeholder "C · Client" (c18) |

The panel is docked on the right (≈540 px at 1440, ≈540 px at 1024) and the Home list stays visible. Keys: ←/→ step through items and Esc closes.

## 2. Panel anatomy, top to bottom (list mode, Rohan, a09)

1. **Header**: avatar, name, then meta "Lose 6 kg · week 15 · 6 open items". Next to it: `‹` (aria "Previous item"), "5 of 6", `›` ("Next item") and `×` Close. Below sit the progress dashes (current item is navy, resolved are green). On the right is the severity chip **Critical / Attention**, which becomes "✓ n of m resolved" once anything is resolved.
2. **Title**: reason heading, e.g. "Missed workout · Lower body A · Tue 17 Nov". A green "✓ Resolved" pill appears once it is resolved.
3. **Age line**: "Open 1 d · not reviewed yet", "Open 1 d · reviewed" or "Resolved just now". For read-only items: "Read-only · a resolved item can't be changed".
4. **Source card**: a tinted header with a glyph: "From the workout plan · <plan>", "From the meal plan · <plan>" or "From check-ins". Then three rows:
   - **Planned**: "Lower body A · 4 exercises · 12 sets", "Lunch" or "Check-in".
   - **Window**: "Due by end of Tue 17 Nov" or "Due by 9:00 am Thu 12 Nov".
   - **Logged**: "Nothing logged", "Skipped", "Changed" or "Logged later".
5. **Signals** (hidden when read-only or while the form is open). A bell line plus **Details**. Variants seen:
   - "Logs on own · Logged 57 of 61 before a reminder" (Rohan)
   - "Reminders paused · Paused until Thu 26 Nov" (Farhan)
   - "Notifications off · Push notifications off" (Ishita)
   - "Often misses reminders · 47 reminders sent · 18 opened · 23 logged after" (Imran)
   - "Not enough data · Fewer than 5 reminders in 14 days" (Arjun, Deepak, Neha, Priya, Meera)
   Notices also appear here: the quiet-hours line, nudge results and the nudge limit.
6. **Your note · private**: shown only on a resolved item that has a note.
7. **Also open for {first name}** (list mode only, hidden while the form is open). Each row reads "n · Overdue meal · Wed 18 Nov" with a source glyph and a severity chip. Clicking a row jumps straight to that item (a14–a18). The current item is left out of the list, and resolved items stay with a check.
8. **Timeline**:
   - "Detected · Wed 18 Nov, 7:00 am"
   - "Marked reviewed · you · Thu 19 Nov, 11:14 am"
   - "Resolved by you · Talked to client · Thu 19 Nov, 11:14 am"
9. **Footer** (sticky):
   - Buttons: `Mark reviewed` (tinted) · `Nudge` (secondary) · spacer · `⋯` · `Resolve…` (primary).
   - Helper lines: "Sends Rohan a push notification", then "Mark reviewed moves Rohan to Reviewed. Rohan leaves Home when all 6 items are resolved." Once reviewed, the second line becomes "Resolve closes this item. …".
   - `Open client` link.

## 3. Every control

| Control | Where / when | Does | Copy and states seen |
|---|---|---|---|
| `‹` / `›` pager | List mode | Steps through the client's open items. Only the inner state changes; the URL keeps `?client=` | "1 of 6" … "6 of 6". On a 1-of-1 client both arrows still render, disabled (c05, c10) |
| Also-open row | List mode | Jumps to that item | Numbers keep the list order (1–6) and skip the current item |
| "n more open items · Open client" | Lists over 10 | Goes to the client | Not reached by seed data (Farhan has exactly 10). Read in `AlsoOpenList.tsx` |
| Signals **Details** | Any open item | Opens RemindersDrawer on top (a19, a20) | Sections: Reminders by category (Sent · Opened · Logged after reminder · Logged on own · Not logged), Check-ins, "Rohan's settings" (Quiet hours 10:00 pm – 6:30 am; WhatsApp reminders "Coming soon"). Footnote "Reminders are timed by FitBud…". Buttons: `Open coaching setup`, `Close`. **Bug:** it says "Opened from Overview › Reminders › Details" even when opened from Home |
| **Mark reviewed** | Item active (not yet reviewed) | Acknowledges the item. The button disappears, the age line becomes "· reviewed", a timeline row is added and the client moves to Home › "Reviewed, still open" (b08, c14, c15) | Not shown on reviewed or read-only items |
| **Nudge** | Open item that is not a "skipped" kind and not read-only | Sends at once. **There is no sheet, picker or message editor on web.** The result appears as an inline notice under Signals and as a status toast; the button stays enabled | "Nudge sent" · "Already nudged about this today." (second tap, b07) · "Nudge sent to their inbox. Reminders are paused." (Farhan, c04) · "Nudge sent to their inbox. Push is off." (Ishita c06; also Rohan b06, see surprises) · "Nudge sent. It arrives after {time} (client's time, IST)." (during quiet hours) · "Nudge limit reached. You can nudge again in X." (NUDGE_LIMIT / rate limit, code only). Shown before sending: "It's 11:17 am for Imran and quiet hours are on. A nudge now arrives after 4:00 pm (client's time, IST)." (c07) |
| Nudge hidden | Skipped meal / skipped workout (Arjun, Neha, Priya, Deepak, Rohan 3 and 4) | — | Only `Mark reviewed · ⋯ · Resolve…`, and the "Sends … push" helper is gone |
| `⋯` More actions | Footer | Menu (a22) | **Add note** · **Resolve several…** (list mode, 2+ compatible items, not ended) · **Adjust plan** · **Message on WhatsApp** · **Open client** · **Client settings**. From the client page the menu has no Resolve several… (c21) |
| ⋯ › Add note | | Opens the same Resolve form (a23) | Same form as Resolve…; there is no separate note-only save |
| ⋯ › Resolve several… | List mode | Swaps the body for BulkPanel (a24) | Header "Open items" with a select-all box: "1 of 5 selected" and "Meal change · resolved on its own" on the right. Rows show checkbox, glyph, "Overdue meal · Wed 18 Nov / Open today" and a chip. Meal change rows are disabled ("Open today · resolve on its own"). Dark bottom bar: "n selected · Clear (or Back when 0) · Resolve n items…". Helper: "Only missed workouts, meals and check-ins can be resolved together. Mark reviewed still applies to Rohan as a whole." |
| Resolve n items… | Bulk | Confirm dialog over the panel (b02, b03) | "Resolve 5 items for Rohan?" / "The same outcome and note go on every item. Rohan can't log these days late once they're resolved." Then the item list, the **Outcome** chips (same 3), the note box, "You can undo for 5 seconds after." and `Cancel` / `Resolve 5 items` |
| Bulk confirm › Resolve | | Result list with Resolved / "Already resolved" / "No longer exists" / "Resolve on its own" chips, plus a dark toast "5 items resolved · Plan adjusted · Undo" (b04) | Undo restores the selection (b05). After 5 s: "Too late to undo. These items stay resolved." (code) |
| ⋯ › Adjust plan | | → `/clients/:rid/plan` (b19) | |
| ⋯ › Message on WhatsApp | | Opens `api.whatsapp.com/send/?phone=…&text=Hi+Rohan` in a new tab | Disabled when there is no number (code) |
| ⋯ › Open client | | → `/clients/:rid` (b20) | |
| ⋯ › Client settings | | → `/clients/:rid/configure` (b21) | |
| **Resolve…** | Footer | Opens the inline form in place of Signals and Also-open (b09) | Heading "Resolve · Outcome". Three chips: **Talked to client · Plan adjusted · No action needed** (one picked, with a check, b10–b12). Then "Note · optional · only you see this" (textarea, max 2000). Footer `Cancel` / `Resolve item`. Lock helper "Resolving locks this item, so Rohan can't log Tue 17 Nov late anymore. Rohan's other 5 items stay open." (check-ins: "Resolving closes this item. …") |
| Resolve item | Form | Resolves optimistically (b14) | Green "✓ Resolved" pill and "Resolved just now". Banner "Resolved by you · just now · Talked to client" with **Undo** (5 s). Header chip "✓ 1 of 6 resolved", dash goes green, meta "5 open items". Footer "1 of 6 resolved · 5 still open" + **Next item · 6 of 6 ›** |
| Undo | Banner, 5 s | Reopens the item exactly as it was (b15) | |
| After 5 s | | Banner becomes static "Resolved by you · Thu 19 Nov · No action needed". Line "Read-only · a resolved item can't be changed" (b16) | **Next item · n of m** steps to the next unresolved item (b17); `‹` back to it shows the same read-only state (b18) |
| Open client (link) | Footer | → `/clients/:rid` (b22) | |
| Close `×` / Esc | Header | Clears `?client` / `?exception` | |
| Done | Read-only footer | Closes | |

## 4. States covered

| State | Example | Shot |
|---|---|---|
| Open, not reviewed: missed workout | Rohan 5/6 "Missed workout · Lower body A · Tue 17 Nov" | a09 |
| Open: skipped workout | Rohan 4/6, Deepak | a07, c11 |
| Open: overdue meal / required meal unlogged | Rohan 2/6, Farhan "Required meal still unlogged · Dinner" (10 items) | a03, c02 |
| Open: skipped meal | Rohan 3/6, Arjun / Neha / Priya Nair "Skipped lunch" | a05, c10, c12, c13 |
| Open: meal changed (deviation) | Rohan 1/6 "Meal change · Lunch" | a01 |
| Open: meal logged later | Imran "Meal logged later: Snack · Wed 18 Nov" | c07 |
| Open: overdue check-in | Rohan 6/6 "Overdue check-in · Thu 12 Nov", "From check-ins" | a11 |
| Reviewed, still open | Meera "Missed lunch · Open 1 d · reviewed" | c15 |
| Resolved (just now, Undo) and resolved (read-only) | Rohan 5/6 | b14, b16, b18; c17 (older resolved) |
| Ended client | Kavya "Missed workout · Lower body B · Resolved". Footer "Coaching with Kavya has ended. This item is read-only." + Open client, Done | c16 |
| Gone item | bad id | c18 |
| iPad 1024 | Home + panel, ⋯, resolve form, overview drawer | d01–d06 |

## 5. Read in code, not reachable with seed data
- Quiet hours at the moment of sending: "Nudge sent. It arrives after {time} (client's time, {zone})."
- The nudge limit notice.
- "This item was already resolved elsewhere. Nothing was changed."
- "n more open items · Open client" (more than 10 items).
- "No open items for {name}." (empty list).
- Bulk: "Too late to undo…" and skipped reasons.
- "Closed when coaching ended" timeline label (closedReason = coaching_ended). Kavya's item has closed_reason=coaching_ended, yet her timeline shows only "Detected"; see surprises.
- WhatsApp disabled when there is no number.

## 6. Surprises / possibly broken
1. **Meal and check-in windows look about 12 h off in seed data.** Rohan shows Breakfast "Due by 8:00 pm", Lunch "1:00 am" and Dinner "8:00 am". Skipped-lunch items for Arjun, Neha and Priya also say "Due by 1:00 am" and "Detected · 1:00 am". The UI formats `windowEndsAt` correctly in IST, so the seed's UTC values are what's wrong (e.g. breakfast `14:30Z`).
2. **Imran's nudge returns "This activity is already resolved."** The item is "Meal logged later", yet it stays open and Nudge is still offered. Nudge should be hidden for logged-later items, or the copy fixed.
3. **Rohan's helper says "Sends Rohan a push notification" but the nudge result is "Nudge sent to their inbox. Push is off."** The helper text never checks push state.
4. **The Reminders drawer from Home says "Opened from Overview › Reminders › Details"**, which is the wrong breadcrumb.
5. **Client Overview opens single-item mode** (no pager, no Also-open, no Resolve several…) even though the page knows the relationshipId. Home's **Review** button does the same, while a click on the row opens list mode. So the same row has two different panels.
6. **Ended client (Kavya)**: the age line says "a resolved item can't be changed" while the footer says coaching ended, which is two reasons. The timeline also lacks the close entry. Her workout window reads "Due by 7:00 am" instead of "Due by end of {day}", because `localDate` is missing.
7. **The 1-of-1 pager still shows disabled ‹ › arrows** (Ishita, Arjun), and the header meta is cut off with an ellipsis ("Rebuild morning routine · week 11 · 1 o…").
8. **In bulk, "Meal change · resolved on its own" appears twice**: as the right-hand caption of the header and as a disabled row.
9. **No Nudge sheet on web.** Nudge sends at once with fixed copy. Any "nudge options" in old mocks were invented.
10. **Shell**: the nav still has "More" (not Settings), the account role reads "Trainer", and the sidebar is dark navy. The primary button is periwinkle (#5448C8-ish), not navy.
11. **Gone state header** shows a placeholder avatar "C" and "Client".
