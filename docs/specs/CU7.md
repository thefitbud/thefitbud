---
id: CU7
title: Trainer More heading aligns with the cards (frame 51)
batch: W3b
depends_on: [CU6]
lane: mobile
files_owned:
  - apps/mobile/src/trainer/MoreScreen.tsx
  - apps/mobile/src/trainer/MoreScreen.test.ts
frames:
  - { frame: "51-trainer-mobile-more-ios.png", viewport: "393x852" }
model: sonnet
size: S
---

## Outcome
On the trainer More screen the "More" heading lines up with the card column as in frame 51.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- BT3d (#162, D-W3-14) moved the cards to the 16pt gutter with a negative margin on `stack` (`MoreScreen.tsx:261`), but the `Screen` title still pads 24pt, so the heading sits ~4pt right of frame 51 and 8pt out of line with the cards.

## Gap list
- `apps/mobile/src/trainer/MoreScreen.tsx:84`: `<Screen title="More">` keeps the 24pt title inset while the cards use 16pt.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] **Corrected 4 Nov 2026 (D-W3b-21, Firoz): frame-faithful wins.** The heading's left edge matches **frame 51** within 1pt at 393x852 — a **20pt** text box, which is 4pt in from the 16pt card column, matching the group labels that already carry `marginLeft: 4` inside that column. The original wording asked for the heading to match *both* the cards' left edge *and* frame 51, which frame 51 cannot satisfy: measured off the locked PNG they are 16.00pt and 20pt, 4pt apart. The spec's own Context corroborates 20pt — "~4pt right of frame 51 **and** 8pt out of line with the cards" only holds if the frame is 20 and the cards are 16.
- [ ] No other trainer tab's heading moves (do not change `Screen.tsx`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- `Screen.tsx` and other screens. Copy or row changes.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `MoreScreen.test.ts`: the title and the card stack resolve to the same horizontal inset (style assertion).
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- Capture at 393x852 against `51-trainer-mobile-more-ios.png` into `docs/qa/CU7/` and attach to the PR.

## Stop conditions
- Aligning needs a change to `Screen.tsx` or other screens.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
