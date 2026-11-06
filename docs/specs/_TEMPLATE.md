---
# Copy to docs/specs/<ID>.md. Every field is required. Use [] for "none".
id: XX1
title: One-line task title
batch: W1
depends_on: []            # task IDs that must be merged to main first
lane: api                 # any lane named in the batch file's Lanes table (e.g. api, infra, web, mobile, mobile-native, ops)
files_owned:              # globs this task may change. Two tasks in one batch never share a path.
  - apps/api/src/example/**
frames:                   # [] for non-UI tasks. Use file names from docs/design/mockups/png/.
  - { frame: "01-trainer-web-signin.png", viewport: "1440x900" }
model: sonnet             # sonnet | opus | opusplan (opus plans, sonnet edits)
size: S                   # S | M (never L; split instead)
---

## Outcome
One or two sentences: what a trainer or trainee can do once this is merged.

## Context
Everything the agent needs that is not in the code or frames: rules and background.
Cite decisions by their batch-file ID (e.g. "D-W2-3") instead of copying their text; the batch file is where each decision lives.
Paste other context in. Don't link to Confluence or /workspace paths.

## Gap list
- What `main` does today vs the frame or decision. Give `file:line` where useful.
- Written against `main` at <short SHA>. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Observable, testable statement.
- [ ] Another one.

## Out of scope
- Explicit exclusions, e.g. no payment collection, no session counting, no other screens.

## Tests to add
- `path/to/file.test.ts`: what it asserts.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (plus e2e or banned-strings for UI).

## Visual check
- UI tasks: the frames and viewports above. Capture to `docs/qa/<ID>/` and attach to the PR.
- Non-UI tasks: "n/a".

## Stop conditions
- A frame or decision is missing or ambiguous.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
