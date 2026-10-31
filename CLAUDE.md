# FitBud · notes for Claude Code

All rules are in AGENTS.md, shared with the Grok/Cursor planning bots. This file adds only what is specific to Claude Code.

@AGENTS.md

## Claude Code only

- **Running a batch:** Firoz launches one orchestrator cloud session ("Run batch Wn per docs/specs/batches/Wn.md"). The orchestrator starts one implementer session or subagent per lane, at most **3 at once** on one Max seat, and starts the next queued task when a slot frees.
- **Reviewer:** a fresh subagent per code PR, given the spec and the diff only (not the implementer's conclusions or summary). Visual check for UI tasks.
- **Models:** follow the spec's `model` field (`sonnet`, `opus`, or `opusplan` = opus plans, sonnet edits).
- **Usage limit:** at about 95% plan usage, start no new tasks; finish only what is in flight.
- **Batch report:** the orchestrator fills in the batch file's Report section at the end.
