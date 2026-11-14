# FitBud: design system and mock refinement (Claude chat run)

## How to run this (for Firoz)

1. Make a Claude Project called "FitBud design v3" and choose the strongest model (Fable 5.2).
2. Add these files to the Project knowledge, from `docs/design/v2/` on branch `design/v2-handoff`. If you've connected GitHub, add them straight from the repo.
   - `DESIGN-SYSTEM.pdf` and `DESIGN-SYSTEM.md`
   - `WHY-NOT-SATISFIED.md`, `union-map.md`, `typography.md`, `NUDGE-AND-WHATSAPP.md`, `screen-profile.md`
   - `assets/logo/honest-week-mark.svg` (or the mark PNG) and the app icon PNGs
   - `src/kit.css` (the current tokens)
   - All 16 contact sheets in `png/sheets/`
   - These 5 anchor screens from `png/trainee/` and `png/trainer/`: TR-06a (Today), W-03 (active workout), TR-07a (Diet day), TM-01a (Needs you), TM-04b (Nudge sheet)
3. Paste the prompt below as your first message. Work through the stages in order and don't move on until you've approved the current one.
4. Stage 4 produces `DESIGN-SYSTEM-v3.md`. Save it into `docs/design/v3/` on the same branch, then give Claude Code the stage-5 prompt it writes. Claude Code re-renders all 180 screens.

---

## Prompt to paste

You are the lead product designer and design-system owner for FitBud, a coaching app for the Indian market. Trainees log workouts and meals against a plan their coach sets. Coaches review the trainee's day on a "Needs you" screen and nudge them. The trainee app is one app that combines Hevy (workout) and MyFitnessPal (diet), with no feature duplicated and nothing that would delay the MVP. The coach side is FitBud's own.

The Project files hold our basic design system: the Honest Week four-dot logo, navy #1A1248 and coral #FF587D, Inter type scale, the kit tokens, and 180 mobile mock screens in 16 contact sheets. They also hold WHY-NOT-SATISFIED.md, which explains why the current designs aren't good enough yet. They are structurally complete but still look "okayish", not like a serious App Store app. Treat all of this as the starting point to refine, not as final.

What I want: a refined design system (v3), and the existing mocks refined in that system. You may change colours, refine the logo, change fonts, icon style and anything else visual, as long as you keep the rules below.

### Fixed rules (don't change these)
- Screen IDs, flows and features stay as in screen-profile.md and union-map.md. No new features, no duplicates, nothing that delays MVP.
- Diet and steps keep the progress ring and bar format, with alignment fixed.
- "Ate out" takes an exact kcal number only. Portions are katori and roti in ½ steps.
- Nudge is always a FitBud push notification. WhatsApp is only a redirect that opens WhatsApp with a prefilled message.
- The trainee sees the coach's plan, can add sets and exercises beyond it, and the coach sees those changes. The effort rating is optional. Coaches see PRs.
- Don't copy any app's logo, icons, illustrations or fonts.
- WCAG AA contrast for all text, with 44 pt minimum touch targets. Every number uses equal-width digits.
- iOS and Android from one design system. Light mode first, but every token needs a dark-mode value.

### Stage 1: Critique (no design yet)
Review the design system and contact sheets as a senior designer. Give me the 10 biggest visual problems, ranked, with the screen IDs they affect. Then give 3 things worth keeping. Be blunt.

### Stage 2: Design system v3 options
Show me 3 distinct directions as rendered HTML artifacts. Each direction shows:
- the logo: the four-dot Honest Week mark refined, for example dot proportions, ring weight, spacing, wordmark font, and an app icon that doesn't read as a loading indicator or an apps grid. Keep the idea "3 done, today still open".
- the colour palette, with semantic roles and contrast ratios
- a font pairing, free and licensed for app use, with a Devanagari fallback and ₹ support
- the type scale, spacing, radii, elevation and icon style
- the same two anchor screens, Diet day (TR-07a) and active workout (W-03), rendered at iPhone 15 size in that direction

Recommend one direction and say why. Wait for me to pick, or to ask for a mix.

### Stage 3: Anchor screens
In the chosen direction, render all 5 anchor screens (TR-06a, W-03, TR-07a, TM-01a, TM-04b) at high fidelity as HTML artifacts. Iterate with me until I approve them. Then give a one-line refinement note for each remaining area: onboarding, Today, Workout, Diet, Check-in, Progress, Notifications, More, Sync, and the trainer areas.

### Stage 4: DESIGN-SYSTEM-v3.md
Write the final spec as one markdown file, covering:
- logo usage, with the SVG code for the mark and the icon
- all tokens as CSS variables, light and dark, ready to drop into kit.css
- type scale, spacing, radii and elevation
- component specs: buttons, chips, list rows, cards, sheets, the tab bar, rings and bars, keypad, toasts, empty, error and offline states
- iconography and illustration rules
- motion and haptics guidance, as names and intent only; Figma handles the detail later
- voice and tone
- the per-area refinement notes from stage 3
- a changelog from v2

### Stage 5: Prompt for Claude Code
Write a paste-ready prompt for Claude Code. It tells Claude Code to:
- work on branch `design/v2-handoff` in thefitbud/thefitbud
- add `docs/design/v3/DESIGN-SYSTEM-v3.md`
- update the tokens and components in `docs/design/v2/src/kit.css` and the kit scripts
- re-render all 180 screens and the flow sheets in the v3 system into `docs/design/v3/png/`, keeping the same IDs, then rebuild the contact sheets
- re-run the overflow and tap checks
- write before/after sheets per area and a changelog
- touch no app code and make no builds
- decide on its own without waiting, and record its decisions and the model used
- be careful with usage and wrap up at 92%
- never cancel Actions runs
- open a PR from the branch when done

Don't write the literal string "at-claude" (the at-sign followed by claude) anywhere.
