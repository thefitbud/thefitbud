---
id: BT3d
title: Trainer mobile More follows frame 51 with a DS5 Legal group
batch: W3
depends_on: [BT3b]
lane: mobile-legal
files_owned:
  - apps/mobile/src/trainer/MoreScreen.tsx
  - apps/mobile/src/trainer/MoreScreen.test.ts
frames:
  - { frame: "ds5-ios-trainer-more-legal.png", viewport: "393x852" }
  - { frame: "51-trainer-mobile-more-ios.png", viewport: "393x852" }
  - { frame: "ds5-ios-more-legal.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
The trainer's More screen on mobile uses frame 51's grouped list rows instead of a stack of buttons. It has a LEGAL group that looks and works the same as the trainee's DS5 More screen.

## Context
- **D-W3-14** (decided by Firoz, 3 Nov 2026): the trainer More screen follows the grouped layout from `51-trainer-mobile-more-ios.png`, plus a LEGAL group copied from the trainee's `ds5-ios-more-legal.png`. The governing frame is `ds5-ios-trainer-more-legal.png` (new, 3 Nov 2026).
- Order from top to bottom: profile card (name and email) · **Settings** (Notifications, Profile, Open FitBud on web with the copy icon) · **Switch to client view** in its own group, shown only when `permittedRoles` includes `trainee` · **LEGAL** · a last group with Email FitBud support and Sign out.
- The LEGAL rows are Privacy policy, Terms of use and Credits and licences. Their subtitles are "Opens app.thefitbud.com/privacy", "Opens app.thefitbud.com/terms" and "Exercise drawings and food data". Each row ends with the open-in-browser icon, not a chevron. Keep the current accessible names ("…, opens in your browser") and `legalUrl()` from `apps/mobile/src/lib/legalLinks.ts` (BT3b). The subtitle shows the host that `legalUrl` resolves to, so on staging it reads app-staging.thefitbud.com.
- Reuse the row and group components that the trainee `MoreScreen.tsx` uses (`trainee/MoreScreen.tsx:~480-500`). Don't fork new styling. If those components aren't shared, import them; don't copy them.
- Frame 51's "Notifications · On for this phone" permission card stays where the code puts it today (`MoreScreen.tsx:~48-58`). Frame 51's "Steps · Coming soon" row is dropped: it isn't in the governing frame.

## Gap list
- On `main` at 8a37dd0, `apps/mobile/src/trainer/MoreScreen.tsx:47-130` renders every entry as a `PrimaryButton` (secondary or ghost) under the subtitle "Settings, profile, and sign out." It has no profile card, no groups and no section labels, and the legal links look like the in-app buttons. Comment `:89-95` flags the missing frame. This spec supplies it.

## Acceptance criteria
- [ ] The screen matches `ds5-ios-trainer-more-legal.png`: grouped rows with icon tiles, section labels SETTINGS and LEGAL, and Switch to client view in its own group above LEGAL.
- [ ] The three LEGAL rows open `legalUrl("/privacy" | "/terms" | "/credits")` in the browser, show the open-in-browser icon and subtitles, and keep their "opens in your browser" accessible names.
- [ ] Switch to client view appears only for trainers who also have the trainee role. Sign out and the support email (screen id `TM-07`) behave as today.
- [ ] Row and group visuals are identical to the trainee LEGAL group, because they use the same components.

## Out of scope
- The trainee More screen. Web settings. Legal page content (BT3c).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/trainer/MoreScreen.test.ts`: the LEGAL group renders three rows with the right URLs and accessible names. Switch to client view is hidden without the trainee role. The section order matches the frame.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- `ds5-ios-trainer-more-legal.png` at 393x852 (iOS, scrolled to the bottom, and the top). Capture to `docs/qa/BT3d/` and attach to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
