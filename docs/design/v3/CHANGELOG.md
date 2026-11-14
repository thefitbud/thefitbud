# Changelog: v2 → v3 mocks (14 Nov 2026, IST)

Colour and theme for the 180 v2 screens, plus 5 screens added for W12 (below). Element boxes match v2 on 170 of the 180 screens in both themes; the 10 that differ are the copy fixes below (`CHECKS.md`).

## W12 additions (14 Nov 2026, IST, from Firoz's device findings)
| Screen | What | Why |
|---|---|---|
| **TR-26e-custom-food** (new) | "Create a food": name, amount, kcal (required), optional protein/carbs/fat, "Save to my foods" toggle, "Rahul sees this as a food you added.", sticky "Add to evening snack · 120 kcal", number keypad | Finding 7: manual logging needs a proper custom food screen. Pattern from MyFitnessPal's quick add / create food |
| **TR-26f-manual-log-saved** (new) | Diet after a manual log: the meal row reads "Logged myself · Roti × 2, ragi dosa", ticked, 320 kcal; ring updated to 1,272; toast "Evening snack saved · 320 kcal" with "View" | Finding 7: a saved confirmation after manual logging |
| **TR-07k-diet-future-day** (new) | Diet on Mon 16 Nov ("planned"): neutral banner "Opens on Mon 16 Nov. You can see Rahul’s plan now and log it on the day.", muted summary, planned meals with no logging actions | Finding 5: future days are view only (decision 24) |
| **W-01e-workout-tab-future-day** (new) | Workout tab on a future day: Upper body A preview, no Start button, "Opens on Mon 16 Nov" | Finding 5 |
| **TR-15d-lockscreen-live-activity** (new) | Complete Live Activity on the lock screen: fixed 160 pt tile, "FitBud · Lower body B 23:14", "Romanian deadlift · Set 3 of 3", "Last 42.5 kg × 10", "Target 40 kg × 10" (coach colour), buttons "Log 40 kg × 10" and "Open", coral progress line; a nudge push below | Finding 1: tiles were cut off and taps did nothing |
| TR-26d-food-search-empty-offline (changed) | "Ask Rahul to add it" replaced by "Create “Ragi dosa”" (opens TR-26e) and "Log as Ate out"; copy "…Or create it with its kcal." | Finding 7: the no-match state needs a way forward without the coach |
| TM-01a2, TM-02a, TM-02f, TM-04l, TM-12b, TM-13b (changed) | "Priya Sharma" → **"Priya Nair"**, avatar "PS" → "PN" | Matches the W12 seed rename |

Taps and flows: TR-26b Save → TR-26f; TR-26d Create → TR-26e → TR-26f; TR-15d Open → W-03 and Log logs the set in place; new flow **F29 "Future days are view only (decided 14 Nov)"**: TR-06d, TR-07k, W-01e. Now 28 flows, 202 steps.

## Copy fixes
| Screen | v2 | v3 | Why |
|---|---|---|---|
| TM-04b, TM-04c, TM-04n, TM-04o (nudge push preview) | "Rahul · FitBud" | "Rahul nudged you" | Spec §8 / nudge rule: title is fixed as "{Coach} nudged you" |
| TM-01a, TM-01b, TM-01c, TM-01f ("Asked you" tile) | "1 mentions pain" | "1 with pain" | Grammar (spec §11). "1 client mentions pain" wrapped to two lines in the tile, so the shorter correct form was used |
| TR-01b (sign in with a code) | "Send code to" Email / WhatsApp switch, "Coming soon" tag, "Codes on WhatsApp are coming soon." | Removed. Subtitle: "We’ll email you a 6-digit code. It works for 10 minutes." Label: "Sign in with a code: email" | WhatsApp is only a redirect, never a sign-in channel (spec §11). This is the one layout change: the email field moves up |

Audit with no change needed: no Nudge opens WhatsApp anywhere (every Nudge button sends a push; WhatsApp buttons are "Message/Reply/Remind on WhatsApp" redirects). Every badge and dot now draws in coral.

## By file
- `src/kit.css`: replaced by `kit-v3.css` (token values unchanged). Appended a "v3 additions" block: `--on-coach`, `--white`, `--fixed-navy`, `--media-bg`, workout hero pair (`--hero-a/-b/-fg/-btn/-btn-fg`), `--icon-tile`, `--toast-ok`, photo placeholders (`--ph-a/-b/-a2/-b2`), PR banner (`--pr-tint2`, `--pr-ink`, `--pr-ink2`), lock-screen glass (`--lock-glass`, `--lock-glass2`), WhatsApp bubble (`--wa-bubble`, `--wa-ink`), six avatar pairs (`--avN-bg/-fg`), all in both themes. `.hi` uses `--ink`; `.hi.light` stays white; `.av.coach` uses `--coach`.
- `src/kit.py`: status bar draws with `currentColor` from `--ink` (white when `dark=True`); `THEME=dark` adds `dark` to `<body>` in `screen()`; default avatar uses `--brand-tint`/`--brand-ink`; workout hero card uses the hero tokens; rest-bar Skip, number keypad, toast tick and keyboard return key use tokens; the due meal "Due now" label uses `--coral-ink`.
- `src/kit_trainer.py`: roster avatars mapped to the six `--avN` pairs (ended and invited clients and Farhan use neutral `--fill` + `--ink2`/`--ink3`); week dots: done tick `--on-brand`, plan/today `--card`, **today ring is 2.5 px `--coral-strong`** (was brand); Needs-you card "Review"/"Reply" buttons are `secondary` (`--fill`) instead of `tint`; WhatsApp bubble tokens; white page background is `--bg-plain`; "1 with pain".
- `src/a_*.py`, `src/b_*.py`, `src/c_gaps_*.py`: every hex in inline styles moved to a token (spec §9 table plus the additions above). White pages → `--bg-plain`; white text on brand/done/crit/ink2/ink3 fills → `--on-brand`; `#F7F5FF` → `--row-cur`; `#8F8BA6` swipe action → `--ink3`; exercise video and workout hero gradients → hero tokens; photo placeholders → neutral `--ph-*`; in-app push banners → `--card`/`--glass`; push and lock-screen app icon tiles → `--icon-tile` (navy in both themes, spec §3); shadows `rgba(22,18,58,…)` → `rgba(var(--sh),…)`.
- `src/a_rest.py` (TR-15a notifications): unread dot is `--coral-strong` (was brand); rows that came from the coach (nudge, reply, plan change, check-in reviewed) use `--coach-tint`/`--coach-ink` icon tiles.
- `src/b_review.py`: nudge preview title.
- `src/a_onboarding.py`: TR-01b; coach avatar uses `--coach`/`--on-coach`; logo tile glyph `--on-brand`.
- `src/render.mjs`: `THEME=dark` → `png-dark/<side>/`.
- `src/sheets.py`: `THEME=dark` → `png-dark/sheets/` with a charcoal sheet background; v3 labels. `src/flowsheet.py`: navy labels.
- New for W12: `src/d_w12.py` (the 5 new screens); `src/a_diet.py` TR-26d; `src/kit_trainer.py` and `src/b_client.py` Priya Nair; `src/tapmap.py`, `src/flows_def.py`, `src/gendocs.py` (taps, F08, F13, F29); `src/beforeafter.py` and `src/layoutdiff.mjs` handle screens with no v2 counterpart; `src/textcheck.mjs` and `src/scan.py` skip the TR-15d wallpaper; `src/scan.py` scans only screen folders.
- New: `src/contrast.py`, `src/textcheck.mjs`, `src/layoutdiff.mjs`, `src/scan.py`, `src/beforeafter.py`, `src/compress.sh`, `src/v3_patch.py` (the one-shot conversion, kept for the record; do not re-run on converted scripts).

Remaining hex in screen scripts, by design: the lock-screen wallpaper gradients and their white clock (TR-15c, TM-13a).
