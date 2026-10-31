# Specs and batches

This folder is where planning (Firoz and the Grok/Cursor bots) hands work to the coding agents (Claude Code cloud sessions).

- **Task spec:** `docs/specs/<ID>.md`, one per task, from [_TEMPLATE.md](_TEMPLATE.md). It must be self-contained.
- **Batch file:** `docs/specs/batches/Wn.md`, one per batch, from [batches/_TEMPLATE.md](batches/_TEMPLATE.md). It lists lanes, order and decisions.

## Flow

0. **Input:** [docs/tasks/beta-tasklist-v14.md](../tasks/beta-tasklist-v14.md) for the beta. Task list v13 stays the master list for post-beta work.
1. **Bots write specs.** They commit the specs and the batch file. Bots never trigger Claude: no `@claude` comments, no API calls on the subscription.
2. **Planners write the decisions in.** The bots write each decision as a plain statement in the batch file and the spec ("decided by <who>, <date>"), taking the recommended option when nobody has said otherwise. There are no checkboxes, no Ready status and no sign-off step.
3. **Firoz reads the batch file and specs, and launches one orchestrator cloud session** with something like "Run batch W1 per docs/specs/batches/W1.md". That message is the go: Firoz only launches a batch he is happy with. The orchestrator does not check a status or look for ticks. The orchestrator:
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
- There is no human approval step, before or during a batch (Agents.md, 30 Oct). Decisions go into the spec before launch; Firoz reading the docs and launching the batch is the only go; he reviews the finished batch.
- If a decision is still written as **Open** when the batch runs, only the tasks that need it stop and report. The rest of the batch runs.
