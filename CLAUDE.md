# FitBud · notes for Claude Code

All rules are in AGENTS.md, shared with the Grok/Cursor planning bots. This file adds only what is specific to Claude Code.

@AGENTS.md

## Claude Code only

- **Running a batch:** Firoz launches one orchestrator cloud session ("Run batch Wn per docs/specs/batches/Wn.md"). The orchestrator starts one implementer session or subagent per lane. **There is no cap on how many run at once** (decided by Firoz, 3 Nov 2026 — see "No agent cap" below): run as many as the work genuinely supports, and start queued tasks as soon as their dependencies are met rather than waiting for a slot.
- **Reviewer:** a fresh subagent per code PR, given the spec, its batch decisions, the diff and (for UI) the frames and QA screenshots only, never the implementer's conclusions or summary. It does the visual check for UI tasks.
- **Models:** follow the spec's `model` field (`sonnet`, `opus`, or `opusplan` = opus plans, sonnet edits).
- **Batch report:** the orchestrator fills in the batch file's Report section at the end.

## No agent cap (Firoz, 3 Nov 2026)

This file used to cap the orchestrator at **3 concurrent implementers** and to say "at about 95% plan usage, start no new tasks". Both are removed. Firoz took this decision deliberately, after weighing the alternatives during QA1:

- The cap existed on the assumption that a Max seat's usage would be consumed quickly by parallel agents. Through W3 and QA1 that did not happen — usage stayed far below the level the cap was protecting, so it was costing wall-clock time for a risk that was not materialising.
- The options considered were: keep 3; raise it to roughly 6–8 for small independent tasks only; or remove the limit. Firoz chose removal, judging the usage headroom real and the sequencing cost concrete.

**Read this as both a permission and an instruction (Firoz, 3 Nov 2026).** It is a permission in that nothing now stops the orchestrator working at the full scale a batch genuinely needs — do not hold back, queue work behind an imaginary limit, or leave a ready task unstarted because several agents are already running. It is an instruction in that the judgement moves from the rule to you: every agent must earn its place.

Spawn one when it genuinely makes the work better or faster — an independent lane, a fresh reviewer, a task that would otherwise sit behind something unrelated. Do not spawn one to look busy, to split a task a single agent should hold whole, or to parallelise work that is really sequential. One agent carrying a task end to end usually beats three handing it between them, and every agent costs tokens the owner pays for. Under-using the capability and over-spawning are both failures; neither is the safe default.

**What this does not license.** Parallelism is bounded by the work, not by the rule:

- **Two lanes never own the same file.** That constraint is in AGENTS.md and is unchanged. It, not a number, is what decides how much can run at once.
- **Memory is the real limit, not shared state (updated 11 Nov 2026, W9 planning PR, from the W8 report).** `pnpm db:reset` and the API use `--persist-to .wrangler/state`, which is relative, so **each worktree has its own local D1**; worktrees do not reset each other's seed. What does collide is CPU and memory: in W8, three e2e/capture lanes plus four agents caused an out-of-memory container restart. Run **at most two** concurrent e2e or capture sessions (Playwright e2e, visual captures, anything that boots the API and web together), for example behind two `flock` lock files. Start background servers with `flock -o` or `setsid … 3>&-` so they don't inherit the lock, use distinct ports per worktree, and kill everything a worktree started when it finishes. Parallelise everything else freely.
- **More agents can be slower.** Past roughly half a dozen concurrent heavy tasks the container contends with itself. Judge by what the work needs, and prefer fewer agents doing whole tasks over many agents colliding.

Reviewers were never covered by the cap and still are not: every code PR gets its own fresh reviewer, and those run alongside implementers.

