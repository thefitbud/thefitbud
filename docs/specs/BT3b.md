---
id: BT3b
title: Mobile links to Privacy, Terms and Credits
batch: W3
depends_on: [BT3]
lane: mobile-legal
files_owned:
  - apps/mobile/src/lib/legalLinks.ts
  - apps/mobile/src/lib/legalLinks.test.ts
  - apps/mobile/src/screens/AuthScreen.tsx  # footer links only
  - apps/mobile/src/trainee/MoreScreen.tsx  # legal rows only
  - apps/mobile/src/trainer/MoreScreen.tsx  # legal rows only
frames:
  - { frame: "06-trainee-signin-ios.png", viewport: "393x852" }
  - { frame: "16-trainee-more-ios.png", viewport: "393x852" }
  - { frame: "51-trainer-mobile-more-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
The mobile sign-in screen and both More screens open the web Privacy, Terms and Credits pages in the browser.

## Context
- v14 BT3 (mobile half, split, new ID BT3b). URLs are `${EXPO_PUBLIC_TRAINER_WEB_URL}/privacy|terms|credits` (the variable X7 adds; staging and production per X6 profiles).
- The trainee More "Privacy" row (`apps/mobile/src/trainee/MoreScreen.tsx:445-447`) opens the in-app "what your coach can see" screen; it stays. Legal links are new rows.

## Gap list
- `apps/mobile/src/screens/AuthScreen.tsx`: no legal links.
- `apps/mobile/src/trainer/MoreScreen.tsx:53-70`: Notifications, Profile, web, Help; no legal rows.
- `apps/mobile/src/trainee/MoreScreen.tsx:440-448`: no Terms or Credits rows.

## Acceptance criteria
- [ ] `legalLinks.ts` builds the three URLs from the env var with a fallback to `https://app.thefitbud.com`.
- [ ] Sign-in footer shows "Privacy · Terms"; both More screens show a "Legal" group with three rows that call `Linking.openURL`.
- [ ] Layout follows frames 06, 16 and 51 (new rows use the existing row component).

## Out of scope
- Web pages (BT3). In-app rendering of legal text.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/mobile/src/lib/legalLinks.test.ts` (new): URLs per env value and fallback; rows call `openURL` with the right URL (render test).
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Expo web screenshots at 393x852 of sign-in and both More screens, compared with frames 06, 16, 51; store in `docs/qa/`.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
