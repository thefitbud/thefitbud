---
id: BT5
title: Beta dress rehearsal checklist and report template
batch: W4
depends_on: [X4d, BT3b]
lane: qa
files_owned:
  - docs/qa/QA-BT5.md
frames: []
model: sonnet
size: S
---

## Outcome
`docs/qa/QA-BT5.md` is a step-by-step rehearsal checklist Firoz runs on staging with two phones, with a pass/fail column, evidence links and a blocker list.

## Context
- v14 BT5 steps 1-8 on **staging** with the staging app variant on 1 iOS and 1 Android phone (EAS internal distribution) and `app-staging.thefitbud.com`. Any failure becomes a beta-blocker task; once it passes Firoz runs I6b.
- The QA agent writes the document; Firoz runs it (Thu 12 Nov).

## Gap list
- `docs/qa/` has only `README.md`; no BT5 checklist.

## Acceptance criteria
- [ ] Preconditions: I6 done, W3 merged and deployed, both phones on the latest staging build, test trainer and trainee emails (placeholders, no real data).
- [ ] The eight v14 steps, each with exact actions, expected result, where to look (app, web, ZeptoMail report, Sentry, `wrangler tail`), pass/fail, evidence link.
- [ ] Step 8 (Live Activity / Android notification) is marked "only if LA made the cut-line".
- [ ] A blocker table (step, symptom, new task ID) and a sign-off line for Firoz.

## Out of scope
- Running the rehearsal. Production (I6b).
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- Docs only: none.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Non-UI: no screenshot.

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W4.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
