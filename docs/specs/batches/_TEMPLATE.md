# Wn · <name>

**Status:** Draft | Approved by Firoz (<date>) | In progress | Done
**Goal:** what this batch unlocks, in one line.
**Launch rule:** start agents only after Status is "Approved" and every box under "Decisions needed" is ticked.

## Decisions needed before launch
- [ ] Decision, the options, and the recommended option.

## Lanes

| Lane | Tasks (in order) | Model | Files owned | Spec |
|---|---|---|---|---|
| api | AA1 → AA2 | opus | apps/api/src/... | docs/specs/AA1.md, AA2.md |

Two lanes never own the same file. Run at most **3 implementer sessions at once** on one Max seat. Start the next queued task when a slot frees.

## Order
1. Which tasks start first, which wait, and the merge order. Merges are bottom-up, merge commits only.

## Done when
- [ ] Every PR merged with `ci` green and review PASS.
- [ ] Batch-level checks (e.g. a staging-like sign-in works end to end).

## What Firoz reviews
- PRs, with the QA reports and screenshots in `docs/qa/`.
- Manual steps only he can do: secrets, store consoles, remote commands.

## Report (filled in by the orchestrator at the end)
- Merged / open / deferred, with links.
- Usage used this batch (`/usage` before and after).
- Follow-ups found (new task IDs).
