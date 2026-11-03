---
id: CU4
title: Make the QA workflow's qa-scripts job safe to require on main, then require it
batch: W3b
depends_on: [CU3]
lane: ci
files_owned:
  - .github/workflows/qa.yml
frames: []
model: sonnet
size: S
---

## Outcome
`qa-scripts` is a required status check on `main` (D-W3b-1), and every PR still becomes mergeable: a PR that does not touch `scripts/qa/**` gets a **skipped** `qa-scripts` check (skipped counts as passing), never one stuck at "Expected" or "Pending". **P0 in W3b**, after CU1, CU2, CU3.

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- D-W3b-1 (Firoz, 3 Nov 2026): `qa-scripts` becomes a required check; it costs about 15 s and runs only when `scripts/qa/**` changes.
- GitHub semantics the change relies on: a required check is satisfied by a job that runs and is **skipped** by its `if:`; it is **not** satisfied when the workflow never triggers (a top-level `on.pull_request.paths` filter leaves the check at "Expected" forever), nor when the run waits in a concurrency queue ("Pending") or is cancelled because a newer run queued in the same group (only one pending run per group is kept).
- `qa.yml` has no top-level `paths` filter today (`on.pull_request: branches: [main]`), and path classification is already job-level (`changes` job, `qa-scripts` `if:` at line 148). Keep it that way.
- **The real blocker:** workflow-level `concurrency: group: qa-staging, cancel-in-progress: false` (lines 50-54, D-QA1-7). A PR run queues behind the nightly run (up to ~90 min for `android`) and a second queued run cancels the first pending one, so `qa-scripts` would sit at Pending or end Cancelled. D-QA1-7's purpose is that two runs never write the shared staging QA accounts at once; that only needs the jobs that touch staging in the group.
- Applying the branch protection is a remote write. **D-W3b-1 authorises exactly one**: after this PR merges, add `qa-scripts` to `main`'s required status checks with `gh api`, preserving every existing required check and setting. Nothing else remote.

## Gap list
- `.github/workflows/qa.yml:50`: workflow-level concurrency would make a required `qa-scripts` Pending/Cancelled.
- `main`'s branch protection does not list `qa-scripts`.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The workflow triggers on every PR to `main` (no top-level `paths`/`paths-ignore`); if one is ever present, it moves into the `changes` job.
- [ ] Workflow-level `concurrency` is removed; each job that reads or writes the staging QA accounts (`seed-reset`, `unit` if it hits staging, `api-smoke`, `web-staging`, `android`) gets job-level `concurrency: { group: qa-staging, cancel-in-progress: false }`. `changes`, `qa-scripts` and `report` are outside the group. D-QA1-7 still holds: show in the PR that no two staging-writing jobs can overlap.
- [ ] `qa-scripts` keeps its job id/name `qa-scripts` and its `if:`; on a PR without `scripts/qa/**` changes it ends **Skipped**; with such changes it runs; if `changes` fails it still runs (fail-safe, as today).
- [ ] Proof in the PR: links to two runs on this PR's branch history or a scratch PR — one touching `scripts/qa/**` (qa-scripts green) and one not (qa-scripts skipped, PR mergeable). Neither shows the check as Expected or Pending.
- [ ] After merge: `gh api` read of `repos/thefitbud/thefitbud/branches/main/protection/required_status_checks` before and after, pasted (no tokens) in the PR thread; the only difference is the added `qa-scripts` context (strict/up-to-date setting and other contexts unchanged).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- `ci.yml` (D-QA1-6). The Maestro PR smoke stays advisory (D-QA1-10). Any other branch-protection change.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- No unit test; the proof is the two workflow runs and `actionlint` (or `yamllint`) on `qa.yml` if available.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- Splitting concurrency would let two staging-writing jobs overlap.
- The protection API shows settings that the PATCH would reset.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- Any remote write other than adding the `qa-scripts` required check (D-W3b-1).
