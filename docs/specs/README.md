# Specs and batches

This folder is where planning (Firoz and the Grok/Cursor bots) hands work to the coding agents (Claude Code cloud sessions).

- **Task spec:** `docs/specs/<ID>.md`, one per task, from [_TEMPLATE.md](_TEMPLATE.md). It must be self-contained.
- **Batch file:** `docs/specs/batches/Wn.md`, one per batch, from [batches/_TEMPLATE.md](batches/_TEMPLATE.md). It lists lanes, order and decisions.

## Flow

0. **Input:** [docs/tasks/beta-tasklist-v14.md](../tasks/beta-tasklist-v14.md) for the beta. Task list v13 stays the master list for post-beta work.
1. **Bots write specs.** They commit the specs and the batch file. Bots never trigger Claude: no `@claude` comments, no API calls on the subscription.
2. **Firoz approves the batch.** He ticks "Decisions needed" and sets Status to Approved.
3. **Firoz launches one orchestrator cloud session** with something like "Run batch W1 per docs/specs/batches/W1.md". The orchestrator:
   - starts one implementer session per lane (at most 3 at once);
   - starts a reviewer session per PR (diff vs spec, plus the visual check for UI);
   - sends back at most one fix round, then re-scopes smaller;
   - merges under the working rules in CLAUDE.md;
   - fills in the batch report.
4. **Firoz reviews the batch report** and the screenshots in `docs/qa/`, and does the manual steps listed there.

## Rules

- Two tasks in the same batch never own the same file.
- If a frame or decision is missing, the agent stops and asks. It never guesses.
- Confluence is reference only. Paste what matters into the spec's Context section.
- The spec's `approvals` field records any Agents.md "Human approval required" item Firoz has approved.
