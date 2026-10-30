# Wn · <name>

**Status:** Draft | In progress | Done (information only; it does not gate the launch)
**Goal:** what this batch unlocks, in one line.
**Launch rule:** Firoz's launch message is the go. The orchestrator does not wait for a status or a sign-off. If a decision below is still marked **Open**, the tasks that need it stop and report; the rest run.

## Decisions
- **D-Wn-1 <topic>.** The decision, and the options it was chosen over. Decided by <who>, <date>.
- **D-Wn-2 <topic>. Open.** Only if it truly can't be decided yet: the options, the recommended one, and which tasks wait on it.

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
