---
id: BT3
title: Trainer web public Privacy, Terms and Credits pages
batch: W3
depends_on: [WD1]
lane: web
files_owned:
  - apps/trainer-web/src/pages/legal/LegalPage.tsx
  - apps/trainer-web/src/pages/legal/LegalPage.test.tsx
  - apps/trainer-web/src/pages/legal/content.ts
  - apps/trainer-web/src/App.tsx  # three public routes only
  - apps/trainer-web/src/auth/SignInPage.tsx  # footer links only
  - apps/trainer-web/src/pages/settings/SettingsHelpPage.tsx  # links only
frames:
  - { frame: "01-trainer-web-signin.png", viewport: "1440x900" }
model: sonnet
size: S
---

## Outcome
`https://app.thefitbud.com/privacy`, `/terms` and `/credits` are public pages with the counsel-approved text, linked from the sign-in page and Settings → Help, giving stable URLs for the store listings.

## Context
- v14 BT3 (web half; the mobile links are BT3b). D-B13: counsel writes the text; agents build pages and links only. Text source: D-W3-4 (decided by Firoz, 1 Nov 2026): Firoz commits counsel's text as markdown in `docs/legal/` (`privacy.md`, `terms.md`, `credits.md`); this task copies it into `content.ts`.
- Page layout follows the DS5 legal frame (Firoz, W2). The privacy text says account deletion is by email request to `SUPPORT_EMAIL` (`tech@thefitbud.com`, `apps/api/wrangler.toml:64`).
- Credits list each CC BY-SA image: title, author, source, licence (D7).

## Gap list
- `apps/trainer-web/src/App.tsx:42-46`: public routes are sign-in and password pages only; no `/privacy`, `/terms`, `/credits`.
- `apps/trainer-web/src/auth/SignInPage.tsx`: no legal links.
- `apps/trainer-web/src/pages/settings/SettingsHelpPage.tsx`: no legal links.

## Acceptance criteria
- [ ] The three routes render without sign-in, outside `RequireAuth`, with a back link to sign-in.
- [ ] Text comes from `content.ts` only; no placeholder text ships (if counsel's text is missing, stop).
- [ ] Sign-in page footer and Settings → Help link to all three.
- [ ] Pages match the DS5 frame and pass the existing a11y checks (headings in order, links named).

## Out of scope
- Mobile links (BT3b). Store listing entry (BT1, Firoz). Account deletion flow (email request in the beta). Writing legal text.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/src/pages/legal/LegalPage.test.tsx` (new): each route renders signed out with its heading; sign-in footer links exist.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Screenshot `/privacy` and the sign-in footer at 1440x900 and compare with the DS5 frame and `01-trainer-web-signin.png`; store in `docs/qa/`.

## Stop conditions
- The DS5 legal frame is not in `docs/design/mockups/png/`, or counsel's text (Q3) isn't committed.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W3.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
