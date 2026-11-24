# Z14-10 · W14 mocks for review

Drawn 24 Nov 2026 (IST) with the v3 kit (`docs/design/v3/src/kit.css` + `kit.py`), tokens only. **Status: approved by Firoz, 24 Nov 2026 (D-W14-14).** The same day his answers were applied (D-W14-19 photo only when the plan asks, D-W14-20 rating and note editable for 48 h, D-W14-21 any time zone) and the 24 h diet edit set was added (D-W14-22, group 7). Build specs: Z14-12, Z14-13, Z14-13b, Z14-14 (UI) and Z14-11, Z14-16 (API and trainer marker).

| Folder | Frame |
|---|---|
| `ios-light/` | iPhone 393×852 pt @3x, light |
| `android-light/` | Android 412×915 dp @3x, light (Android status bar, gesture bar, ← back with no label) |
| `ios-dark/` | iPhone 393×852 @3x, dark (charcoal) theme |
| `sheets/` | one contact sheet per group (iOS light, Android light and iOS dark rows) |
| `src/` | generator: `e_w14.py` (screens), `render_w14.mjs` (3 frames + checks), `w14_sheets.py` |

Re-run: copy `src/*` into a copy of `docs/design/v3/src/`, run the `a_*.py` and `d_w12.py` scripts there first (they write the base HTML and registry), then `python3 e_w14.py && node render_w14.mjs && python3 w14_sheets.py <out>`. The overflow checks are the v3 ones (CLIP, OFFSCREEN, WRAP, OVERLAP), plus a touch-target check (every button, nav button, row and search field must be at least 44 pt tall). **All 103 renders (34 screens × 3 frames + TR-15e on Android) pass with 0 warnings.**

## Screens

### 1 · Post-workout summary (diagnosis #4, D-W14-10) · `sheets/1-workout-summary.png`
| ID | What it is | What it fixes |
|---|---|---|
| W-17a2 | After Finish: stats, record, changes, **How hard was it?** 1–10 (optional), note, Save and share | RPE is asked after every finish, not only when the plan requires it |
| W-17a3 | Same, when Rahul's plan requires RPE: "Rahul asks for this", Save disabled until a number is picked, with a hint under it | The required case has a clear way forward |
| W-17a4 | Same, offline: **neutral** banner "You're offline. Your workout is saved on your phone and sends to Rahul when you're back." | Offline isn't shown as a red error (diagnosis #3) |
| W-17c | **View summary** on a finished workout: "Sent to Rahul · Shared Tue 24 Nov, 7:10 pm", same body, a "Your rating and note" group with one **Change** (until 48 h after finish), a single **Done** | "View summary" no longer reopens Save and share |
| W-17c2 | Change sheet from W-17c: 1–10 grid **and** the note, Save / Cancel (D-W14-20) | Change within 48 h |
| W-17c3 | View summary after 48 h, not rated, no note: no Change, "Ratings and notes can be changed for 48 hours after a workout." | Window closed |

### 2 · Time zone (diagnosis #5, D-W14-16) · `sheets/2-time-zone.png`
| ID | What it is |
|---|---|
| TR-20c2 | Account → Preferences → **Time zone · India Standard Time** (entry point, matches today's Account layout) |
| TR-20h | Time zone list: back top left, search field, **Use phone's time zone · Kolkata · India Standard Time** (ticked), then zones grouped by region, "{City} · {name} · UTC+5:30" |
| TR-20h2 | Search "new" with the keyboard up: New York, New Delhi (alias of Kolkata), Auckland |
| TR-20h3 | No match: "No time zone matches “Lakeview”", with what to try |
| TR-20h4 | Dubai picked: tick moves, phone row unticked, toast "Time zone set to Dubai · UTC+4:00" |

### 3 · Assigned diet plan (diagnosis #7) · `sheets/3-assigned-diet-plan.png`
| ID | What it is |
|---|---|
| TR-07l | Fixed header: **‹ Diet** top left, title, compact **Ask Rahul** pill top right. Body: plan name, dates, kcal/protein/meals strip, "What changed", meals in time order with foods and kcal. No blank band, no second Back, no footer link |
| TR-07l2 | Scrolled: the plan name moves into the header ("Fat loss · veg · From Rahul"), coach note on lunch, day total at the end |
| TR-07l3 | Loading: skeleton under the real header (back and Ask work at once) |
| TR-07l4 | Couldn't load: "Something went wrong on our side. Your Diet tab still works." + Try again; header and back stay |

### 4 · Meal card buttons and photo (diagnosis #12, D-W14-11) · `sheets/4-meal-actions-photo.png`
| ID | What it is |
|---|---|
| TR-07a2 | Due card: **Eaten as planned** and **Something different** as two full-width 44 pt buttons, stacked, full labels |
| TR-07a3 | The same at large text (about 120%): nothing cut; the meal line wraps instead of truncating |
| TR-07m | After a log, **only when Rahul's plan asks for a photo** (D-W14-19): "Evening snack logged · Rahul asks for a photo of this meal." Take photo / Choose from gallery / Not now, "You can add it from the meal for 24 hours." |
| TR-07m4 | When the plan doesn't ask: no prompt; the just-logged card shows small **Add photo** and **Edit** with "Editable until tomorrow, 5:20 pm" |
| TR-07m2 | Uploading: thumbnail plus progress on the logged card |
| TR-07m3 | Upload failed: "Photo didn't upload. Your meal is still logged." Try again / Remove photo |

### 5 · Something different (diagnosis #12) · `sheets/5-something-different.png`
| ID | What it is |
|---|---|
| TR-08a2 | Loading: the sheet opens at once with its title and plan kcal, the three choices as a skeleton. **Never "isn't available"** |
| TR-08b2 | Changed the portion as a full screen: ‹ back top left, title + meal, **Save** top right, total and Save portion at the bottom |
| TR-08b3 | Same, offline: neutral note, saves on the phone |
| TR-08c2 | Ate out as a full screen: kcal, plan kcal, optional "What did you have?", optional Add a photo, Save · 380 kcal |
| TR-08c3 | Ate out with the number keyboard up: Save stays top right and directly above the keys; Save is disabled while it's empty |

### 7 · Diet: edit a logged entry for 24 hours (D-W14-22) · `sheets/7-diet-edit-24h.png`
| ID | What it is |
|---|---|
| TR-07m4 | Just-logged card with Add photo, Edit and the "Editable until" hint |
| TR-07n | Logged meal sheet (changed portion) within 24 h: foods, hint "Editable until tomorrow, 1:42 pm · Rahul sees any change", Edit, Add photo, Remove this log |
| TR-07n2 | Edit an "Eaten as planned" log: "Change this log" → Changed the portion / Log it myself / Ate out, or Remove this log |
| TR-07n3 | Remove confirm: "It goes back to not logged, so you can log it again. Rahul sees that you removed it." |
| TR-07n4 | Edit portion: amounts filled in, hint, Reset to plan, Remove this log, Save changes |
| TR-07n5 | Edit ate out (yesterday's dinner): "Was 1,120 kcal", note filled in, Save changes · 950 kcal, Remove |
| TR-07n6 | Saved: toast "Lunch updated · Rahul sees the change", totals updated, subtle **Edited** tag on the card |
| TR-07n7 | After 24 h (Thu 12 Nov): read-only sheet, no Edit/Remove/Add photo, "Logged entries can be changed for 24 hours." + Ask Rahul to fix it |
| TR-07n8 | Edit offline: neutral banner, Save changes queues on the phone |

### 6 · Android Live workout (D-W14-12, D-W14-15) · `sheets/6-android-live-workout.png`
| ID | What it is |
|---|---|
| TR-15e | Android lock screen, Android frame only: the TR-15d layout (exercise, set, last vs Rahul's target, coral progress, **Log 40 kg × 10** and **Open**, no ± steppers) on the "Live workout" channel, plus a reminder push titled "Rahul sent you a reminder" (the D-W14-15 wording) |

## Design decisions (decide-and-note)
1. **RPE chips are a 5 × 2 grid of 44 pt buttons** instead of the old 10-in-a-row 36 pt chips (about 32 pt wide, under the 44 pt minimum). Anchors from `LogSheets.tsx` stay as they are (1 Very easy · 5 Hard · 10 Max effort), shown as one caption line with the picked value on the right ("7 of 10", or "5 · Hard" on an anchor). The heading is "How hard was it?" (spec wording).
2. **Read-only summary** shows the sync chip and the shared time under the title, puts RPE in a row with **Change** and a "Change until {day, time}" line, and has one Done. After 48 h the row stays but has no Change. Not rated shows "–" and "Not rated".
3. **Meal card buttons are always stacked** (full width, 44 pt), not side by side. At 393 pt the two full labels don't fit next to each other even at 100% text, and stacking means one layout at every text size, with no shortened labels and no switch at a font-scale threshold. It costs about 52 pt, only on the one due card.
4. **Photo:** the sheet appears only when the plan asks for a photo (D-W14-19); otherwise the small Add photo on the just-logged card and in the logged meal sheet. Uploading and failed states live on the logged card, so the meal is never blocked by the photo. Failure copy says what happened and that the meal is still logged (D-W14-3). Ate out gets an optional "Add a photo" row too.
5. **Time-zone list:** one tick only. While "Use phone's time zone" is on, it carries the tick, not the matching city. The user's own region (Asia) comes first, then the other regions A–Z. Search matches city, zone name, country and common aliases (New Delhi, Mumbai, Bengaluru → Kolkata), shown as "same as Kolkata". The offset is the current one, so DST zones show today's offset. Saving gives a toast and stays on the list, with back to return.
6. **Assigned plan header:** `‹ Diet` left, title centred, and the Ask action is a small tinted pill "Ask Rahul" with a chat icon (no "about this plan" text). The footer link and the second Back are removed. On scroll, the plan name moves into the header.
7. **Portion / Ate out:** back chevron top left (it replaces "Cancel"). Leaving with changes should ask "Discard changes?" (not drawn, standard pattern). Save is top right and also a bottom primary button with the total, both doing the same thing. On Ate out, Save is disabled at 0 kcal.
8. **Offline is neutral everywhere drawn:** `fill`/`ink2` banner with `wifi-off` and no alert colour. Crit tint is only for real failures (TR-07m3, TR-07l4).
9. **Android frame:** the same v3 layouts at 412 dp, with the Android status bar and gesture bar, and a ← back arrow with no text label (Material). TR-15e is drawn only for Android, because iOS already has TR-15d.
10. **Names and dates** follow the v3 kit and the spec's India-first rule: trainee Aarav Sharma, coach Rahul Verma, IST, "Tue 24 Nov" date style. The Diet base screens keep the v3 kit's Sat 14 Nov day so they line up with the approved TR-07a.
11. Dark theme is drawn for iOS only. Android dark uses the same tokens and wasn't drawn, to keep the review set small.

12. **24 h diet edit (D-W14-22, details in W14.md):**
    - Only the most recently logged card shows inline Add photo / Edit; every other logged card stays compact and opens the logged meal sheet on tap.
    - "Remove this log" (with confirm) is the undo, offered only while the meal could still be logged, so it can't create a missed meal the trainee can't fix.
    - Add photo follows the same 24 h window.
    - After 24 h, or once Rahul has edited the entry, it's read-only with "Ask Rahul to fix it".
    - Hint times read "today, 8:52 pm", "tomorrow, 5:20 pm" or "Sun 15 Nov, 5:20 pm", from the API's `editableUntil`.
    - The trainee sees a small neutral "Edited" tag; the coach sees the same tag plus "Edited by Aarav · {time}" and the previous value (D-W14-23, Z14-16, no new mock).

## Answered by Firoz (24 Nov 2026)
1. Photo sheet only when the trainer's plan asks for it, otherwise an Add photo link (TR-07m, TR-07m4).
2. The note is editable with the rating for 48 h (W-17c, W-17c2).
3. Any time zone may be picked (TR-20h as drawn).
