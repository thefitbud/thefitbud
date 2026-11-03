---
id: BT3f
title: Web sign-in legal links sit below the help line
batch: W3
depends_on: [BT3]
lane: web
files_owned:
  - apps/trainer-web/src/auth/AuthLayout.tsx
  - apps/trainer-web/src/auth/SignInPage.tsx  # legal footer placement only
  - apps/trainer-web/src/styles.css  # .auth-help only
  - apps/trainer-web/src/pages/legal/legal.css  # .auth-legal-links only
frames:
  - { frame: "ds5-web-signin-footer.png", viewport: "1440x900" }
  - { frame: "ds5-ios-signin-footer.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
On the web sign-in page, the Privacy · Terms · Credits and licences links sit **below** "Trouble signing in? Need help?", as in both DS5 frames, and every link keeps a 44px tap target with nothing overlapping.

## Context
- **D-W3-15** (decided by Firoz, 3 Nov 2026): on both web and iOS, the legal links go below the help line. Both approved DS5 frames already show this. iOS already matches. Only web moves.
- The fix: in `AuthLayout`, put `.auth-help` back in normal document flow (no absolute positioning). Then render the legal links after it as a footer at the bottom of the form side. The 44px links no longer overlap the help line, which is the reason the web code had moved them above it.
- The footer is links only, with no consent wording. If counsel (BT3c) later adds consent text such as "By continuing you agree…", it is a separate line directly under the Sign in button. It is not part of this footer and needs its own task.

## Gap list
- On `main` at 8a37dd0, `SignInPage.tsx:254-261` renders `nav.auth-legal-links` inside the form card (in `children`). `AuthLayout.tsx:82-89` renders `p.auth-help` after the card, and it is absolutely positioned (`legal.css:251` comment). So on web the links appear above the help line.

## Acceptance criteria
- [ ] At 1440x900 and 1024x768, the order down the form side is: card, "Trouble signing in? Need help?", then Privacy · Terms · Credits and licences, matching `ds5-web-signin-footer.png`.
- [ ] Each link's box is at least 44px tall and doesn't intersect `.auth-help` (e2e bounding-box assertion), including at 375px width.
- [ ] Only the sign-in page shows the legal footer. Other auth pages that use `AuthLayout` are unchanged apart from the help line now being in normal flow.

## Out of scope
- Mobile sign-in (already matches). Consent wording (BT3c, a future task). Legal page content.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/trainer-web/e2e/`: on sign-in, the legal links sit below `.auth-help` and don't overlap it at 375, 1024 and 1440 widths.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, the trainer-web e2e suite.

## Visual check
- `ds5-web-signin-footer.png` at 1440x900 plus a 1024x768 capture. Capture to `docs/qa/BT3f/` and attach to the PR.

## Stop conditions
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
