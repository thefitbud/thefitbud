# Changelog: v2 → v3 mocks (14 Nov 2026, IST)

Colour and theme only. No layout, screen ID, flow or feature changes. Element boxes match v2 on 175 of 180 screens in both themes; the 5 that differ are the copy fixes below (`CHECKS.md`).

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
- New: `src/contrast.py`, `src/textcheck.mjs`, `src/layoutdiff.mjs`, `src/scan.py`, `src/beforeafter.py`, `src/compress.sh`, `src/v3_patch.py` (the one-shot conversion, kept for the record; do not re-run on converted scripts).

Remaining hex in screen scripts, by design: the lock-screen wallpaper gradients and their white clock (TR-15c, TM-13a).
