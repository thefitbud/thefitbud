# Sessions and in-person/offline training: design iteration 1
Screens: IP-01..IP-10 (fitbud-mockups/png, identical on design/mvp-mockups-all-screens) and overview-inperson.png. Status: the batch is on hold (HANDOFF). This is design thinking only, with no build.

## Per-screen shortfalls
**IP-01 Web Home with sessions**
- "Mark attendance" shows on 6:00 pm and 7:30 pm sessions that haven't happened yet (it's morning). Before the start time the action should be "Start" or nothing.
- "Attendance to mark" and "Packages running low" sit beside the list as separate islands. Unmarked past sessions should sit inline in the timeline, flagged.
- No payment or dues signal anywhere, even though most Indian PT clients pay cash or UPI monthly or per pack.
- A group session shows avatars only, with no list of who confirmed.

**IP-02 Calendar**
- The time axis jumps from 12 pm to 5 pm with no visual break, so it reads like a mistake.
- The "Meera Iyer 11:00" blocks are clipped (text cut off).
- Package warnings are tiny orange text inside the blocks.
- Sunday is missing (many Indian gyms run Sunday batches).
- There's no free-slot view for "find a slot to move Rohan", and no recurring-batch indicator.

**IP-03 Session detail**
- Attendance has three equal buttons with no default. "Attended" is preselected, which is the same pre-selection bug found in QA.
- The consequence ("Counts 1 session… 2 left") is in 11 px grey text under the note. It should change live as each option is chosen.
- There's no reason picker for a late cancel (illness, travel, festival) and no way to waive the session as goodwill.
- The workout is read-only, and the "Log workout" CTA is the top-right primary. On the day, the coach wants to log in place.

**IP-04 iPad log for client**
- Good table. But "Save and exit" is the only exit, with no explicit "Finish session", and attendance isn't captured here, so it has to be marked a second time elsewhere.
- Table headers ("SET", "PREVIOUS", "KG", "REPS") are all caps, which is inconsistent with the system.

**IP-05 iPad group session (most important)**
- Four equal columns, each on a different exercise. The coach can't see "who is on what" at a glance.
- Card heights are equal, so space is wasted. Deepak's column has a purple "Romanian deadlift" box that looks like a button but isn't one.
- Two primary-looking buttons sit bottom right for different people ("Next exercise for Deepak" and "Log set for 2 clients"). Mental load is high in a noisy gym.
- Status is only "Joined 8 min late". There's no "Left early", "Swap exercise" or "Skip".

**IP-06 In-person check-in**
- Solid. Photo consent is a toggle, but consent should block taking a photo, not come after one is taken.
- "Show notes to Rohan" defaults to on, which risks leaking private notes. Default it off.

**IP-07 Configure mode**
- The three-card mode choice is clear.
- "Counts as used: Attended, late cancel (under 12 h)" is a read-only sentence. It should be the editable policy (the no-show rule is missing).
- "Payment stays between you and Rohan" is honest, but trainers will want at least a "Paid / Due" marker.

**IP-08 Packages**
- Good dot meter.
- "3 used · 1 unused" on an expired pack has no action (extend or carry over).
- No amount or paid status per pack.
- "Late cancel · counted" chip has no undo.

**IP-09 Trainer mobile sessions**
- It lives under the Attention tab, with no Sessions tab.
- Attendance shows three buttons on every card, including the future 6:00 pm one, so the list is noisy.
- No group logging, no "running late" WhatsApp to the client, and no swipe actions.
- The Start session CTA has no place or clients visible.

**IP-10 Trainee coach-logged**
- Good.
- The trainee can't flag "I actually did 12 reps" (see Q3).
- "Can't make it? Message Rahul" doesn't say whether that counts as a late cancel. Show the policy ("Cancel before 6:30 pm Tue to keep your session").

## New ideas for Indian in-person and small-group trainers
1. **Batch roll-call.** Recurring groups ("Morning strength 7:30") open with a one-screen roster. Everyone defaults to *Expected*; tap a face to mark Present, Late or Absent; then "Start with 4". One tap per person, and it works offline.
2. **Same-exercise group logging.** Group the iPad and phone view by exercise, not by person. One row per client for the current exercise, prefilled with planned kg × reps. "Log set 2 for all present" takes one tap, and per-client edits are inline. Clients on a different exercise fall into a "Doing something else" section.
3. **Attendance policy as a setting.** Per coach, overridable per client: no-show counts (default yes), late cancel window (default 12 h, counts), coach cancel (never counts), waive once per pack.
4. **Payments, lightweight.** Each pack gets an amount, Paid/Due, and a method (Cash / UPI / Bank). A "Send UPI request" action opens WhatsApp with the coach's UPI ID or link and a prefilled message. FitBud never holds money. Home shows "₹ dues: 2 clients" as a count.
5. **Session packs plus monthly plans.** Support "12 sessions / 45 days" and "Monthly unlimited, Mon–Sat batch". Show an expiry nudge and offer carry-over on renewal.
6. **Running-late and cancel quick replies.** WhatsApp prefills "Running 10 min late, Rahul" and "Gym closed today (Diwali)", sent to the whole batch with a draft only. The coach presses Send.
7. **Festival and holiday handling.** Mark a day closed so all sessions cancel as coach-cancelled (not counted), with one WhatsApp draft to the batch.
8. **Venue chips.** Gold's Andheri, Client home Bandra and Park are saved places with travel buffers in the calendar.
9. **End-of-day close-out.** At 9 pm a single card asks "3 sessions not marked" and resolves them in one sheet. No push spam.

## Open questions (HANDOFF): recommended answers
1. **Does a no-show or late cancel use up a session?** Yes by default for both: no-show always, late cancel inside 12 h. Coach-cancelled or holiday sessions never count. The coach can change this in Configure and can "Waive this one" per event, with an undo. Show the outcome live on the attendance control, and show the trainee the policy before they cancel.
2. **One-tap logging for several clients at once?** Yes, but per set and per exercise, only for clients present and on the same exercise, prefilled with plan values. Any client who deviates gets edited inline before tapping. Keep an undo toast ("Logged set 2 for 3 · Undo").
3. **Can trainees edit coach-logged sets?** No direct edit. The trainee can "Suggest a change" (e.g. reps 8 → 12). The coach sees it in Attention and accepts in one tap. History keeps "Logged by Rahul · corrected by Rohan, accepted". This keeps the coach's record trustworthy for packages.
4. **A Sessions tab on coach mobile?** Yes, for coaches with any in-person or hybrid client: Sessions · Attention · Clients · Check-ins · More. Online-only coaches keep the current four tabs. On session days the Sessions tab is the default landing tab, because that's the coach's reality in the gym.

Sketch HTML/PNG not made this iteration (time). The suggested first sketches are the IP-05 by-exercise group view and IP-09 with the Sessions tab and batch roll-call.
