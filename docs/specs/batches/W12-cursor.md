# W12-cursor · Cursor run for remaining W12 tasks

**Status:** Running. Launched 18 Nov 2026 (IST) by FitBud UI, from `main` at `58ac1b11` (or later).
**Authority:** this file for Cursor-owned work only. Claude owns [`W12.md`](W12.md) — never edit it from this run. W12b is finished ([`W12b.md`](W12b.md)); leave it alone.
**Repo rules:** `CLAUDE.md`, `AGENTS.md`. Design: `docs/design/v3/` (mocks win over older frames; record departures).
**Branch prefix:** `cursor/<task>-<slug>-db78`. One task, one PR, merge commits only.
**Concurrency:** at most **2** Cursor tasks at once (Claude uses up to 3 on the same runners). Never cancel or force-cancel any Actions run.
**Claude fence:** never push to, review, comment on, rebase or merge a `claude/` branch or PR. Open Claude PRs at launch: #460 (Z12-42), #483 (Z12-46), #484 (Z12-45), #485 (Z12-44 follow-up), #486 (Z12-51), #487 (Z12-29). Claude also keeps Z12-53, Z12-57, Z12-60.
**JS only:** native / Swift / Expo-SDK changes go under **Native items for Z12-57** below. No deploy. No repo-settings changes.

## Task list and status

| Task | Wait | Status | PR | Merge SHA | Grades / notes | Model |
|---|---|---|---|---|---|---|
| Z12-W12C-0 Ledger | — | in review (#488) | #488 | — | this file | lighter (docs) |
| Z12-43 Manual food logging | #460 (Z12-42) | blocked | — | — | mocks TR-26a–f; finding 7 toast | strongest |
| Z12-30 Delete account (web) | #487 (Z12-29) | blocked | — | — | fresh proof = Firebase `auth_time` (W6 follow-up) | lighter / sonnet |
| Z12-48 Live Activity (JS) | #484 (Z12-45) | blocked | — | — | rest to the second; finding 1 JS side | strongest |
| Z12-49 follow-up Ended-coaching tab bar | #484 (Z12-45) | blocked | — | — | small; tab bar must show on ended screen | lighter |
| Z12-52 Coach logs a meal | Z12-43 + #486 (Z12-51) | blocked | — | — | each What-changed option = own screen; Z12-42 sheet theme fix | sonnet / opus |
| Z12-58 Full device pass | Z12-57 (Claude) | blocked | — | — | F01–F29 + parity matrix + device checklist | strongest |
| Z12-59 prep | after Z12-58 | blocked | — | — | SHA, migrations, commands, smoke in `docs/tasks/manual-steps.md`; then mark ready for Z12-60 and stop | lighter |

## Merged-SHA ledger

| When (IST) | SHA | Via | Notes |
|---|---|---|---|
| 18 Nov 2026 (launch ~16:07 IST; #470 merge was earlier that day) | `58ac1b11` | #470 (already on main at launch) | Cursor run base |

*(Append each Cursor merge and each Claude merge that unblocks a Cursor task.)*

## Decisions (this run)

| ID | Decision | Reason | When |
|---|---|---|---|
| D-W12C-1 | Cursor edits only `W12-cursor.md` as its batch file; never `W12.md` | Handover from FitBud UI, 18 Nov 2026 | launch |
| D-W12C-2 | At most 2 Cursor implementers at once | Same runners as Claude (up to 3); handover rule | launch |
| D-W12C-3 | Strongest available model for Z12-43, Z12-48, Z12-58 and every fresh review; lighter for ledger and small follow-ups | Handover model rule | launch |

*(Add implementer decide-and-note choices here as they arise.)*

## Native items for Z12-57

*(JS-only tasks that discover a native need: exact file, behaviour, and why the JS fallback is insufficient. Claude’s Z12-57 consumes this list.)*

| Source task | Item | Detail | JS fallback until then |
|---|---|---|---|
| — | — | — | — |

## Follow-ups

| Source | Finding | Owner | Notes |
|---|---|---|---|
| — | — | — | — |

*(Z12-58: Claude-owned-area findings go here with clear repro; Cursor-owned-area findings are fixed in this run.)*

## Usage wrap-up

- **Wrap at ~92%:** record what merged, what remains, models used.
- **Usage at last update:** not recorded yet (launch).

## Done when (Cursor side)

1. Every row in the task table is merged (or blocked only on Claude work still open), with PR + merge SHA filled.
2. Z12-59 prep is in `docs/tasks/manual-steps.md` and this ledger is marked **ready for Z12-60**.
3. Claude’s Z12-60 writes the W12 report; Cursor stops after the ready mark.

