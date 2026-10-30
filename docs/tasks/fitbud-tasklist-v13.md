# FitBud · task list (v13)

Updated Fri 30 Oct 2026, 19:50 IST (v13: beta cut, spec rules, live PR check at 19:45 IST). Earlier header follows: PR states as of 14:05 IST, re-checked on GitHub ([thefitbud/thefitbud](https://github.com/thefitbud/thefitbud)) at 15:00 IST (see the Done / Ready to merge / In review tables).

## Changes in v2 (v10 → v11, 30 Oct)

Old v10 line → new text. These apply the audit (W1–W10, W13–W18; W11/W12 dropped per Firoz) and Firoz's clarification edits 1–60. PR states were re-checked live on GitHub at 15:00 IST.

- L1 `(v10)` → `(v11)`. L3: updated 30 Oct; PR states as of 14:05 IST.
- L7–18 Snapshot recount: 234 tasks (was 215). Done 34, Ready to merge (blocked) 8, In review (QA recheck) 2, In review (on hold) 8, In progress 1, Ready 151, Ready (later) 2, On hold 25, Dropped 3. Waiting on design is now 0 (S4b is on hold).
- L20: added the definition of "Ready to merge (blocked)" and the note that stacked PRs only get CI once retargeted to main.
- L22–39 Done: added merge dates/SHAs to existing rows; added MD1 #16, SEED #17, IMPL-1 #18 (22 Oct); added H4, H3b and the 30 Oct merges QS1, HM4, HM5, QS2, API1, CE1, CE2, AD1, FK1, PK1, ED1, LT1, TS1, NA1, RL1a. P2 → "check 5 iPad 44 px FAILED, so TW-G is NOT accepted".
- L41–72 Ready to merge: removed the 16 merged rows. QS3 → blocked (conflict); QS4 → waits for #28; CE3 → HOLD for IP1b #47; QS5/QS6/EC1a → wait for #31; DR1 → HOLD with #38 and DIRTY; RL1b → DIRTY. DR2 (L62) and EC1b (L61) moved to In review (QA recheck).
- L75–78 Merge order: rewritten for the state after 30 Oct.
- L84–91 In review: added DR2 and EC1b; I1a/IP1a marked BEHIND main; DV1 → on hold, draft, do-not-merge, built on QS1.
- L93–103 Waiting: added Phase 10 on hold, D-new design questions, CF1 In progress, OB4 Ready (later); S4b → On hold.
- L111 H4 backlog row → replaced by BR1 (H4 is Done). L452–458 H4 → Done (ruleset "main" active).
- L117 P1: added the rebuild-to-21-Oct-mockups gate note. L491 P3: added MD1 capture and lock-frame gaps.
- New Phase 1 rows: B0L, MBR, MCD. New Phase 5 rows: platform-blockers note plus AU1, AU2, I7, I8, I9, OB1–OB4, CF1. New Phase 11 rows: X1b, X6.
- L287 / L1490 Phase 10: S1a–S7 → On hold (in-person batch held by Firoz).
- L316 / L1583–1585 X2: API URL, predev and react-native-svg pin (15.8.0). L1589–1591 X3: Expo account (not Expo Go), credentials vaulted, "Needs decision" lines removed.
- L315 / L1580 X1: #59 merged; branch is 127 behind main, merge main in first. L505 P5 / L1580: "WAITING ON FIROZ" → "Frames locked 28 Oct (D9)".
- L344 Working rules: added rule 9 (Firoz 30 Oct autonomous-merge rules).
- L374 / L388 v9 changelog: DR2/EC1b "QA passed" claims annotated as corrected.
- Appendix A, merged tasks: status → Done with merge date/SHA; stale "stack …, on #N" notes → "merged to main"; H1/H2 relaunch notes, H3 retarget/H4-brief bullets, H3b fold note and "Ready to merge on Firoz's go-ahead" (QS6, EC1a) removed.
- L695 seed chain: "(DV1 was built on QS1, not QS5)". L978 DV1: depends on QS5 → built on QS1, base main. L920/L971 NA1/ED1: dependency merge notes.
- L1150 F4a: Farhan item done once #28 merges. L1220–1221 I2e: thoran → beans-thoran; N03 moong-dal-dhuli at 1.7–2× portion, or drop the Jain label. L1237 I2d: → "See BR1". L1261 I6: blocked by AU1, AU2, I7, I9, CF1 secrets.
- Appendix B: D8 time 04:43 UTC → 10:13 IST; D10 → Done; added D-new (open design questions).
- Appendix C: frames 05 and 31 Rebuild → Built (F1b–F1e PRs).
- I9 → Dropped (fix already done 18 Oct in b5e4278).
- Not changed (per Firoz): T1a / frame 04 and G11 / frames 93, 95. (v12: T1a still unchanged; frames 93 and 95 moved to T5b/T5c.)
- ID note: the clarification's new "X5" (device guide) is added as **X6**, because X5 is already the seed plan_versions bug.

## Changes in v4 (v12 → v13, 30 Oct)

These are the final-pass edits before the list goes to the coding agent. GitHub was checked live at 19:45 IST (all PRs and branches in thefitbud/thefitbud).

- L1 `(v12)` → `(v13)`. Snapshot recount: 250 tasks (was 240). Done 54, Ready to merge (blocked) 0, In review (QA recheck) 0, In review (on hold) 2, In progress 1, Ready 162, Ready (later) 3, On hold 24, Dropped 4.
- Live PR check → Done (merged 30 Oct, IST): QS3 #28, QS4 #30, I1a #39 (migration 0030), I2a #41 (migration 0031), IP1a #44, IP1b #47, CE3 #31, QS5 #33, QS6 #34, EC1a #36, DV1 #60, RL1b #63, X1 #66, DR1 #32, DR2 #38, I3 #46 (migration 0032), EC1b #37. The Ready to merge and In review tables, the merge order and the Appendix A status lines were updated.
- New Done rows for untracked merged PRs: X1c #67 (legacy docs cleanup), SD1 #68 (repo rules aligned to 30 Oct decisions).
- BR1 → Done: GitHub shows only main, cursor/ac1a-…, cursor/ac1b-… and cursor/i3-meal-compliance-local-date-c6ae. design/today-rings-redesign is deleted.
- X1b → Dropped (superseded by #66; frames are at docs/design/mockups/png on main).
- Still open: #50 AC1a and #57 AC1b (both draft, do-not-merge). #50's base is the merged I3 branch and needs retargeting to main.
- P2: the IP1a/IP1b blockers are merged; re-run check 5 on main to accept TW-G.
- Added sections: Beta cut (must-have vs post-beta, closed beta only), W0 prerequisites, Spec rules (templates), and the W0–W4 batch proposal.
- New tasks: BT1 (TestFlight + Play closed testing), BT2 (basic crash reporting), BT3 (privacy + terms pages, links, store URLs), BT4 (D1 Time Travel + restore runbook), W0b (docs/qa/), W0c (docs/specs/ scaffolding). Before public release: BP1 (in-app account deletion), BP2 (automated backups), both Ready (later).
- DS5 Ready (later) → Ready (beta must-have). I5 renamed: transactional email, provider choice open, secrets per CF1. Transactional email was already covered by I5, so no duplicate task was added.
- Payments: B3a, B3b, W1c, W2a and W2c now state one rule: tracking only (amount, type, coaching mode, start/due dates, paid/unpaid, method Cash/UPI/Bank), no collection or gateway, no session counting. "Package" removed from the B3a and W2a titles, and "Other" removed from the method list.
- S1a migration number "0037" clashed with B4a; S1a now takes the next free number.

## Changes in v3 (v11 → v12, 30 Oct)

Applies Firoz's round-2 scope answers (30 Oct). Confluence pages were updated to match (see /workspace/fitbud-confluence-sync-report.md, Round 2).

- L1 `(v11)` → `(v12)`. Snapshot recount: 240 tasks (was 234). Ready 158 (was 151), On hold 24 (was 25).
- Payments (decision 1): still no in-app payment processing. Trainers track amount, subscription type, coaching mode, start and due dates, paid/unpaid status and method (cash/UPI/bank/other). Session counting is out of scope. B3a, B3b, W1c, W2a, W2c notes updated; Phase 10 stays On hold.
- Calendar (decision 2): external meeting links (Zoom/Meet etc.) on calendar entries are allowed; no in-app video or voice calling. Notes added to S1b, S3c, S6b (statuses unchanged).
- Coaching mode (decision 3): defined on the subscription version alongside type. B3a, B3b and W3b updated.
- Steps on Today (decision 4): keep the Steps chip on T1a (no ring).
- Steps target (decision 5): default 8,000, which the coach can change per client in Coaching setup. W3a, AC2 and D-new updated; the steps item moved out of D-new's open questions.
- 'configured' (decision 6): AC1a note to update the 4 Confluence pages (Workflows, DB, API, Current State) when it merges.
- Push (decision 7): X4 On hold → Ready (after X3); moved from the Waiting table to the Phase 11 backlog; Appendix C frames 27–30, 105–124 coverage "On hold (push)" → "Planned (push)".
- New tasks: B4a (daily_steps migration + steps target), B4b (steps sync/read API), T5a (HealthKit / Health Connect reading), T5b (frame 93 Steps setup, iOS), T5c (frame 95 Install Health Connect, Android), W6e (Progress: steps metric).
- G11 frames 93 and 95 → T5b and T5c (G11 keeps the other frames). Line "Not changed (per Firoz)" updated.

## Snapshot

| Status | Tasks |
|---|---|
| Done | 54 |
| Ready to merge (blocked) | 0 |
| In review (QA recheck) | 0 |
| In review (on hold) | 2 |
| In progress | 1 |
| Ready | 162 |
| Ready (later) | 3 |
| On hold | 24 |
| Dropped | 4 |
| **Total** | **250** |

**What the statuses mean.** Done means merged to main. Ready to merge means QA passed and the PR is ready for the merge bot. In review means a PR is open but still has `do-not-merge` (on hold means intentionally parked). Ready means not started yet and nothing blocks it. Ready to merge (blocked) means QA passed but the PR waits on a parent, a hold, or a merge conflict with main (reason in the Merge order). Stacked PRs only get CI once retargeted to main.

## Beta cut

**The beta is closed.** It is distributed only through TestFlight (internal and external testers) and a Google Play **closed** testing track. There is no public App Store release and no Play open or production track until the "Before public release" group is done.

**Must-have (beta)**: these and their dependency chains. Everything not listed here is **Post-beta**.

| Area | Must-have IDs | Dependency chain (all required) |
|---|---|---|
| Prerequisites | W0b, W0c (X1 done) | W0b → W0c |
| Real sign-in | AU1, AU2 | AU1 → AU2 |
| Staging deploy | I6 (On hold until its chain is done), CF1 (Firoz) | I1b → I8; I2b → I2f → I2e → I2c → I2d → I4a → I4b → I4c → I5; I7; AU2; CF1 Worker secrets → I6. Basic logs: I4a → OB1 → OB2 |
| Transactional email | I5 | I4c → I5 (provider choice open; secrets via CF1) |
| Push + reminders | X4 (split into one-notification tasks) | X2 → X6 → X3 → X4; server side needs AU2 (PUSH_PROVIDER_MODE) and the I6 staging deploy |
| TestFlight + Play closed testing | BT1 | X2 → X6 → X3 → BT1; BT3 (privacy URL) |
| Basic crash reporting | BT2 | X3 + I4a → BT2 |
| Privacy policy + terms | DS5, BT3 | D7 (done) → DS5 → BT3 |
| D1 Time Travel + restore steps | BT4 | I4a → BT4 |

Note: I2e (demo seed remap to library 2026.10.9) is on the must-have list only because I2c depends on it. If the chain can be reordered so that I2c no longer needs I2e, I2e moves to post-beta.

**Post-beta**: all other Ready, Ready (later) and On hold tasks. This includes all demo-seed polish (QS7, AL1, F5, seed spot-checks), the redesign phases 2–4 and 6–9 (including the steps tasks B4a, B4b, T5a–T5c and W6e, and the payment-tracking tasks B3a–W2c), Phase 10, the Phase 12 gap buckets, OB3, OB4 and P-series QA. The two open PRs (#50 AC1a, #57 AC1b) also stay post-beta unless Firoz pulls them in.

**Before public release** (after the beta, before any public listing): BP1 in-app account deletion and BP2 automated backups.

## W0 prerequisites

- Locked mockup frames on main: **done**. #66 (X1) merged on 30 Oct at 18:00 IST, so the frames are at docs/design/mockups/png with the index in docs/design/README.md. The design/today-rings-redesign branch no longer exists (checked live at 19:45 IST), so no further PR is needed.
- QA reports go in docs/qa/ on main (W0b). docs/qa/ does not exist on main yet.
- Specs scaffolding in docs/specs/ (W0c).

## Spec rules

Confluence is **reference only**. The repo spec is the source the coding agent builds from.

1. Each task has one self-contained spec at `docs/specs/<ID>.md`. The agent must not need any other doc to do the task, other than the frames and code it names.
2. Each batch has one batch file at `docs/specs/batches/Wn.md`, listing the lanes, the order and what Firoz reviews.
3. Frontmatter fields are id, depends_on, lane, files_owned, frames + viewport, model and size. Two tasks in the same batch never own the same file.
4. The sections are Outcome, Gap list, Acceptance criteria, Out of scope, Tests to add, Visual check and Stop conditions. If a frame or decision is missing, stop and ask; don't guess.

Task spec template (`docs/specs/<ID>.md`):

```markdown
---
id: BT3
depends_on: [DS5]
lane: web
files_owned: [apps/trainer-web/src/pages/legal/**]
frames: [{ frame: "DS5-legal", viewport: "1440x900" }, { frame: "DS5-legal", viewport: "393x852" }]
model: <agent model>
size: S
---
## Outcome
One or two sentences on what the user can do when this is merged.
## Gap list
- What exists on main today vs the frame/decision (file:line where useful).
## Acceptance criteria
- [ ] Observable, testable statements.
## Out of scope
- Explicit exclusions (e.g. no payment collection, no session counting).
## Tests to add
- Unit/integration/e2e names and what each asserts.
## Visual check
- Frames + viewports to compare; capture to docs/qa/<ID>/.
## Stop conditions
- Stop and ask if a frame is missing, a decision is open, or a file outside files_owned must change.
```

Batch file template (`docs/specs/batches/Wn.md`):

```markdown
# Wn · <name>
## Lanes
| Lane | Tasks (in order) | Files owned |
|---|---|---|
## Order
1. Merge order, including stacked PRs and what may run in parallel.
## What Firoz reviews
- The PRs, QA reports in docs/qa/, and manual steps (secrets, store consoles) he must do.
```

**Proposed beta batches**

| Batch | Lanes and tasks | What Firoz reviews |
|---|---|---|
| W0 | Repo: W0b → W0c | docs/qa/ and docs/specs/ layout; the W1 batch file |
| W1 | API: AU1 → AU2; API-perf: I1b → I8; Infra: I7 | Sign-in on a staging-like env; the DO migration |
| W2 | Seed: I2b → I2f → I2e → I2c → I2d; Env: I4a → I4b → I4c; Design: DS5 | Library seed numbers; wrangler envs; legal page frame |
| W3 | API: I5, OB1 → OB2, BT4; Web: BT3; Ops (Firoz): CF1 secrets → I6 | Email provider choice + domain; first staging deploy; restore rehearsal |
| W4 | Mobile: X2 → X6 → X3 → X4 (split) ; BT2; then BT1 | Dev build on phones; push on devices; TestFlight + Play closed-test invites |

## Done

| ID | Task | PR |
|---|---|---|
| L1 | Restore the local app on main |  |
| MD1 | MD1 trainer mobile: Attention, Clients, status, check-in review | [#16](https://github.com/thefitbud/thefitbud/pull/16) merged 22 Oct (ca1b5c2); verification via P3 |
| SEED | Realistic trainer demo world | [#17](https://github.com/thefitbud/thefitbud/pull/17) merged 22 Oct (a66facc) |
| IMPL-1 | MD1 fixes + Mark reviewed redesign + Home quiet refresh | [#18](https://github.com/thefitbud/thefitbud/pull/18) merged 22 Oct (25511d4) |
| H1 | Fast API test setup (realistic seed made hooks ~8x slower) | [#21](https://github.com/thefitbud/thefitbud/pull/21) merged 28 Oct (cdc01cc) |
| H2 | Fix the 11 lint errors | [#20](https://github.com/thefitbud/thefitbud/pull/20) merged 28 Oct (e136d44) |
| H3 | Minimal GitHub Actions CI on PRs to main | [#35](https://github.com/thefitbud/thefitbud/pull/35) merged 28 Oct (5738569) |
| H4 | Branch protection on main (require CI) | ruleset "main" active (no PR) |
| H3b | CI: concurrency group by commit SHA on main pushes | [#49](https://github.com/thefitbud/thefitbud/pull/49) merged 30 Oct (632603a) |
| P2 | TW-G narrow recheck on main (5 checks) (recheck done; check 5 iPad 44 px FAILED → IP1a/IP1b, which merged 30 Oct (#44, #47); re-run check 5 on main to accept TW-G) |  |
| HM1 | Bug: focus jumps to the panel's X while typing a note | [#19](https://github.com/thefitbud/thefitbud/pull/19) merged 28 Oct (182a557) |
| AP1 | Bug: Assign plan modal steals focus on re-render | [#43](https://github.com/thefitbud/thefitbud/pull/43) merged 28 Oct (3f4aa32) |
| F1a | API: Mark reviewed state + server-side Undo | [#45](https://github.com/thefitbud/thefitbud/pull/45) merged 28 Oct (218f776) |
| F1b | Needs you list + Reviewed section | [#48](https://github.com/thefitbud/thefitbud/pull/48) merged 28 Oct (856b17d) |
| F1c | Needs you swipe → Mark reviewed + Undo toast | [#61](https://github.com/thefitbud/thefitbud/pull/61) merged 28 Oct (c64e482) |
| F1d | Review sheet: item navigation | [#64](https://github.com/thefitbud/thefitbud/pull/64) merged 28 Oct (ba605b8) |
| F1e | Review sheet: resolved + all resolved | [#65](https://github.com/thefitbud/thefitbud/pull/65) merged 28 Oct (b5dee28) |
| N1b | Mobile: client name in trainer notification list + push copy | [#42](https://github.com/thefitbud/thefitbud/pull/42) merged 28 Oct (22f0798) |
| W1a | Client workspace tabs consistent everywhere | [#40](https://github.com/thefitbud/thefitbud/pull/40) merged 28 Oct (8f941be) |
| QS1 | Seed bug: Imran's and Rajesh's meal quantity too large → scheduler error every run | [#22](https://github.com/thefitbud/thefitbud/pull/22) merged 30 Oct (9cfdc2d) |
| HM4 | Bug: Home single-key shortcuts (a / n / o) fire from stray typing | [#23](https://github.com/thefitbud/thefitbud/pull/23) merged 30 Oct (35402da) |
| HM5 | Bug: Home selection follows the client, not the row index | [#29](https://github.com/thefitbud/thefitbud/pull/29) merged 30 Oct (0ba2db6) |
| QS2 | Seed bug: timestamps after now or after the client's end date | [#24](https://github.com/thefitbud/thefitbud/pull/24) merged 30 Oct (50d5fcc) |
| API1 | Bug: exceptions closed at coaching end get no resolved time | [#25](https://github.com/thefitbud/thefitbud/pull/25) merged 30 Oct (d4493ef) |
| CE1 | Ended client: Coaching setup page read-only | [#26](https://github.com/thefitbud/thefitbud/pull/26) merged 30 Oct (6b4d8b7) |
| CE2 | Ended client: hide or relabel configure links | [#27](https://github.com/thefitbud/thefitbud/pull/27) merged 30 Oct (2ff79ad) |
| AD1 | Bug: ask drawer has no focus trap | [#51](https://github.com/thefitbud/thefitbud/pull/51) merged 30 Oct (9819c9d) |
| FK1 | Test bug: PRAGMA foreign_key_check assertions can never fail | [#52](https://github.com/thefitbud/thefitbud/pull/52) merged 30 Oct (9ded251) |
| PK1 | Bug: “Plan ≥ kcal” shows raw sums about 1e6 too high | [#53](https://github.com/thefitbud/thefitbud/pull/53) merged 30 Oct (9da7874) |
| ED1 | Bug: focus after Mark reviewed in the exception drawer | [#54](https://github.com/thefitbud/thefitbud/pull/54) merged 30 Oct (269e6f9) |
| LT1 | Local wrangler traces choice on API start | [#55](https://github.com/thefitbud/thefitbud/pull/55) merged 30 Oct (4ba3237) |
| TS1 | Test /tmp sweep hardening | [#56](https://github.com/thefitbud/thefitbud/pull/56) merged 30 Oct (68049cd) |
| NA1 | Bug: Needs attention summary double-counts (“Missed 10 meals · +9 more”) | [#58](https://github.com/thefitbud/thefitbud/pull/58) merged 30 Oct (a0145ff) |
| RL1a | API: closedReason on the Exception DTO | [#62](https://github.com/thefitbud/thefitbud/pull/62) merged 30 Oct (4d9080a) |
| QS3 | Seed bug: overlays on meals and workouts whose window hasn't opened or closed | [#28](https://github.com/thefitbud/thefitbud/pull/28) merged 30 Oct 15:58 IST (9e6004f) |
| QS4 | Seed: already contains what the first read would create | [#30](https://github.com/thefitbud/thefitbud/pull/30) merged 30 Oct 16:07 IST (20bb6e1) |
| I1a | Migration 0030: perf indexes | [#39](https://github.com/thefitbud/thefitbud/pull/39) merged 30 Oct 16:14 IST (590cd7a) |
| I2a | Migration 0031: library schema | [#41](https://github.com/thefitbud/thefitbud/pull/41) merged 30 Oct 16:23 IST (f826389) |
| IP1a | iPad 44 px: Reminders panel close X + ⋯ menu items | [#44](https://github.com/thefitbud/thefitbud/pull/44) merged 30 Oct 16:32 IST (4eda771) |
| IP1b | iPad 44 px: Plan Versions toggle, Progress check-in links, Profile “Forgot it?” | [#47](https://github.com/thefitbud/thefitbud/pull/47) merged 30 Oct 16:36 IST (d97ee11) |
| CE3 | Ended client: Overview “Renewal · Open settings” + Progress “Open check-in settings” go to /configure | [#31](https://github.com/thefitbud/thefitbud/pull/31) merged 30 Oct 16:54 IST (a6cdcea) |
| QS5 | Seed timestamps: remaining ordering leftovers | [#33](https://github.com/thefitbud/thefitbud/pull/33) merged 30 Oct 16:59 IST (d304630) |
| QS6 | Seed: open coach asks ≥ window open + 1 h; overlays use the client's real timezone | [#34](https://github.com/thefitbud/thefitbud/pull/34) merged 30 Oct 17:18 IST (1739a9b) |
| EC1a | API: at coaching end also close detected/active/acknowledged exceptions (rule 3) | [#36](https://github.com/thefitbud/thefitbud/pull/36) merged 30 Oct 17:28 IST (71ba742) |
| DV1 | Seed: report clamps on the deviation path | [#60](https://github.com/thefitbud/thefitbud/pull/60) merged 30 Oct 17:41 IST (41cc68f) |
| RL1b | Bug: “Resolved by you” shown for system or auto resolutions | [#63](https://github.com/thefitbud/thefitbud/pull/63) merged 30 Oct 17:50 IST (53529e3) |
| X1 | Design PR: merge design/today-rings-redesign after lock | [#66](https://github.com/thefitbud/thefitbud/pull/66) merged 30 Oct 18:00 IST (5ae527b) |
| DR1 | Bug: the exception drawer's own n shortcut fires within ~16 ms of closing | [#32](https://github.com/thefitbud/thefitbud/pull/32) merged 30 Oct 18:49 IST (45105e1) |
| DR2 | Bug: Esc then browser Back reopens a stuck drawer | [#38](https://github.com/thefitbud/thefitbud/pull/38) merged 30 Oct 18:59 IST (256caac) |
| I3 | Migration 0032: meal_compliance.local_date + /clients window | [#46](https://github.com/thefitbud/thefitbud/pull/46) merged 30 Oct 19:21 IST (ee04c87) |
| EC1b | API: block acknowledge/resolve on ended relationships (server-side read-only, rule 5) | [#37](https://github.com/thefitbud/thefitbud/pull/37) merged 30 Oct 19:26 IST (0bb42d3) |
| BR1 | Delete merged branches (local + remote) | Done on GitHub by 30 Oct 19:45 IST: only main, the AC1a/AC1b branches and cursor/i3-meal-compliance-local-date-c6ae (base of open #50) remain |
| X1c | Docs: remove legacy UI references and stale decisions | [#67](https://github.com/thefitbud/thefitbud/pull/67) merged 30 Oct 18:23 IST (5b06db2) |
| SD1 | Docs: align repo rules with 30 Oct scope decisions | [#68](https://github.com/thefitbud/thefitbud/pull/68) merged 30 Oct 19:31 IST (50556c8) |

## Ready to merge

None as of 30 Oct 19:45 IST. All eight v12 rows (QS3, QS4, CE3, DR1, QS5, QS6, EC1a, RL1b) merged on 30 Oct.

**Merge order**
- Stacks A and B and the RL chain are fully merged (30 Oct).
- Remaining open PRs: #50 AC1a (draft, do-not-merge, base cursor/i3-meal-compliance-local-date-c6ae, whose PR #46 has merged, so retarget to main first) ← #57 AC1b (draft, do-not-merge, base #50's branch).
- Then delete cursor/i3-meal-compliance-local-date-c6ae (ask first).

## In review

| ID | Task | PR | Status |
|---|---|---|---|
| AC1a | Migration 0033: remove “configured” (D12 locked) | [#50](https://github.com/thefitbud/thefitbud/pull/50) | In review (on hold) · draft · base is the merged I3 branch, retarget to main |
| AC1b | API: atomic Activate from draft + immediate schedule + discard route | [#57](https://github.com/thefitbud/thefitbud/pull/57) | In review (on hold) |

## Waiting, on hold, or needs a decision

| ID | Task | Status | Note |
|---|---|---|---|
| AL1 | Seed: remove the poha and pav-bhaji serving allowlist | On hold | Source: /workspace/qa/QA-PR22.md P4. On hold until realistic servings exist. |
| EC1g | Align the meal lock read model with the server's after-resolve rule (rule 6) | On hold | Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations). |
| F5 | Capture scripts + seed spec → docs/design paths | On hold |  |
| I6 | Deploy per env | On hold |  |
| S4b | Log during/after a session (web/iPad) | On hold | Phase 10 hold; also still needs DS6 frames (D15). |
| Phase 10 | S1a–S7, in-person IP-01…IP-16 | On hold | On hold by Firoz (in-person batch). |
| D-new | Design questions open with Firoz | Needs decision | See Appendix B D-new. |
| CF1 | Firoz's manual Cloudflare steps | In progress | Paid + budget alert done 30 Oct; secrets deferred to first staging deploy; rotate Confluence credentials. |
| OB4 | Later observability (Crashlytics, error boundary, slow-D1, request ids) | Ready (later) |  |

## Backlog (not started), by phase

### Phase 0 · Repo health

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|

| W0b | QA reports in docs/qa/ | Docs | Repo | — | — | S |
| W0c | Spec scaffolding in docs/specs/ (templates + W1 batch) | Docs | Repo | — | W0b | S |

### Phase 1 · QA, specs and design (me)

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| P1 | Full QA pass on main → gap lists for G1–G11 and every Rebuild batch. Includes "rebuild screens to the 21 Oct mockups" as the gate for Phase 2–12 UI tasks (design note; frame decisions per Appendix B) | QA | All | all frames in the coverage matrix | L1 | M |
| P3 | MD1 narrow recheck on main | QA | Trainer + trainee mobile | 17, 18, 19, 73, 74, 75, 10, 101, 07, 86 | L1 | S |
| P4 | Rewrite MD2 spec against locked decisions | Spec | Trainer mobile | 46–61, 62–72 | D4 | S |
| P5 | Design index status + one brief per agent task | Spec | — | README index | D9 | S |
| P6 | Per-batch gap-list QA gate (before every coding batch) | QA | All | the batch's frames | L1 | S |
| DS1 | DESIGN: Home full views (web + iPad) | Design | Trainer web, iPad | new frames: Needs attention, Renewals due, Asked you on WhatsApp | — | M |
| DS2 | DESIGN: side panel per client, with bulk actions (D11 locked) | Design | Trainer web, iPad | revises 02 ×3, 131, 132, 133 (+193, 199) | — | M |
| DS3 | DESIGN: Activate confirmation dialog + sections-left rules (D12 locked) | Design | Trainer web, iPad | new modal (first-time + changes-only); 149 / IP-07 footer copy | — | S |
| DS4 | SPEC: Home row targets and destinations | Spec | Trainer web, iPad | 02, 135, 191 (annotations) | D14 | S |
| DS6 | DESIGN: session logging frames (web + iPad) | Design | Trainer web, iPad | new frames (replace IP-03/04/06 reference) | — | S |
| DS7 | DESIGN: read-only vs disabled field frames (+ ended-client presentation CE6) | Design | Trainer web, iPad | 179 style; 148 (ended) | — | S |
| B0L | Batch 0 leftovers: mobile ISO dates on Today/Diet, workspace "Effective since" ISO date, Diet kcal vs meals mismatch, 28 raw enum labels | Bug | Trainee mobile, Trainer web | — | P3 | S |
| MBR | MB fix2 recheck (claimed 1 MATCH / 21 CLOSE) and MC narrow recheck | QA | Mobile | MB/MC frames | — | S |
| MCD | Verify MC clock-dependent API date tests are fixed (meant for MD, merged as #16) | QA | API | — | — | S |

### Phase 2 · Home & side panel (trainer web) — serialized, all touch HomePage.tsx

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| HM2 | Targeted updates on Home (no whole-page refresh) | Behaviour | Trainer web, iPad | 02, 135 | HM5 | M |
| HM3 | Whole-row click targets + correct destinations on Home rows | Behaviour | Trainer web, iPad | 02, 135, 191 | HM2, DS4 | S |
| SPB | API: bulk Reviewed / Resolve for one client's exceptions | Backend | API | — | F1a, DS2 | S |
| SP1 | Side panel v3: per-client list + item navigation | Changed screen | Trainer web | 02 default, 02 resolved | HM3, DS2 | S |
| SP1b | Side panel on iPad portrait | Changed screen | iPad | 193 | SP1 | S |
| SP2 | Side panel: resolve form + nudge limited | Changed screen | Trainer web | 02 resolve, 131 | SP1 | S |
| SP2b | Side panel: nudge waits for quiet hours | Changed screen | Trainer web | 199 | SP2 | S |
| SP3 | Side panel: read-only from Reviewed + item gone | Changed screen | Trainer web | 132, 133 | SP2 | S |
| SP4 | Side panel: multi-select + bulk Reviewed / Resolve + Undo | Changed screen | Trainer web, iPad | DS2 frames | SP3, SPB | M |
| HV1 | Home full view: Needs attention | New screen | Trainer web, iPad | DS1 frames | HM3, DS1 | S |
| HV2 | Home full view: Renewals due | New screen | Trainer web, iPad | DS1 frames | HV1, D14 | S |
| HV3 | Home full view: Asked you on WhatsApp | New screen | Trainer web, iPad | DS1 frames | HV1 | S |
| HV4 | Check-ins card → Check-ins inbox filtered To review | Changed screen | Trainer web, iPad | 166, 167 | HV3 | S |

### Phase 2c · QA follow-ups (QA-PR19 to QA-PR28, 22 Oct)

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| CE4 | Ended client: Configure page title, copy and status | Bug | Trainer web, iPad | 148 (ended state) | CE2 | S |
| CE5 | Configure page refreshes when a relationship ends while it's open | Behaviour | Trainer web, iPad | 148 | CE4 | S |
| CE6 | Ended client: proper read-only presentation (frame 179 style) + screen-reader names | Changed screen | Trainer web, iPad | 148 (ended), 179 | CE5, DF1, DS7 | S |
| W8 | Ended client: Onboarding “WhatsApp client” draft + Reminders drawer footer copy | Bug | Trainer web, iPad | 208 (ended), 181 | CE2, IP1a | S |
| W1e | Client header ⋯ menu accessibility | Bug | Trainer web, iPad | 208, 208b | IP1a | S |
| QS7 | Seed: remaining hard-coded 'Asia/Kolkata' literals in history.ts + close−30m test | Bug | API seed | — | QS6 | S |
| A2 | Seed: workout/meal activity before relationship start on the start day | Bug | API seed | — | QS7 | S |
| C3 | Seed: checkins.updated_at before submitted_at | Bug | API seed | — | QS7 | S |
| C6 | Seed: Rohan's measurements observed before the check-in window | Bug | API seed | — | QS7 | S |
| E2 | Seed: overdue_meal detected before window close | Bug | API seed | — | QS7 | S |
| R1 | Seed: relationships with created_at = now but started earlier | Bug | API seed | — | QS7 | S |
| X5 | Seed: plan_versions published_at before created_at | Bug | API seed | — | QS7 | S |
| X7 | Seed: subscription_versions 30 min before relationship creation | Bug | API seed | — | QS7 | S |
| HB1 | Bug: Escape right after a drawer close adds a duplicate '/' history entry | Bug | Trainer web, iPad | 02 panel | DR2 | S |
| LB1 | Copy: “View reminder settings” → “View reminder history” | Bug | Trainer web | 02 panel | DR2 | S |
| VT1 | Verify: demo-seed determinism test timeout under load | QA | API tests | — | H1 | S |
| DEP1 | 64 dependency advisories (hono, drizzle, vite and others) | Infra | Repo | — | — | S |
| DK1 | 15 drinks capped at 100 g/ml: add cup or glass servings | Backend | API seed, library | 172 (data) | I2b | S |
| DF1 | Disabled-field styling (trainer web) | Changed screen | Trainer web, iPad | 179 | DS7 | S |
| CE7 | Ended client: hide Mark reviewed / Resolve / Nudge in ExceptionDrawer | Bug | Trainer web, iPad | 02 panel, 179 | EC1b | S |
| EC1c | API: client log-time bounds (rule 2) | Bug | API | — | EC1b | S |
| EC1d | API: logs timestamped before ended_at not honoured for coaching_ended exceptions after reactivation (rule 1) | Bug | API | — | API1, EC1c | S |
| EC1e | Seed: Kavya's coaching_ended exception resolved_at = ended_at (rule 4, seed part) | Bug | API seed | — | API1 | S |
| EC1f | Migration: backfill resolved_at for coaching_ended rows with NULL resolved_at (rule 4) | Migration | API | — | API1 | S |

### Phase 3 · Finish IMPL-1 + MD1 leftovers (mobile)

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| F1f1 | Sub-sheets: resolve confirm + nudge | Changed screen | Trainer mobile | 33, 34 | F1e | S |
| F1f2 | Sub-sheets: ⋯ actions + add note | Changed screen | Trainer mobile | 35, 36 | F1f1 | S |
| F1f3 | Resolved read-only + ended client | Changed screen | Trainer mobile | 37, 41 | F1f2 | S |
| F1f4 | Loading + item no longer available | Changed screen | Trainer mobile | 38, 39 | F1f3 | S |
| F1f5 | Offline: actions disabled | Changed screen | Trainer mobile | 40 | F1f4 | S |
| F1g | v3 trainer tab bar | Changed screen | Trainer mobile | 05 (tab bar) | F1b | S |
| F1h | Attention cards: names, “since” age, Mark answered Undo | Bug | Trainer mobile | 05 | F1b | S |
| F1j | Needs you: all clear + offline cached | Changed screen | Trainer mobile | 43, 44 | F1b | S |
| F1k | Needs you: couldn't load | Changed screen | Trainer mobile | 45 | F1j | S |
| F3a | Clients list + Ended filter | Changed screen | Trainer mobile | 17, 73 | P3, F1g | S |
| F3b | Client status | Changed screen | Trainer mobile | 18 | F3a | S |
| F3c | Ended client status | Changed screen | Trainer mobile | 74 | F3b | S |
| F3d | Check-in review + saved | Changed screen | Trainer mobile | 19, 75 | F4a | S |
| F3e | Nudge log + Today link | Bug | Trainer mobile, API | 34 | F1f1 | S |
| F4a | Seed quirks + seeded Rohan check-in | Backend | API seed | — | H1 | S |
| F4b | Trainee Workout tab current week | Bug | Trainee mobile | 10 | P3 | S |
| F4c | Next check-in after review | Bug | Trainee mobile | 101 | P3 | S |
| F4d | Diet log buttons + offline planned kcal | Bug | Trainee mobile | 07, 86 | P3 | S |

### Phase 4 · Client names in notifications

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| N1a | Web/iPad: client name in bell + Home activity lines | Bug | Trainer web, iPad | 123, 02 activity | HM2 | S |

### Phase 5 · Platform & performance (Firoz's AGENT_TASK)

_Platform blockers (checked against Cloudflare docs 30 Oct): (1) DO class must be SQLite-backed (I7), not fixed by Paid; (2) D1 50 queries/invocation on Free → 1,000 on Paid (now bought); (3) CPU 10 ms on Free → 30 s on Paid (now bought); (4) migration-chain fix: already done 18 Oct (b5e4278), I9 dropped; (5) real Firebase auth (AU1/AU2) blocks staging/prod sign-in._

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| I1b | Query fixes: /exceptions/attention batching, no whole-table reads, user_roles memo | Backend | API | — | I1a | M |
| I2b | Locked foods 2026.10.9 library seed | Backend | API seed | 172 (data) | I2a, D6 | M |
| I2f | Library tag fix: dal-lentil-curry-generic is not Jain | Backend | API seed | 172 (data) | I2b | S |
| I2e | Demo seed remap to library 2026.10.9 (D1 locked) | Backend | API seed | — | I2f, DV1 | M |
| I2c | Exercise base emitter (03b) with storage keys | Backend | API seed | 173 (data) | I2e | M |
| I2d | library-seed script: --remote guarded by --yes, chunking | Infra | API | — | I2c | S |
| I4a | wrangler.toml env.dev / staging / production | Infra | API | — | I2d | S |
| I4b | MEDIA_PREFIX + mediaKey helper | Backend | API | — | I4a | S |
| I4c | Deploy / migrate / seed scripts per env | Infra | API | — | I4b | S |
| I5 | Transactional email provider (ZeptoMail written; provider choice open: ZeptoMail / Cloudflare Email Service / Resend) | Backend | API | — | I4c | S |
| AU1 | Real Firebase ID token verification (jose + Google public keys) | Backend | API | — | — | S |
| AU2 | Refuse AUTH_MODE=test (and PUSH_PROVIDER_MODE=test, EMAIL_PROVIDER=dev_sink) outside local | Backend | API | — | AU1 | S |
| I7 | Durable Object migration: realtime class to SQLite (new_sqlite_classes) | Infra | API | — | — | S |
| I8 | D1 query budget per invocation + cron CPU | Backend | API | — | I1b | S |
| I9 | ~~Migration-chain fix~~ (Dropped: done 18 Oct, b5e4278) | Migration | API | — | — | — |
| OB1 | Workers Logs: [env.staging.observability] 100%, [env.production.observability] head_sampling_rate 0.2 | Infra | API | — | I4a | S |
| OB2 | Logging in scheduled/queue handlers; replace silent catch {} | Backend | API | — | OB1 | S |
| OB3 | Cloudflare error/usage alerts | Ops (Firoz) | Cloudflare | — | OB1 | S |
| CF1 | Firoz's manual Cloudflare steps (In progress) | Ops (Firoz) | Cloudflare | — | — | S |

### Phase 6 · Backend for the redesign

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| B1a | Migration 0034: load_kg / load_kind + parser + backfill | Migration | API | feeds 11, 11c | AC1a | M |
| B1b | Strength read model API | Backend | API | feeds 160e | B1a | S |
| B2a | Migration 0035: global check-in form v2 (D2 option A) | Migration | API | — | B1a | S |
| B2b | Standard question keys in form schema + validation | Backend | API | feeds 14, 171 | B2a | S |
| B2c | Progress metrics API by question key | Backend | API | feeds 160–161 | B2b | M |
| B3a | Migration 0036: payment records + subscription tracking fields | Migration | API | feeds 209–212, IP-08 | B2a | M |
| B3b | Client settings API: basic details + subscription edit | Backend | API | feeds 209–212 | B3a | M |
| B4a | Migration 0037: daily_steps + per-client steps target (default 8,000) | Migration | API | feeds 04, 93, 160 | B3a | S |
| B4b | Steps sync + read API (trainee writes, trainer reads) | Backend | API | feeds 04, 160 | B4a | S |

### Phase 7 · Trainee mobile

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| T1a | Today v3: empty + partial | Changed screen | Trainee mobile | 04 empty, 04 partial (iOS + Android) | F4d | S |
| T1b | Today v3: done + rest day | Changed screen | Trainee mobile | 04 done, 04 rest | T1a | S |
| T1c | Today v3: past day | Changed screen | Trainee mobile | 04 past | T1b | S |
| T1d | Today v3: skeleton + offline | Changed screen | Trainee mobile | 96, 104 | T1c | S |
| T2a | Banners over v3 Today: meal + coach note | Changed screen | Trainee mobile | 29, 29b | T1d | S |
| T2b | Check-in reviewed banner + reminders paused card | Changed screen | Trainee mobile | 113, 115 | T2a | S |
| T3a | Set entry: kg keypad + Bodyweight | Changed screen | Trainee mobile | 11, 11c | B1a | S |
| T3b | Light rest timer | Changed screen | Trainee mobile | 11b | T3a | S |
| T4 | Check-in with picked measurements | Changed screen | Trainee mobile | 14, 14c | B2b | S |
| T5a | Read steps from HealthKit / Health Connect + sync | Integration | Trainee mobile | — | B4b, X3 | M |
| T5b | Steps setup (iOS) | New screen | Trainee mobile | 93 | T5a | S |
| T5c | Install Health Connect (Android) | New screen | Trainee mobile | 95 | T5a | S |

### Phase 8 · Trainer web & iPad

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| W1b | Client header ⋯ menu | New screen | Trainer web, iPad | 208, 208b | W1a, CE2, IP1a, W1e | S |
| W1c | Client settings overview | New screen | Trainer web, iPad | 209, 209b | W1b, B3b | S |
| W1d | Edit basic details drawer | New screen | Trainer web | 210 | W1c | S |
| W2a | Edit subscription + validation | New screen | Trainer web | 211, 211b | W1d | S |
| W2b | Client settings: ended read-only | New screen | Trainer web | 212 | W2a | S |
| W2c | Payment records (tracking only) | New screen | Trainer web | IP-08 | W2b | S |
| W3a | Plan › Coaching setup (no basics/subscription, editable targets) | Changed screen | Trainer web, iPad | 148, 149 | W2a, CE5 | M |
| AC2 | Coaching setup: Save draft + Activate coaching, confirmation dialog, Save as vN+1 | Changed screen | Trainer web, iPad | 148, 149 footers + DS3 dialog | W3a, AC1b, DS3 | S |
| W3b | Coaching mode section (hybrid) | New screen | Trainer web | IP-07 | AC2 | S |
| W3c | Plans: one current program card | Changed screen | Trainer web | 150 | W1a, IP1b | S |
| W4a | Client Check-ins tab + empty | Changed screen | Trainer web | 162, 162b | W1a | S |
| W4b | Check-ins tab: ended + iPad | Changed screen | Trainer web, iPad | 162c, 192b | W4a | S |
| W5a | Check-in form builder standard questions | Changed screen | Trainer web | 171, 171b | B2b | S |
| W5b | Overview Reminders card + Reminders drawer | Changed screen | Trainer web | 03c, 181 | W1a | S |
| W6a | Progress: metric picker + weight | Changed screen | Trainer web, iPad | 160 | B2c, IP1b | S |
| W6b | Progress: ratings + measurements | Changed screen | Trainer web | 160b, 160c | W6a | S |
| W6c | Progress: compare two metrics | Changed screen | Trainer web | 160d | W6b | S |
| W6d | Progress: strength from logs | Changed screen | Trainer web | 160e | W6c, B1b | S |
| W6e | Progress: steps metric | Changed screen | Trainer web, iPad | 160 | W6a, B4b | S |
| W7a | Progress: photos compare | Changed screen | Trainer web | 160f | W6d | S |
| W7b | Progress: sparse + empty | Changed screen | Trainer web | 160g, 161 | W7a | S |
| W7c | Progress: ended + loading | Changed screen | Trainer web | 160h, 160i | W7b | S |

### Phase 9 · Trainer mobile quick jobs

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| M1a | More + notifications off | Changed screen | Trainer mobile | 51, 53 | F1g, P4 | S |
| M1b | Notification settings + offline save failed | Changed screen | Trainer mobile | 52, 58 | M1a | S |
| M1c | Android 13 permission prompt | Changed screen | Trainer mobile | 54 | M1b | S |
| M2a | Profile + sign out confirm | Changed screen | Trainer mobile | 55, 57 | M1a | S |
| M2b | Help (no mail app sheet) | Changed screen | Trainer mobile | 56 | M2a | S |
| M2c | Role select + switch-role sheet | Changed screen | Trainer mobile | 59, 61 | M2b | S |
| M2d | Unsupported role | Changed screen | Trainer mobile | 60 | M2c | S |
| M3a | Check-ins quick list: To review + Overdue | Changed screen | Trainer mobile | 46, 47 | F1e, P4 | S |
| M3b | Check-ins: empty + loading | Changed screen | Trainer mobile | 48, 49 | M3a | S |
| M3c | Check-ins: Android | Changed screen | Trainer mobile | 50 | M3b | S |

### Phase 10 · Sessions & in-person

On hold by Firoz (in-person batch).

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| S1a | Migration (next free number, after 0037): sessions, attendance, check-in calls | Migration | API | — | B3a | S |
| S1b | Sessions + check-in calls API | Backend | API | feeds 200–207 | S1a | M |
| S1c | Attendance + package rules | Backend | API | feeds IP-11, IP-15 | S1b | M |
| S1d | Session/call reminders (queue) | Backend | API | feeds 205 | S1c | S |
| S2a | Migration 0038 + coach-logged sets API | Migration | API | feeds IP-12–IP-14 | S1a, B1a | M |
| S2b | Trainee suggest-a-change API | Backend | API | feeds IP-16 | S2a | S |
| S3a | Web Sessions: week calendar | New screen | Trainer web, iPad | 200 calendar | S1b | M |
| S3b | Web Sessions: online-only coach | New screen | Trainer web | 207 | S3a | S |
| S3c | Schedule-a-call prompts | New screen | Trainer web | 203, 204 | S3a | S |
| S4a | iPad group session by exercise | New screen | iPad | IP-05 | S2a, S3a | M |
| S5a | Trainer mobile Sessions tab: today | New screen | Trainer mobile | IP-09 | S1b, F1g | S |
| S5b | Batch roll-call | New screen | Trainer mobile | IP-11 | S5a, S1c | S |
| S5c | Group logging | New screen | Trainer mobile | IP-12 | S5b, S2a | S |
| S5d | Single-client + after-session quick log | New screen | Trainer mobile | IP-13, IP-14 | S5c | S |
| S6a | Day agenda | New screen | Trainer mobile | 201 | S5a | S |
| S6b | Add session / add call | New screen | Trainer mobile | 202, 202b | S6a | S |
| S6c | Online-only Sessions tab + empty | New screen | Trainer mobile | 206, 206b | S6b | S |
| S6d | Session/call reminder notification copy | New screen | Trainer mobile | 205 | S1d | S |
| S7 | Trainee: coach-logged workout + suggest a change | New screen | Trainee mobile | IP-16 (+ IP-10 reference) | S2b | S |

### Phase 11 · Devices, push, design PR

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| X2 | Phone build bugs: API URL not built in, predev filter, react-native-svg pin | Infra | Mobile | — | F4d | S |
| X3 | EAS dev build + physical phone test | QA | Mobile | — | X2 | M |
| X1b | ~~Design PR: move mockups back to docs/spec/mockups/png~~ (Dropped v13: superseded by #66; frames live in docs/design/mockups/png) | Infra | — | — | X1 | — |
| X6 | Physical-device guide + app.json/eas.json changes | Docs/Infra | Mobile | — | X2 | S |
| X4 | Push notifications + Live Activity wiring | Backend | Mobile, API | 27–28, 30, 105–122, 124 | X3 | M each |
| BT1 | TestFlight + Google Play closed-testing builds (EAS build + submit) | Infra | Mobile | — | X3, X6, BT3 | M |
| BT2 | Basic crash reporting (Sentry for Expo + Workers) | Infra | Mobile, API | — | X3, I4a | S |
| BT3 | Privacy policy + Terms pages, in-app links, store listing URLs | New screen | Trainer web, trainee, trainer mobile | DS5 frame | DS5 | S |
| BT4 | Confirm D1 Time Travel + written restore runbook | Ops/Docs | API | — | I4a | S |

### Before public release (post-beta, required before any public store listing)

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| BP1 | In-app account deletion (store requirement) | Backend + screen | API, trainee + trainer mobile, trainer web | new frame | AU1 | M |
| BP2 | Automated D1 backups (scheduled export to R2) + restore test | Infra | API | — | BT4 | S |

### Phase 12 · Gap buckets (Approved frames; P1 turns each gap into an S task)

| ID | Task | Type | Platform | Frames | Depends on | Size |
|---|---|---|---|---|---|---|
| G1 | Web sign in + first run | Gap bucket | Trainer web, iPad | 01, 197, 125–128 | P1 | S each |
| G2 | Roster + add client + invites | Gap bucket | Trainer web, iPad | 136–145, 196 | P1 | S each |
| G3 | Overview, intake review, notes | Gap bucket | Trainer web, iPad | 03 ×2, 03b, 146, 147, 188, 189, 192 | P1 | S each |
| G4 | Plans + builders | Gap bucket | Trainer web, iPad | 151–157, 194, 195, 200 plan-filtered | P1 | S each |
| G5 | Activity + check-in review (web) | Gap bucket | Trainer web, iPad | 158, 159, 163, 164, 198 | P1 | S each |
| G6 | Templates + libraries | Gap bucket | Trainer web | 168–170, 172–175 | P1 | S each |
| G7 | History, settings, asked drawer, system states, search | Gap bucket | Trainer web | 165, 176, 177, 182–187, 190 | P1 | S each |
| G8 | Home all clear + iPad Home | Gap bucket | Trainer web, iPad | 135, 191 | HM2 | S each |
| G9 | Trainee sign in, onboarding, diet | Gap bucket | Trainee mobile | 06, 06b, 103, 20–26, 07b, 08, 08b, 08c, 09, 100, 102 | P1 | S each |
| G10 | Trainee workout, progress, in-app notifications | Gap bucket | Trainee mobile | 10b, 12, 13, 99, 15, 98, 114 | P1 | S each |
| G11 | Trainee settings, sync, ended | Gap bucket | Trainee mobile | 16, 76–85, 87, 88, 89–92 | P1 | S each |

## Working rules

1. Cloud agents launch on Auto and stay on included-pool models only; if a model would need credits or on-demand usage, the agent stops and reports.
2. One agent task is one screen (at most two closely related frames), one bug, or one migration. Target size S, M only if unavoidable, never L.
3. Every brief attaches the locked frames from `design/today-rings-redesign`, a gap list, an out-of-scope list, checkable acceptance criteria and test commands. Agents never invent design; if a frame is ambiguous they stop and ask.
4. Backend and migrations come before UI, never mixed in one PR. Migrations go one at a time.
5. UI QA compares the built screen side by side with the locked mock frame. PASS needs layout, copy and states to match; tests and CI alone aren't enough.
6. FitBud UI owns QA, retries, labels and merge readiness. PRs with `do-not-merge` are skipped by the merge bot; everything else must stay clean for it.
7. At about 95% plan usage, no new tasks start; only work in flight is finished.
8. Branch ruleset on main: PR required, `ci` check required, no force pushes or deletions.
9. Firoz (30 Oct): the assistant may update BEHIND PR branches from main (merge only, never rebase/force-push) and merge autonomously with normal merge commits, bottom-up, retargeting children; never squash/--admin, never touch do-not-merge PRs, never close PRs, change labels or delete branches; stop a stack on conflict or CI failure.

## Product rules

- No auto-resolve: only the trainer resolves an exception. A client logging late is marked logged late, never auto-closed.
- No auto-send (wa.me prefill only), no percentages or streaks, pull-to-refresh, dates like "Wed 21 Oct", no ISO dates or raw enums, 44 pt touch targets.
- Ended clients are read-only. No invented insights. Demo seed and `.example` env only; agents never run remote or deploy commands.
- Session-log frames (D15) need proper design before any build.

## Changes since v9 (28 Oct)

- H1: QA passed (ready to merge) → Done (merged #21)
- H2: QA passed (ready to merge) → Done (merged #20)
- H3: QA passed (ready to merge) → Done (merged #35)
- H3b: Ready → Ready to merge (QA passed, #49 ready)
- LT1: Ready → Ready to merge (QA passed, #55 ready)
- HM1: QA passed (ready to merge) → Done (merged #19)
- HM4: QA passed (ready to merge) → Ready to merge (QA passed, #23 ready)
- HM5: QA passed (ready to merge) → Ready to merge (QA passed, #29 ready)
- QS1: QA passed (ready to merge) → Ready to merge (QA passed, #22 ready)
- QS2: QA passed (ready to merge) → Ready to merge (QA passed, #24 ready)
- QS3: QA passed (ready to merge) → Ready to merge (QA passed, #28 ready)
- QS4: QA passed (ready to merge) → Ready to merge (QA passed, #30 ready)
- API1: QA passed (ready to merge) → Ready to merge (QA passed, #25 ready)
- CE1: QA passed (ready to merge) → Ready to merge (QA passed, #26 ready)
- CE2: QA passed (ready to merge) → Ready to merge (QA passed, #27 ready)
- IP1a: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- IP1b: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- AP1: Ready (waiting on cloud agents) → Done (merged #43)
- DR1: QA passed (ready to merge) → Ready to merge (QA passed, #32 ready)
- DR2: QA interrupted (recheck needed) → Ready to merge (QA passed, #38 ready) — corrected in v11: QA-PR38 still in progress → In review (QA recheck)
- CE3: QA passed (ready to merge) → Ready to merge (QA passed, #31 ready)
- QS5: QA passed (ready to merge) → Ready to merge (QA passed, #33 ready)
- QS6: QA passed (ready to merge) → Ready to merge (QA passed, #34 ready)
- RL1a: Ready → Ready to merge (QA passed, #62 ready)
- RL1b: Ready → Ready to merge (QA passed, #63 ready)
- NA1: Ready → Ready to merge (QA passed, #58 ready)
- FK1: Ready → Ready to merge (QA passed, #52 ready)
- PK1: Ready → Ready to merge (QA passed, #53 ready)
- AD1: Ready → Ready to merge (QA passed, #51 ready)
- ED1: Ready → Ready to merge (QA passed, #54 ready)
- DV1: Ready → In review (conflicts fixed 4ab36e2; QA recheck pending)
- TS1: Ready → Ready to merge (QA passed, #56 ready)
- EC1a: QA passed (ready to merge) → Ready to merge (QA passed, #36 ready)
- EC1b: QA interrupted (recheck needed) → Ready to merge (QA passed, #37 ready) — corrected in v11: QA-PR37-round2 still in progress → In review (QA recheck)
- F1a: Ready (waiting on cloud agents) → Done (merged #45)
- F1b: Ready (waiting on cloud agents) → Done (merged #48)
- F1c: Ready (waiting on cloud agents) → Done (merged #61)
- F1d: Ready (waiting on cloud agents) → Done (merged #64)
- F1e: Ready (waiting on cloud agents) → Done (merged #65)
- N1b: Ready (waiting on cloud agents) → Done (merged #42)
- I1a: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- I2a: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- I3: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- AC1a: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- AC1b: Ready (waiting on cloud agents) → In review (on hold) (do-not-merge)
- W1a: Ready (waiting on cloud agents) → Done (merged #40)
- X3: Needs decision → Ready (EAS credentials in vault 28 Oct)
- CE6: Waiting on frame lock → Ready (frames locked 28 Oct)
- DF1: Waiting on frame lock → Ready (frames locked 28 Oct)
- P5: Waiting on Firoz (frame review) → Ready (frames locked 28 Oct)
- X1: Waiting on Firoz (frame review) → Ready (frames locked 28 Oct)
- S4b: Waiting on frame lock → Waiting on design (D15 session-log frames not designed yet)

## Changes since v10 (30 Oct)

- 16 PRs merged 30 Oct: #22 QS1, #62 RL1a, #49 H3b, #52 FK1, #53 PK1, #54 ED1, #55 LT1, #56 TS1, #58 NA1, #23 HM4, #29 HM5, #51 AD1, #24 QS2, #25 API1, #26 CE1, #27 CE2 → Done
- H4 → Done (ruleset "main" active)
- MD1 #16, SEED #17, IMPL-1 #18 (merged 22 Oct) added as Done
- DR2 and EC1b → In review (QA recheck)
- CE3 and everything above it (#33, #34, #36, #37) held for IP1b #47
- #28 QS3, #32 DR1, #63 RL1b conflict with main
- DV1: built on QS1, base now main; on hold
- P2: TW-G not accepted (check 5 failed)
- Phase 10 (S1a–S7) → On hold by Firoz
- X2 / X3 corrected; I2e: thoran → beans-thoran, N03 moong-dal-dhuli at 1.7–2× portion
- New rows: BR1, B0L, MBR, MCD, AU1, AU2, I7, I8, I9, OB1–OB4, CF1, X1b, X6
- Workers Paid bought + budget alert set (30 Oct, CF1)

---

# Appendix A · Task details

## Phase 0 · Repo health

**L1 · Restore the local app on main**  
Done · Infra · All · size S · depends on — · frames —
- DONE 22 Oct: local app restored and running (api 8787, web 5173, expo 8081)
- On main @25511d4: pnpm install → build:packages → db:reset (demo seed) → start api 8787, web 5173, expo 8081
- Box restart ~12:50 UTC lost node_modules/build output; D1 state and source intact

**H1 · Fast API test setup (realistic seed made hooks ~8x slower)**  
Done · PR [#21](https://github.com/thefitbud/thefitbud/pull/21) merged 28 Oct (cdc01cc) · Backend · API tests · size M · depends on — · frames —  
_Merged 28 Oct (cdc01cc). Files: apps/api/vitest.config.ts, test helpers. OUT OF SCOPE: seed content._
- PR #21 merged 28 Oct (cdc01cc) (/workspace/qa/QA-PR21.md); API tests 160 s → ~18 s; determinism test limit 30 s; follow-ups → FK1, TS1, VT1
- Firoz's rule: keep the full demo seed for db:reset/local runs unchanged
- Make test setup fast: seed once per test file or reuse one seeded DB copy; a small fixture of a trainer + a couple of clients where that is enough
- Raise vitest hookTimeout to ~30 s only as a backstop
- Done when all 528 tests pass without relying on the longer limit and API tests finish in under ~2–3 min (was ~1 min before #17)

**H2 · Fix the 11 lint errors**  
Done · PR [#20](https://github.com/thefitbud/thefitbud/pull/20) merged 28 Oct (e136d44) · Infra · core, trainer web, API · size S · depends on — · frames —  
_Merged 28 Oct (e136d44)._
- PR #20 merged 28 Oct (e136d44) (/workspace/qa/QA-PR20.md)
- Unused vars / prefer-const listed in PRE-MERGE.md (format.ts, MeasurementTrend, activityUtils, MealsPane, AssignPlanModal, ResponsivenessPanel, ClientCheckinsPage, ClientProgressPage, FormPhonePreview, seed activity.ts)
- pnpm -r lint clean; no behaviour change

**H3 · Minimal GitHub Actions CI on PRs to main**  
Done · PR [#35](https://github.com/thefitbud/thefitbud/pull/35) merged 28 Oct (5738569) · Infra · Repo · size S · depends on H1, H2 · frames —
- Merged 28 Oct (5738569). Round 2 PASS (/workspace/qa/QA-PR35-round2.md) @ aa1eb7d; Actions confirmed ON by Firoz 28 Oct
- checkout@v7 / setup-node@v7 / cache@v6 all node24; package-manager-cache: false; node-version-file: .nvmrc; cancel-in-progress limited to PRs
- pull_request → main: pnpm install, build:packages, typecheck, lint, test (pnpm 9.15.4)
- No secrets, no deploy, no e2e (global-setup kills wrangler/workerd and hard-codes 8787)
- Low follow-up R2-1 → H3b (pending-run cancel when ≥3 main pushes)

**H3b · CI: concurrency group by commit SHA on main pushes**  
Done · PR [#49](https://github.com/thefitbud/thefitbud/pull/49) merged 30 Oct (632603a) · Infra · Repo · size S · depends on H3 · frames —
- QA-PR35-round2 R2-1 (Low): when ≥3 quick merges land on main, a still-pending run can be cancelled so an in-between commit skips CI; PR checks and branch protection are unaffected
- One-line concurrency change (group by github.sha on push to main) plus correct the overstated comment from the H3 fix round
- Done when a trial of three rapid main pushes leaves each SHA with a completed or running check

**H4 · Branch protection on main (require CI)**  
Done · Decision · Repo · size S · depends on H3 · frames —
- DONE: ruleset "main" active (PR required, strict required check ci, no deletion, no force-push). Verified via gh api repos/thefitbud/thefitbud/rulesets. Merges on 30 Oct went through it (CI gate enforced).

**LT1 · Local wrangler traces choice on API start**  
Done · PR [#55](https://github.com/thefitbud/thefitbud/pull/55) merged 30 Oct (4ba3237) · Infra · API · size S · depends on — · frames —  
_Firoz requested 28 Oct (t55). Independent of stacks; base main._
- Background: wrangler dev writes request traces to apps/api/.wrangler/state/v3/observability/; grew to ~1 GB; only API (pnpm api, and pnpm dev which starts API)
- Add a small Node script (e.g. apps/api/scripts/local-traces.ts) that runs before wrangler dev in the API's dev script; works on Windows PowerShell, macOS and Linux
- Print folder size, then ask: keep (default Enter) / fresh (delete only the observability folder) / off (start wrangler with tracing off for this run)
- Ask only when the terminal is interactive; pnpm dev / CI / tests never ask — read FITBUD_LOCAL_TRACES=keep|fresh|off (default keep); a user-set env also skips the question
- When the folder is over 500 MB, print a warning that suggests fresh
- Never touch anything else under .wrangler/state, especially the local D1 database
- observability stays on for staging and prod in wrangler.toml; off applies to local dev only
- Document the options and the env var in the README's local-dev section
- Done when: pnpm api asks and each option behaves as described; pnpm dev and the tests start without asking; local DB data survives fresh
- Observability stays on for staging/prod (OB1).

**BR1 · Delete merged branches (local + remote)**  
Done (checked 30 Oct 19:45 IST) · Infra · Repo · size S · depends on — · frames —
- v13: merged branches are already deleted on GitHub (including design/today-rings-redesign). Left: main, cursor/ac1a-…, cursor/ac1b-… (open PRs) and cursor/i3-meal-compliance-local-date-c6ae (base of #50; delete after retargeting, ask first)
- Needs Firoz's yes; agents never delete branches on their own. Ask before deleting.
- Candidates: ci/h3-minimal, fix/h1-fast-tests, fix/h2-lint, cursor/hm1-drawer-focus-d207, cursor/w1a-workspace-tabs-consistent-1cfb, cursor/n1b-notification-client-names-59c6, cursor/ap1-assign-plan-focus-e873, cursor/md1-trainer-mobile-5064, the F1a–F1e branches, and the 30 Oct merged branches (fix/qs2, fix/api1, fix/ce1, fix/ce2, fix/hm4, fix/hm5, rl1a, h3b, fk1, pk1, ed1, lt1, ts1, na1, ad1)
- Keep fix/qs1-seed-meal-qty until DV1 #60 is resolved (v13: #60 merged; branch already deleted)

## Phase 1 · QA, specs and design (me)

**P1 · Full QA pass on main → gap lists for G1–G11 and every Rebuild batch**  
Ready · QA · All · size M · depends on L1 · frames all frames in the coverage matrix  
_HANDOFF next step 1_
- Capture every screen at 393x852 / 1440x900 / 1024x768 on the realistic seed
- Per-screen gap list; turns every 'Gap check' / 'Spot-check' row into Matches or a one-screen S task
- Don't run e2e global-setup against the live app (kills wrangler/workerd, hard-codes 8787)
- Includes "rebuild screens to the 21 Oct mockups" as the gate for Phase 2–12 UI tasks (design note; frame decisions per Appendix B).

**P2 · TW-G narrow recheck on main (5 checks) (recheck done; check 5 iPad 44 px FAILED → IP1a/IP1b, which merged 30 Oct (#44, #47); re-run check 5 on main to accept TW-G)**  
Done · QA · Trainer web, iPad · size S · depends on L1 · frames 178, 179, 180
- DONE 22 Oct (QA-PR19-TWG.md): checks 1, 2, 4 pass; 3 passes with 2 gaps → CE1, CE2; 5 fails on a few targets → IP1a, IP1b; extra bugs → QS1, QS2, API1, AP1, HM4
- Ending a client stops the schedule
- Restarting schedules nothing
- Ended CTAs hidden
- Kavya (ended) gets no new activity
- iPad targets ≥ 44 px

**P3 · MD1 narrow recheck on main**  
Ready · QA · Trainer + trainee mobile · size S · depends on L1 · frames 17, 18, 19, 73, 74, 75, 10, 101, 07, 86
- Re-check every MD1-FIXES item live; mark which are still open
- Trims F3/F4 before launch
- MD1 gaps: iOS/Android Attention captures are identical to the web shot (recapture); coach lock frame has no note body (→ X4 / frame 120).

**P4 · Rewrite MD2 spec against locked decisions**  
Ready · Spec · Trainer mobile · size S · depends on D4 · frames 46–61, 62–72
- TM-04 dropped (review sheet 31, F1d/e)
- TM-05 → M3a–c
- TM-07/08 → M1/M2
- TM-09 per D4

**P5 · Design index status + one brief per agent task**  
Ready · Spec · — · size S · depends on D9 · frames README index
- Frames locked 28 Oct (D9): the 22 Oct design frames already on branch design/today-rings-redesign — docs/design/README.md + docs/design/mockups/png (not the new DS6/DS7 frames)
- Mark them Locked once he confirms (D9)
- Each brief follows the Assignment rules (frames, gap list, files, out of scope, checks, tests)

**P6 · Per-batch gap-list QA gate (before every coding batch)**  
Ready · QA · All · size S · depends on L1 · frames the batch's frames  
_Recurring_
- Before launching a batch: current-vs-target gap list per frame, attached to the brief
- After each PR: QA against that list; one fix round max, else re-scope smaller

**DS1 · DESIGN: Home full views (web + iPad)**  
Ready · Design · Trainer web, iPad · size M · depends on — · frames new frames: Needs attention, Renewals due, Asked you on WhatsApp
- D13 locked: full-screen views for Needs attention, Renewals due, Asked you on WhatsApp, each opened from its count card (today a card filters Home and hides every other section)
- Check-ins card has no new view: it opens the existing Check-ins inbox (166) filtered To review
- Web 1440 + iPad 1024; states default, empty, ended-client rows read-only
- Mockups in docs/design; Firoz approves the frames before HV1–HV3

**DS2 · DESIGN: side panel per client, with bulk actions (D11 locked)**  
Ready · Design · Trainer web, iPad · size M · depends on — · frames revises 02 ×3, 131, 132, 133 (+193, 199)
- Opened per client row from Needs attention; lists only that client's exceptions raised from coaching configuration
- WhatsApp asks, renewals and other items stay in their own Home sections (not in the panel)
- Bulk Reviewed/Resolve only for compatible types (missed workout / meal / log); one outcome + optional note, saved per item
- Pain/safety items: individual only; Mark reviewed stays client-level
- Confirm when > 3 selected; 5 s Undo; per-item failure reporting; “n more” line for the 10 cap; ended clients read-only
- Firoz approves the frames before SP1–SP4

**DS3 · DESIGN: Activate confirmation dialog + sections-left rules (D12 locked)**  
Ready · Design · Trainer web, iPad · size S · depends on — · frames new modal (first-time + changes-only); 149 / IP-07 footer copy  
_Evidence: /workspace/fitbud-impl/D1-foods-and-D12-activate.md part B._
- 148/149/IP-07 already have no Mark configured; no footer redesign needed
- First-time dialog: client + short goal, start date, workouts/week + log window, meals/day + confirm window + photo rule, check-ins (cadence, day, window, form), tracking (weight, photos, session effort), reminders per type, coaching mode for hybrid, plan status (“Plan X vN is published…” or “Nothing is scheduled until a plan is published” + Go to Plans)
- Changes-only dialog for Save as vN+1: old → new values; wording “new targets apply from tomorrow” (D12b option a, no scheduled state)
- Define the required sections behind “n sections left”: short goal, expectations, check-ins, tracking (D17 locked 23 Oct)

**DS4 · SPEC: Home row targets and destinations**  
Ready · Spec · Trainer web, iPad · size S · depends on D14 · frames 02, 135, 191 (annotations)
- Whole row is the target in every Home container; buttons stay separate 44 pt targets
- Needs attention row → side panel; Asked row → ask drawer; Check-ins row → review; Renewal row → interim (D14 locked): that client's subscription in Coaching setup until Client settings (W2a) ships, then Client settings › Subscription (209/211)
- Count cards link only to a full view (HV1–HV4); not clickable otherwise

**DS5 · DESIGN: Legal page (Privacy, Terms, Credits and licences)**  
Ready (beta must-have, v13) · Design · Trainer web, trainee · size S · depends on D7 · frames new frame
- D7 revised 23 Oct: no separate image credits screen
- Standard legal page with Privacy, Terms and a “Credits and licences” section
- Per CC BY-SA image: title, author, source, licence (Wikimedia/Everkinetic/wger)
- Designed later

**DS6 · DESIGN: session logging frames (web + iPad)**  
Ready · Design · Trainer web, iPad · size S · depends on — · frames new frames (replace IP-03/04/06 reference)
- D15 locked 23 Oct: log after a session on web and iPad, plus live logging on iPad
- Ready for me to design first (28 Oct): frames are NOT ready for Firoz review yet; status stays Ready until mockups exist, then Waiting on frame lock / Firoz review
- Firoz locks the frames before S4b is built

**DS7 · DESIGN: read-only vs disabled field frames (+ ended-client presentation CE6)**  
Ready · Design · Trainer web, iPad · size S · depends on — · frames 179 style; 148 (ended)
- DF1 + CE6 locked 23 Oct: frame 179 read-only style (plain values, no input boxes) for ended clients and any non-editable field
- Greyed disabled style only for briefly unavailable controls
- Ready for me to design first (28 Oct): three frame-lock tasks (session logging / read-only vs disabled / ended-client) — designs NOT ready for Firoz review yet
- Firoz locks them before DF1/CE6 are built

**B0L · Batch 0 leftovers: ISO dates, “Effective since”, Diet kcal, raw enum labels**  
Ready · Bug · Trainee mobile, Trainer web · size S · depends on P3 · frames —
- Mobile ISO dates on Today/Diet; workspace “Effective since” ISO date; Diet kcal vs meals mismatch; 28 raw enum labels
- Product rule (no ISO dates or raw enums) had no task; F3b/PK1 cover only trainer kcal

**MBR · MB fix2 recheck + MC narrow recheck**  
Ready · QA · Mobile · size S · depends on — · frames MB/MC frames
- MB fix2 claimed 1 MATCH / 21 CLOSE; recheck live
- MC narrow recheck (queued earlier, never run)

**MCD · Verify MC clock-dependent API date tests are fixed**  
Ready · QA · API · size S · depends on — · frames —
- 3 clock-dependent date tests were meant to be fixed in MD (merged as #16); confirm green on main incl. IST date cases

## Phase 2 · Home & side panel (trainer web) — serialized, all touch HomePage.tsx

**HM1 · Bug: focus jumps to the panel's X while typing a note**  
Done · PR [#19](https://github.com/thefitbud/thefitbud/pull/19) merged 28 Oct (182a557) · Bug · Trainer web, iPad · size S · depends on — · frames 182 (ask drawer), 02 panel  
_PR #19 (branch cursor/hm1-drawer-focus-d207): fix round done and QA passed. Merged 28 Oct (182a557)._
- PR #19 (merged to main): fix round QA'd READY TO MERGE for HM1 scope (/workspace/qa/QA-PR19-round2.md); nit N3 (HomePage-level ask-drawer close tests) open; F2 → ED1, F3 → AD1
- FIX ROUND (PR #19, the single allowed one; QA /workspace/qa/QA-PR19-TWG.md): focus fix itself PASSES (200 chars typed through polls in both drawers, X focused on open, Escape closes, no visual change)
- Fix 1: ask drawer closes with a focus-restoring close (like closeDrawerWithFocus) back to its originating ask row / Mark answered button; today focus lands on BODY
- Fix 2: replace both test files with real component tests that import CoachAskDrawer and ExceptionDrawer (stage1Api mocked): focus the textarea, rerender with a new onClose, focus stays; Escape calls onClose; X focused on mount. No inline copies or expect(true) placeholders
- Fix 3 (optional): key ExceptionDrawer by exception id (or focus effect on [exceptionId]) so a new item refocuses X
- Files: CoachAskDrawer.tsx, ExceptionDrawer.tsx, HomePage.tsx (close handlers only), the two *.test.tsx. OUT OF SCOPE: polling, shortcuts (HM4), styling
- Checks: vitest run src (trainer-web), typecheck, lint on touched files
- Original criteria:
- Repro: Home › Asked you on WhatsApp › Mark answered › Notes; type a few words; within ~4 s focus moves to the X
- Cause: CoachAskDrawer.tsx:93–104 and ExceptionDrawer.tsx:418–455 call closeRef.focus() in an effect keyed on [onClose]; HomePage passes a new function each render (closeDrawer :551, inline arrow :1327), so every 4 s poll re-render re-runs it
- Fix: focus the X once on open; stable onClose (useCallback or ref)
- Done: focus stays in the textarea through refetches; 200 characters typed uninterrupted with the poll running; Escape still closes; focus returns to the row on close

**HM4 · Bug: Home single-key shortcuts (a / n / o) fire from stray typing**  
Done · PR [#23](https://github.com/thefitbud/thefitbud/pull/23) merged 30 Oct (35402da) · Bug · Trainer web, iPad · size S · depends on HM1 · frames 02, 135  
_HomePage chain: HM1 → HM4 → HM5 → HM2 → HM3._
- PR #23 (merged to main): round 2 passed for everything it set out to fix (/workspace/qa/QA-PR23.md, QA-PR23-round2.md); the one remaining finding R2-1 (index-based selection, also on main) split out to HM5; the drawer n race (QA F5) split out to DR1
- Repro (QA incident): focus lands on a Needs-attention row after a drawer closes; typed text hits the grid shortcuts and “a” acknowledged Rohan's exception
- Guard: ignore shortcuts for ~1 s after a drawer closes and only when focus reached the row by keyboard (not programmatic restore); never while a modifier or IME composition is active
- Files: HomePage.tsx keydown handler (~:642). OUT OF SCOPE: shortcut set, polling, drawers
- Tests: component test — closing a drawer then typing “a” does not acknowledge; Tab to a row then “a” still works

**HM5 · Bug: Home selection follows the client, not the row index**  
Done · PR [#29](https://github.com/thefitbud/thefitbud/pull/29) merged 30 Oct (0ba2db6) · Bug · Trainer web, iPad · size S · depends on HM4 · frames 02, 135  
_Source: /workspace/qa/QA-PR23-round2.md (R2-1 + nits). Stacked on #23 (stack A)._
- PR #29 (merged to main): QA PASS (/workspace/qa/QA-PR29.md)
- R2-1 (pre-existing on main): selection is index-based (focusIdx), so when a poll or re-render reorders rows, a / n act on whoever moved into the focused slot (QA: Imran focused, Rohan acknowledged)
- Track the selected row by relationshipId; the ring and a / n / o always target the focused client
- When an acknowledged row disappears, focus moves to the next row (not BODY)
- Pointer filtering: right-clicks and touch scrolls don't arm the shortcuts
- Tests: reorder under the focused row, then a acknowledges the focused client; select-by-click test; focus after row removal

**HM2 · Targeted updates on Home (no whole-page refresh)**  
Ready · Behaviour · Trainer web, iPad · size M · depends on HM5 · frames 02, 135  
_Was the polling part of I1 + the F2 undo flicker._
- Cause today: one runLoad refetches 8 endpoints and replaces every section's state on each mutation, realtime hint and 4 s poll
- After an action: optimistic local update, then refetch only the affected section + its count
- Poll 45 s, paused when the tab is hidden, refetch on focus/visibility
- No skeleton, scroll kept, other sections don't re-render; a row hidden during the 5 s Undo never reappears (#18 leftover)
- Tests: one mutation triggers one section fetch

**HM3 · Whole-row click targets + correct destinations on Home rows**  
Ready · Behaviour · Trainer web, iPad · size S · depends on HM2, DS4 · frames 02, 135, 191
- Every row in Needs attention, Asked, Check-ins, Renewals is clickable as a whole; buttons stay separate 44 pt targets
- Renewal row → per DS4 (today only renewals[0] links to /configure, :1286)
- Count cards stop filtering Home; they link to a full view or aren't clickable (DS4)

**SPB · API: bulk Reviewed / Resolve for one client's exceptions**  
Ready · Backend · API · size S · depends on F1a, DS2 · frames —
- D11: one client per call; only coaching-configuration exceptions of compatible types (missed workout / meal / log); rejects pain/safety, asks, renewals and ended relationships
- One outcome + optional note saved as one resolution row per exception (outcome, note, actor, time)
- Idempotent; returns a per-item result; Undo within 5 s restores every item
- Mark reviewed stays the existing client-level call

**SP1 · Side panel v3: per-client list + item navigation**  
Ready · Changed screen · Trainer web · size S · depends on HM3, DS2 · frames 02 default, 02 resolved  
_Frames revised by DS2._
- Opened per client row from Needs attention; lists only that client's coaching-configuration exceptions (asks, renewals stay in their Home sections)
- Fully open docked panel, sticky footer, arrows + “n of m”; max 10 + “n more” line
- Resolved + Undo + Next

**SP1b · Side panel on iPad portrait**  
Ready · Changed screen · iPad · size S · depends on SP1 · frames 193
- Same panel at 768 portrait; 44 pt targets

**SP2 · Side panel: resolve form + nudge limited**  
Ready · Changed screen · Trainer web · size S · depends on SP1 · frames 02 resolve, 131
- Outcome chips + private note
- Nudge limited, client quiet hours, ⋯ menu

**SP2b · Side panel: nudge waits for quiet hours**  
Ready · Changed screen · Trainer web · size S · depends on SP2 · frames 199
- Quiet-hours wait state in the panel (replaces old drawer)

**SP3 · Side panel: read-only from Reviewed + item gone**  
Ready · Changed screen · Trainer web · size S · depends on SP2 · frames 132, 133
- Read-only resolved item from Reviewed
- Item no longer exists state

**SP4 · Side panel: multi-select + bulk Reviewed / Resolve + Undo**  
Ready · Changed screen · Trainer web, iPad · size M · depends on SP3, SPB · frames DS2 frames
- D11: checkboxes only on compatible types (missed workout / meal / log); pain/safety items individual only
- One outcome chip + optional note applied per item; confirm when > 3 selected; 5 s Undo
- Per-item failure reporting (e.g. “2 resolved, 1 already resolved elsewhere”)
- Ended client: read-only, no bulk; Mark reviewed stays client-level

**HV1 · Home full view: Needs attention**  
Ready · New screen · Trainer web, iPad · size S · depends on HM3, DS1 · frames DS1 frames
- D13: full-screen view opened from its count card; rows open the per-client side panel; empty state

**HV2 · Home full view: Renewals due**  
Ready · New screen · Trainer web, iPad · size S · depends on HV1, D14 · frames DS1 frames
- D13: full-screen view from its count card
- Row destination per D14 (locked): interim that client's subscription in Coaching setup; Client settings › Subscription 209/211 once W2a exists

**HV3 · Home full view: Asked you on WhatsApp**  
Ready · New screen · Trainer web, iPad · size S · depends on HV1 · frames DS1 frames
- D13: full-screen view from its count card; rows open the ask drawer; client name on every row

**HV4 · Check-ins card → Check-ins inbox filtered To review**  
Ready · Changed screen · Trainer web, iPad · size S · depends on HV3 · frames 166, 167
- D13: no new view; count card opens the existing /checkins inbox with To review selected (gap check on 166/167 first)

## Phase 2b · QA follow-ups (QA-PR19-TWG.md, 22 Oct)

**QS1 · Seed bug: Imran's and Rajesh's meal quantity too large → scheduler error every run**  
Done · PR [#22](https://github.com/thefitbud/thefitbud/pull/22) merged 30 Oct (9cfdc2d) · Bug · API seed · size S · depends on H1 · frames —  
_Source: /workspace/qa/QA-PR19-TWG.md. Kept separate from I2e (different bug; I2e waits on the library chain); seed files serialized QS1 → QS2 → I2e._
- PR #22 merged to main 30 Oct 11:58 IST (9cfdc2d): round 2 READY (/workspace/qa/QA-PR22.md); advisories → DV1, PK1, DK1, AL1
- Their effective plans have mealPrescriptions[0].items[2].quantityScaled > 1e8; replenishRollingHorizons throws a ZodError on every cron, so their schedules never roll forward (twg/api8788.log)
- Fix the seed's quantity scaling for those plan items (root-cause file to confirm: seed/demo/generator generated.ts / plans.ts / templates/diets.ts)
- Done: db:reset, then a --test-scheduled cron run logs no ZodError and Imran/Rajesh get assignments; seed test asserts every seeded quantityScaled is within a sane range
- OUT OF SCOPE: food slug remap (I2e), timestamps (QS2), scheduler code

**QS2 · Seed bug: timestamps after now or after the client's end date**  
Done · PR [#24](https://github.com/thefitbud/thefitbud/pull/24) merged 30 Oct (50d5fcc) · Bug · API seed · size S · depends on QS1 · frames —  
_Source: /workspace/qa/QA-PR19-TWG.md_
- PR #24 (merged to main): round 2 PASS (/workspace/qa/QA-PR24-round2.md); QA F1 (overlays on unopened/unclosed items) → QS3; leftovers → QS5, RL1a/RL1b
- Examples: an exception_actions row at 2026-10-22T21:06Z (future), Kavya's coaching_ended exception created_at = reset time, Dinner assignments created 17 min after ended_at
- Clamp every seeded timestamp to ≤ now and, for ended relationships, ≤ ended_at
- Files: seed/demo/generator (activity.ts, history/lifecycle builders; to confirm). OUT OF SCOPE: seed content and volumes
- Tests: seed test asserts no row timestamp > seed now and none after ended_at for ended relationships

**QS3 · Seed bug: overlays on meals and workouts whose window hasn't opened or closed**  
Done · PR [#28](https://github.com/thefitbud/thefitbud/pull/28) merged 30 Oct 15:58 IST (9e6004f) · Bug · API seed · size S · depends on QS2 · frames —  
_Source: /workspace/qa/QA-PR24.md F1. Seed chain: QS1 → QS2 → QS3 → QS4 → QS5 → DV1 → I2e (DV1 was built on QS1, not QS5)._
- PR #28 (stack B, on #27): QA PASS (/workspace/qa/QA-PR28.md)
- Gate each overlay on window state: start ≤ now for logs, deviations and asks; end ≤ now for overdue, skipped and missed
- Done: after db:reset, Rahul's first Home view resolves 0 seeded exceptions (was 11)
- Side effect: Farhan has 10 open items (the per-client cap), not 12
- #28 conflicts with main after #24–#27 merged (30 Oct); resolve via merge from main, then CI.

**QS4 · Seed: already contains what the first read would create**  
Done · PR [#30](https://github.com/thefitbud/thefitbud/pull/30) merged 30 Oct 16:07 IST (20bb6e1) · Bug · API seed · size S · depends on QS3 · frames —  
_Source: /workspace/qa/QA-PR28.md. Stacked on #28 (stack B)._
- PR #30 (stack B, on #28): round 2 PASS (/workspace/qa/QA-PR30-round2.md)
- At any reset instant the seed already holds every exception the first trainer read would create, so the first read creates 0 (QA saw new open items at some instants, e.g. Sunday evening IST)
- Tests: seed, then run first-read detection at several instants (incl. Sunday/Monday edges); 0 created
- Waits for #28.

**API1 · Bug: exceptions closed at coaching end get no resolved time**  
Done · PR [#25](https://github.com/thefitbud/thefitbud/pull/25) merged 30 Oct (d4493ef) · Bug · API · size S · depends on H1 · frames —  
_Source: /workspace/qa/QA-PR19-TWG.md_
- PR #25 (merged to main): READY (/workspace/qa/QA-PR25.md); follow-up 4 → RL1a/RL1b, the other 6 → EC1 (Firoz's call)
- endCoachingRelationship sets status resolved + closed_reason coaching_ended but leaves resolved_at NULL (relationship-lifecycle.ts ~:72–80); set resolvedAt to the end timestamp
- Files: apps/api/src/domain/relationship-lifecycle.ts + its test. OUT OF SCOPE: other lifecycle steps; no migration (remote D1s are empty, local fixed by db:reset)
- Tests: relationship-lifecycle.test.ts asserts resolved_at is set for every exception closed by ending

**CE1 · Ended client: Coaching setup page read-only**  
Done · PR [#26](https://github.com/thefitbud/thefitbud/pull/26) merged 30 Oct (6b4d8b7) · Bug · Trainer web, iPad · size S · depends on — · frames 148 (ended state), 179  
_Source: /workspace/qa/QA-PR19-TWG.md. ConfigureCoachingPage chain: CE1 → W3a → AC2 → W3b._
- PR #26 (merged to main): READY for CE1 scope (/workspace/qa/QA-PR26.md). Fields were already locked on main (fieldset[disabled]); the visible fix is removing the “This version is active” banner. Follow-ups → CE4, CE5, CE6
- On an ended relationship /configure shows 14 enabled inputs/switches (saving is already blocked): render all fields disabled/read-only
- Remove the contradictory “This version is active. Create a new version to change it.” banner for ended clients; show the standard ended read-only banner
- Files: ConfigureCoachingPage.tsx. OUT OF SCOPE: Activate flow (AC2), layout (W3a)
- Tests: component/e2e check on Kavya: 0 enabled inputs, no 'This version is active' text

**CE2 · Ended client: hide or relabel configure links**  
Done · PR [#27](https://github.com/thefitbud/thefitbud/pull/27) merged 30 Oct (2ff79ad) · Bug · Trainer web, iPad · size S · depends on — · frames 208 (ended state), 179  
_Source: /workspace/qa/QA-PR19-TWG.md. Serialize before W1b (same header file)._
- PR #27 (merged to main): QA PASS (/workspace/qa/QA-PR27.md). Ended labels: “View coaching setup” / “View reminder settings” (wording check with Firoz: maybe “View reminder history”). Follow-ups → CE3, CE4, W8, W1e
- Ended workspace: header ⋯ menu drops “Configure coaching” and “Reminder settings” (or relabels them “View coaching setup” / “View reminder settings”, to confirm wording)
- Onboarding page: “Open configure” hidden or relabelled view-only for ended clients
- Files: components/workspace/WorkspaceHeader.tsx, pages/OnboardingReviewPage.tsx. OUT OF SCOPE: the ⋯ menu redesign (W1b), ConfigureCoachingPage
- Tests: ended Kavya shows no configure actions; active client unchanged

**IP1a · iPad 44 px: Reminders panel close X + ⋯ menu items**  
Done · PR [#44](https://github.com/thefitbud/thefitbud/pull/44) merged 30 Oct 16:32 IST (4eda771) · Bug · iPad, trainer web · size S · depends on H2 · frames 180, 208 (reminders panel frame to confirm)  
_Source: /workspace/qa/QA-PR19-TWG.md. After H2 (lint touches ResponsivenessPanel)._
- Reminders panel Close X is 27×30 → ≥ 44×44; ⋯ overflow menu items 42 px → ≥ 44 px tall
- Files: components/workspace/ResponsivenessPanel.tsx, components/OverflowMenu.tsx / styles.css. OUT OF SCOPE: visual redesign
- Tests: measured at 1024×768 (script like twg/ipad-targets.json) all ≥ 44

**IP1b · iPad 44 px: Plan Versions toggle, Progress check-in links, Profile “Forgot it?”**  
Done · PR [#47](https://github.com/thefitbud/thefitbud/pull/47) merged 30 Oct 16:36 IST (d97ee11) · Bug · iPad, trainer web · size S · depends on IP1a, H2 · frames 180, 150, 160, 176 (to confirm)  
_Source: /workspace/qa/QA-PR19-TWG.md. After H2 (lint touches ClientProgressPage); before W3c / W6a._
- Plan tab “Versions Show” toggle 24 px, Progress check-in links 20 px (13 of them), Settings › Profile “Forgot it?” 68×20 → all ≥ 44 px hit area (padding, not bigger text)
- Files: ClientPlanPage.tsx, ClientProgressPage.tsx, settings/ProfileSettingsPage.tsx. OUT OF SCOPE: Plans/Progress redesign (W3c, W6*)
- Tests: same 1024×768 measurement, all ≥ 44

**AP1 · Bug: Assign plan modal steals focus on re-render**  
Done · PR [#43](https://github.com/thefitbud/thefitbud/pull/43) merged 28 Oct (3f4aa32) · Bug · Trainer web, iPad · size S · depends on H2 · frames 151–157 (assign plan, to confirm)  
_Source: /workspace/qa/QA-PR19-TWG.md. After H2 (lint touches AssignPlanModal)._
- AssignPlanModal.tsx:236 refocuses the dialog in an effect keyed on [acting, onClose]; split like PR #19: focus once on open, keydown effect separate
- Files: components/plan/AssignPlanModal.tsx + a real component test. OUT OF SCOPE: modal content
- Tests: typing in a field survives a rerender with a new onClose; Escape closes; initial focus unchanged

## Phase 2c · QA follow-ups (QA-PR19 to QA-PR28, 22 Oct)

**DR1 · Bug: the exception drawer's own n shortcut fires within ~16 ms of closing**  
Done · PR [#32](https://github.com/thefitbud/thefitbud/pull/32) merged 30 Oct 18:49 IST (45105e1) · Bug · Trainer web, iPad · size S · depends on HM5 · frames 02 panel  
_Source: /workspace/qa/QA-PR23.md F5. ExceptionDrawer chain: DR1 → DR2 → ED1 → RL1b. Merge DR1+DR2 together._
- PR #32 (stack A, on #29): round 2 PASS (/workspace/qa/QA-PR32-round2.md) @ a6b8b77; both round-1 blockers fixed at all 3 viewports
- HOLD MERGE until DR2 (#38) merges with it — round-2 found Esc-then-Back stuck-drawer regression (F-C) introduced by this PR
- F4 (pre-existing) → HB1; Shift/Alt/middle-click test gaps → covered in DR2
- n typed 0–16 ms after close no longer nudges; footer Open-client race fixed
- Files: ExceptionDrawer.tsx + tests. OUT OF SCOPE: Home grid shortcuts (HM4, HM5)
- #32 base is main (stack A parents merged) and it conflicts with main (DIRTY).

**DR2 · Bug: Esc then browser Back reopens a stuck drawer**  
Done · PR [#38](https://github.com/thefitbud/thefitbud/pull/38) merged 30 Oct 18:59 IST (256caac) · Bug · Trainer web, iPad · size S · depends on DR1 · frames 02 panel  
_Source: /workspace/qa/QA-PR32-round2.md F-C. Merge with #32._
- PR #38 (stack A, on #32): head fix/dr2-drawer-esc-back-reopen @ 2432715; QA-PR38.md still _in progress_ (interrupted by box reboot ~23 Oct) — recheck needed before merge
- QA-PR32-round2 F-C: Esc then Back within ~50 ms reopens the same exception with closingRef never reset (16/16 stuck on head; 0/16 on base); on ClientOverviewPage Esc then does nothing
- Fix: reset closingRef when location.key changes (or bump openSeq on popstate reopen); pass openSeq from ClientOverviewPage
- Also adds Shift / Alt / middle-click footer-link tests (QA F-B)
- Files: ExceptionDrawer.tsx + closing/historyBack tests. OUT OF SCOPE: Home grid shortcuts
- Done when Esc→Back leaves a usable drawer at 1440/1024/393, normal and cpu4×; DR1 fixes still hold

**CE3 · Ended client: Overview “Renewal · Open settings” + Progress “Open check-in settings” go to /configure**  
Done · PR [#31](https://github.com/thefitbud/thefitbud/pull/31) merged 30 Oct 16:54 IST (a6cdcea) · Bug · Trainer web, iPad · size S · depends on CE2, IP1b · frames 03, 161 (ended)  
_Source: /workspace/qa/QA-PR27.md findings 6–7. After IP1b (same ClientProgressPage file)._
- PR #31 (stack B, on #30): QA PASS (/workspace/qa/QA-PR31.md)
- ClientOverviewPage.tsx:738–746: “Renewal · Open settings” → /configure whenever renewalState !== current, no ended guard (latent: Kavya and Nikhil renew 17 Nov)
- ClientProgressPage.tsx:144: “Open check-in settings” → /configure in the no-weigh-ins state, no ended guard
- Fix: when ended, hide the Renewal card (or relabel “View coaching setup”) and drop or relabel the check-in link
- Tests: ended client with renewal due / no weigh-ins shows no configure link; active unchanged
- QS5, QS6, EC1a, EC1b (#33, #34, #36, #37) sit above #31 and wait with it.

**CE4 · Ended client: Configure page title, copy and status**  
Ready · Bug · Trainer web, iPad · size S · depends on CE2 · frames 148 (ended state)  
_Source: /workspace/qa/QA-PR26.md F1–F2, QA-PR27.md finding 1. ConfigureCoachingPage chain: CE1 → CE4 → CE5 → W3a → AC2 → W3b (CE6 once designed)._
- Title “Configure coaching” and lede “Set the baseline for …” (ConfigureCoachingPage.tsx:846–848) → read-only title and copy for ended clients
- Footer pill reads “Active” on ended clients (“Draft” for Aarav) → an ended read-only status
- Live-client wording on ended: “Monthly · renews 17 Nov”, “On for workouts and m…”, the “Open WhatsApp” link
- Pending reactivation (Nikhil): the page reflects the header's “Waiting for … to confirm” banner
- Exact copy confirmed with Firoz before build
- Tests: Kavya and Nikhil show the ended copy and status; active clients pixel-identical

**CE5 · Configure page refreshes when a relationship ends while it's open**  
Ready · Behaviour · Trainer web, iPad · size S · depends on CE4 · frames 148  
_Source: /workspace/qa/QA-PR26.md F3._
- Today an open Configure page keeps its live state until reload when coaching ends elsewhere (saving is correctly refused with 409)
- Publish a relationship-status hint (or refetch on focus/visibility) and switch the page to the ended read-only state
- Unsaved edits aren't dropped silently: say that coaching ended
- Tests: end the relationship elsewhere → the page turns read-only without a reload

**CE6 · Ended client: proper read-only presentation (frame 179 style) + screen-reader names**  
Ready · Changed screen · Trainer web, iPad · size S · depends on CE5, DF1, DS7 · frames 148 (ended), 179  
_Source: /workspace/qa/QA-PR26.md F4. Decide together with DF1._
- Greyed disabled fields look editable (especially on mobile): show the ended setup read-only in the frame 179 style
- Accessible names drop the character counters (“Short goal 26/120”) and the doubled “Month Month” of native date parts
- Decided 23 Oct: frame 179 read-only style (plain values, no input boxes); build after Firoz locks the DS7 frames

**W8 · Ended client: Onboarding “WhatsApp client” draft + Reminders drawer footer copy**  
Ready · Bug · Trainer web, iPad · size S · depends on CE2, IP1a · frames 208 (ended), 181  
_Source: /workspace/qa/QA-PR27.md findings 2–3 (listed as W-x). After IP1a (same ResponsivenessPanel file)._
- The ended Onboarding page still offers “WhatsApp client” with “Thanks for filling your intake… I'll review it and set up your coaching next”: hide it or swap the draft
- ResponsivenessPanel.tsx:227 says “You can switch categories on or off in Configure” for every client: for ended, e.g. “Reminders are off while coaching is ended.”
- Exact copy confirmed with Firoz
- Tests: ended Kavya shows neither; active unchanged

**W1e · Client header ⋯ menu accessibility**  
Ready · Bug · Trainer web, iPad · size S · depends on IP1a · frames 208, 208b  
_Source: /workspace/qa/QA-PR27.md findings 4 and 8. Goes with W1b (same menu); runs just before it._
- Escape returns focus to the ⋯ trigger (today BODY, for every client, also on main)
- Arrow-key navigation between menu items
- 393 px: the 5-item menu (active and submitted clients, e.g. Rohan, Sneha) is clipped off the left edge (x −132 to 60): keep it on screen
- Files: components/OverflowMenu.tsx + test. OUT OF SCOPE: menu contents (W1b)

**QS5 · Seed timestamps: remaining ordering leftovers**  
Done · PR [#33](https://github.com/thefitbud/thefitbud/pull/33) merged 30 Oct 16:59 IST (d304630) · Bug · API seed · size S · depends on QS4 · frames —  
_Source: /workspace/qa/QA-PR24.md, QA-PR24-round2.md, QA-PR28.md. Seed chain._
- PR #33 (stack B, on #31): QA PASS (/workspace/qa/QA-PR33.md); F1 Low (open coach asks at window open) → QS6; out-of-scope follow-ups → QS7, A2, C3, C6, E2, R1, X5, X7; Kavya resolved_at → EC1e
- Older generator coach asks (39–48 rows, all answered or expired) stamped before their item's window opens
- Rohan's seeded overdue_checkin detected before its due window ends → clamp to ≥ windowEndsAt
- Rohan's Sunday review created_at = now exactly (793a5460 at the Monday instant); tighten the test allowlist to that review's checkin_id (QA N1)
- plan_templates e9efffa5 created_at after updated_at
- 1156–1170 set_executions finish after their session's completed_at
- users.created_at equal to the reset time
- Kavya's coaching_ended exception resolved_at NULL → ended_at (seed side of API1)
- Tests: the order audit covers each case at the named and sweep instants
- Waits for #31 (above CE3, which is held for IP1b #47).

**QS6 · Seed: open coach asks ≥ window open + 1 h; overlays use the client's real timezone**  
Done · PR [#34](https://github.com/thefitbud/thefitbud/pull/34) merged 30 Oct 17:18 IST (1739a9b) · Bug · API seed · size S · depends on QS5 · frames —  
_Source: /workspace/qa/QA-PR33.md F1. Seed chain._
- PR #34 (stack B, on #33): PASS (/workspace/qa/QA-PR34.md) @ db0d75d; 589/589 ask sweep clean; fresh-seed 129 instants 0 created
- Every coach ask lands ≥ window open + 1 h and ≤ close − 30 min; overlays use persona timezone (legacyTimezoneFor prefers config tz)
- Low: close−30m bound has no test (mutant A3 survives) → fold into QS7 AC
- Waits for #31 (above CE3, which is held for IP1b #47).

**QS7 · Seed: remaining hard-coded 'Asia/Kolkata' literals in history.ts + close−30m test**  
Ready · Bug · API seed · size S · depends on QS6 · frames —  
_Source: QS6 implementer follow-up + QA-PR34 Low. After QS6 (same files)._
- Meera's overdue lunch (history.ts L797) first
- Also Lakshmi L961, Meera weight L1004, Farhan L1011, Rohan L1020–1083, notification slots L1111
- Use each client's own timezone; correct for today's demo clients, so no visible change expected
- Also (QA-PR34 Low): assert ask stamps ≤ window close − 30 min (today only asserts < close)
- Tests: history overlays stay inside their windows for a non-IST client; close−30m mutant fails

**A2 · Seed: workout/meal activity before relationship start on the start day**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- e.g. 04:12Z vs started 06:00Z

**C3 · Seed: checkins.updated_at before submitted_at**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- Now also on the QS5 item-2 rows (updated 03:30, submitted 14:30)

**C6 · Seed: Rohan's measurements observed before the check-in window**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- Observed 03:00, before the 03:30 window

**E2 · Seed: overdue_meal detected before window close**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- 65041a9f

**R1 · Seed: relationships with created_at = now but started earlier**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- 2 rows: 2fe7a6d8, 6a68b615

**X5 · Seed: plan_versions published_at before created_at**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- published_at < created_at

**X7 · Seed: subscription_versions 30 min before relationship creation**  
Ready · Bug · API seed · size S · depends on QS7 · frames —  
_Source: /workspace/qa/QA-PR33.md out-of-scope follow-ups (pre-existing, head = base). Seed chain._
- subscription_versions created 30 min before the relationship

**HB1 · Bug: Escape right after a drawer close adds a duplicate '/' history entry**  
Ready · Bug · Trainer web, iPad · size S · depends on DR2 · frames 02 panel  
_Source: /workspace/qa/QA-PR32.md F4. After DR2 merges; HomePage chain._
- Pre-existing (same on base): an Escape landing on the restored row within ~100 ms of a close also hits Home's grid escape && drawerExceptionId branch; closeDrawer() runs twice and pushes an extra '/', so Back needs 2 presses
- Fix: closeDrawer is idempotent (no second history push)
- Files: HomePage.tsx + test
- Tests: close then Escape within 100 ms → one Back returns to the previous page

**LB1 · Copy: “View reminder settings” → “View reminder history”**  
Ready · Bug · Trainer web · size S · depends on DR2 · frames 02 panel  
_Stacked on stack A top after DR2 (#38)._
- Rename the HM5 label to “View reminder history” (Firoz, 23 Oct)
- Files: trainer-web copy + its test
- Tests: label text updated; no other copy changes

**RL1a · API: closedReason on the Exception DTO**  
Done · PR [#62](https://github.com/thefitbud/thefitbud/pull/62) merged 30 Oct (4d9080a) · Backend · API, contracts · size S · depends on API1 · frames —  
_Source: /workspace/qa/QA-PR24.md advisory, QA-PR25.md follow-up 4. Backend half of the “Resolved by you” fix._
- Expose closedReason (coaching_ended, auto-resolve, trainer) on the Exception contract and mapException
- Tests: each close path maps to the right closedReason

**RL1b · Bug: “Resolved by you” shown for system or auto resolutions**  
Done · PR [#63](https://github.com/thefitbud/thefitbud/pull/63) merged 30 Oct 17:50 IST (53529e3) · Bug · Trainer web, iPad · size S · depends on RL1a, ED1 · frames 02 panel  
_Source: /workspace/qa/QA-PR24.md, QA-PR25.md follow-up 4._
- ExceptionDrawer.tsx ~L554 shows “Resolved by you · date” whenever resolvedAt is set, including coaching_ended closes and auto-resolve
- Use closedReason: e.g. “Closed · coaching ended” / “Cleared automatically” (QA-PR36 F1; copy confirmed with Firoz)
- Tests: trainer resolve, coaching_ended and auto-resolve each show the right label
- #62 RL1a and #54 ED1 merged 30 Oct; #63 retargeted to main but conflicts with main (DIRTY) — needs conflict resolution.

**NA1 · Bug: Needs attention summary double-counts (“Missed 10 meals · +9 more”)**  
Done · PR [#58](https://github.com/thefitbud/thefitbud/pull/58) merged 30 Oct (a0145ff) · Bug · Trainer web, iPad · size S · depends on HM5 (merged 30 Oct; DR1 still open, conflicts expected to be handled on #32) · frames 02, 135  
_Source: /workspace/qa/QA-PR28.md finding 4._
- The phrase already rolls up every meal, then adds “+N more” for the same items (Farhan: “Missed 10 meals · +9 more”; main: “Missed 6 meals · +6 more”)
- “+N more” counts only items not already in the phrase
- File to confirm (HomePage.tsx or the core formatter); HomePage chain if HomePage
- Tests: Farhan's summary counts each item once

**VT1 · Verify: demo-seed determinism test timeout under load**  
Ready · QA · API tests · size S · depends on H1 · frames —  
_Source: /workspace/qa/QA-PR21.md, QA-PR22.md, QA-PR24-round2.md check 8._
- “is deterministic for a fixed reference instant” took ~12 s under load against the 5 s default on branches without #21
- Fixed by #21's 30 s limit through the merge-up: verify on every stack-B branch under load (2 API suites + a seed run)
- Done: passes under load

**FK1 · Test bug: PRAGMA foreign_key_check assertions can never fail**  
Done · PR [#52](https://github.com/thefitbud/thefitbud/pull/52) merged 30 Oct (9ded251) · Bug · API tests · size S · depends on H1 · frames —  
_Source: /workspace/qa/QA-PR21.md advisory 3._
- The compat exec('PRAGMA foreign_key_check') returns no rows, so those assertions always pass
- Switch to SELECT * FROM pragma_foreign_key_check
- Tests: a deliberately broken FK makes the assertion fail (revert-proof)

**DEP1 · 64 dependency advisories (hono, drizzle, vite and others)**  
Ready · Infra · Repo · size S · depends on — · frames —  
_Source: implementation notes (not in a QA report). Lockfile change: start after stack B merges._
- Triage the 64 advisories; upgrade within semver where safe, one package family per commit
- No major upgrades without Firoz's OK; typecheck, lint and all tests green
- List what's left and why

**PK1 · Bug: “Plan ≥ kcal” shows raw sums about 1e6 too high**  
Done · PR [#53](https://github.com/thefitbud/thefitbud/pull/53) merged 30 Oct (9da7874) · Bug · Trainer web · size S · depends on — · frames 158 (to confirm)  
_Source: /workspace/qa/QA-PR22.md P1._
- MealPanel.tsx prints Plan ≥ {planTotals} kcal from a raw sum of energyKcalScaled
- Use the nutrient scale / shared formatter
- Tests: the shown plan total matches the plan's kcal

**DK1 · 15 drinks capped at 100 g/ml: add cup or glass servings**  
Ready · Backend · API seed, library · size S · depends on I2b · frames 172 (data)  
_Source: /workspace/qa/QA-PR22.md._
- 15 drinks (e.g. tea-black-brewed, coffee-brewed) cap at 100 g/ml, so a 150 ml cup is impossible; instructions still say “1 cup”
- Decided 23 Oct: add cup (150 ml) and glass (250 ml) servings to the 15 capped drinks via post-seed extras (locked files unchanged)
- Fix black tea's label with it

**AD1 · Bug: ask drawer has no focus trap**  
Done · PR [#51](https://github.com/thefitbud/thefitbud/pull/51) merged 30 Oct (9819c9d) · Bug · Trainer web, iPad · size S · depends on HM1 · frames 182  
_Source: /workspace/qa/QA-PR19-round2.md F3._
- Tab leaves the aria-modal ask drawer after 5 stops onto BODY and the nav behind it (main and PR, all 3 viewports); the exception drawer's trap works
- Trap focus the same way as ExceptionDrawer
- Files: CoachAskDrawer.tsx + test. OUT OF SCOPE: drawer content
- Tests: 30 Tabs, 0 escapes

**ED1 · Bug: focus after Mark reviewed in the exception drawer**  
Done · PR [#54](https://github.com/thefitbud/thefitbud/pull/54) merged 30 Oct (269e6f9) · Bug · Trainer web, iPad · size S · depends on DR1 (merged 30 Oct; DR1 still open, conflicts expected to be handled on #32) · frames 02 panel  
_Source: /workspace/qa/QA-PR19-round2.md F2._
- Mark reviewed inside the drawer removes the button and focus falls to BODY while the aria-modal drawer is still open (its n handler still live)
- Move focus to a sensible control inside the drawer
- Files: ExceptionDrawer.tsx + test
- Tests: after Mark reviewed, activeElement is inside the drawer

**DV1 · Seed: report clamps on the deviation path**  
Done · PR [#60](https://github.com/thefitbud/thefitbud/pull/60) merged 30 Oct 17:41 IST (41cc68f) · Bug · API seed · size S · built on QS1 (#22, merged); base main; re-check against the seed chain (QS3–QS6) before merge · frames —  
_Source: /workspace/qa/QA-PR22.md A1._
- activity.ts:294 calls foodByGrams without onClamp, so a future clamp there would be silent (none today: 532 items scanned)
- Wire onClamp (or throw in the generator) and assert template grams × dietScale stay within the cap

**AL1 · Seed: remove the poha and pav-bhaji serving allowlist**  
On hold · Bug · API seed · size S · depends on I2e · frames —  
_Source: /workspace/qa/QA-PR22.md P4. On hold until realistic servings exist._
- foodByGrams allowlists vegetable-poha “1 bowl (INDB)” and pav-bhaji “1 serving (INDB)” (implausible servings)
- Remove once the library has realistic servings for them

**DF1 · Disabled-field styling (trainer web)**  
Ready · Changed screen · Trainer web, iPad · size S · depends on DS7 · frames 179  
_Source: /workspace/qa/QA-PR26.md. Decide together with CE6._
- Disabled fields look editable when greyed out
- Decided 23 Oct: frame 179 read-only style for ended clients and any non-editable field; greyed disabled only for briefly unavailable controls
- Build after Firoz locks the DS7 frames; one S task per screen

**TS1 · Test /tmp sweep hardening**  
Done · PR [#56](https://github.com/thefitbud/thefitbud/pull/56) merged 30 Oct (68049cd) · Infra · API tests · size S · depends on H1 · frames —  
_Source: /workspace/qa/QA-PR21.md advisories 1–2._
- Dead-pid dirs have no minimum age: add a floor (~10 min) or a lock file, in case /tmp is ever shared across pid namespaces
- startedAfter uses the ctime of /proc/<pid>; read field 22 (starttime) of /proc/<pid>/stat instead
- Tests: a fresh dead-pid dir is kept; an old one is swept

**EC1a · API: at coaching end also close detected/active/acknowledged exceptions (rule 3)**  
Done · PR [#36](https://github.com/thefitbud/thefitbud/pull/36) merged 30 Oct 17:28 IST (71ba742) · Bug · API · size S · depends on API1, QS6 · frames —  
_Source: /workspace/qa/QA-PR25.md; EC1 locked 23 Oct. Stacked on #34._
- PR #36 (stack B, on #34): PASS (/workspace/qa/QA-PR36.md); ending closes all open statuses in one batch; second end → 409, no half-save
- Low pre-existing: drawer still says “Resolved by you” for coaching_ended → RL1a/RL1b
- Files: relationship-lifecycle.ts + test
- Waits for #31 (above CE3, which is held for IP1b #47).

**EC1b · API: block acknowledge/resolve on ended relationships (server-side read-only, rule 5)**  
Done · PR [#37](https://github.com/thefitbud/thefitbud/pull/37) merged 30 Oct 19:26 IST (0bb42d3) · Bug · API · size S · depends on EC1a · frames —  
_Source: EC1 rule 5. Stacked on #36._
- PR #37 (stack B, on #36): round 1 NEEDS FIXES (/workspace/qa/QA-PR37.md); fix round pushed @ cd78b86 (evaluateRelationshipExceptions no-op when ended; review-context skips detect)
- QA-PR37-round2.md still _in progress_ (interrupted by reboot) — recheck needed before merge
- Also blocks intervention notes and POST evaluate on ended; returns “Coaching relationship has ended”
- UI still shows Mark reviewed / Resolve / Nudge → CE7 (separate)
- Tests: 10+ new; 437 API tests green after fix round

**CE7 · Ended client: hide Mark reviewed / Resolve / Nudge in ExceptionDrawer**  
Ready · Bug · Trainer web, iPad · size S · depends on EC1b · frames 02 panel, 179  
_Source: /workspace/qa/QA-PR37.md F3. UI follow-up after EC1b._
- QA-PR37 F3: drawer still shows Mark reviewed, Resolve and Nudge for ended clients; clicks return a clean “Coaching relationship has ended” 409
- Hide those actions when the relationship is ended (read-only presentation); keep viewing
- Files: ExceptionDrawer.tsx (+ any ended banner). OUT OF SCOPE: backend guards (EC1b), CE6 frame-179 restyle
- Tests: ended Kavya drawer has no write actions; active unchanged

**EC1c · API: client log-time bounds (rule 2)**  
Ready · Bug · API · size S · depends on EC1b · frames —  
_Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations)._
- Reject clientLoggedAt in the future beyond a small clock drift
- Reject clientLoggedAt before the meal window start
- Tests: future beyond drift and before window start → rejected; in-window accepted

**EC1d · API: logs timestamped before ended_at not honoured for coaching_ended exceptions after reactivation (rule 1)**  
Ready · Bug · API · size S · depends on API1, EC1c · frames —  
_Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations). After EC1c (same files)._
- The ended period stays frozen
- Tests: end → reactivate → back-log before ended_at does not reopen or count against the closed exception

**EC1e · Seed: Kavya's coaching_ended exception resolved_at = ended_at (rule 4, seed part)**  
Ready · Bug · API seed · size S · depends on API1 · frames —  
_Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations)._
- Exception 403fdf94 resolved_at NULL → ended_at
- Tests: no coaching_ended row with NULL resolved_at after db:reset

**EC1f · Migration: backfill resolved_at for coaching_ended rows with NULL resolved_at (rule 4)**  
Ready · Migration · API · size S · depends on API1 · frames —  
_Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations)._
- Claims its migration number when it starts from main
- Remote runs need Firoz's per-environment approval
- Tests: migration sets resolved_at for NULL coaching_ended rows only

**EC1g · Align the meal lock read model with the server's after-resolve rule (rule 6)**  
On hold · Bug · API, core · size S · depends on API1 · frames —  
_Source: /workspace/qa/QA-PR25.md follow-ups 1–3 and 5–7; rules locked by Firoz 23 Oct (EC1, all six recommendations)._
- On hold until the offline outbox ships

## Phase 3 · Finish IMPL-1 + MD1 leftovers (mobile)

**F1a · API: Mark reviewed state + server-side Undo**  
Done · PR [#45](https://github.com/thefitbud/thefitbud/pull/45) merged 28 Oct (218f776) · Backend · API · size S · depends on H1 · frames feeds 05, 31  
_IMPL-1 phase B (backend)_
- Uses the existing 'acknowledged' status (no migration expected)
- Attention groups expose Needs you vs Reviewed; client leaves only when all items resolved
- Undo restores on the server; tests

**F1b · Needs you list + Reviewed section**  
Done · PR [#48](https://github.com/thefitbud/thefitbud/pull/48) merged 28 Oct (856b17d) · Changed screen · Trainer mobile · size S · depends on F1a · frames 05 default
- Needs you and Reviewed sections; “Reviewed, still open · 1 of 2 resolved”

**F1c · Needs you swipe → Mark reviewed + Undo toast**  
Done · PR [#61](https://github.com/thefitbud/thefitbud/pull/61) merged 28 Oct (c64e482) · Changed screen · Trainer mobile · size S · depends on F1b · frames 05 swipe, 05 toast
- Swipe left marks reviewed; toast “Rohan moved to Reviewed · 3 still open · Undo”

**F1d · Review sheet: item navigation**  
Done · PR [#64](https://github.com/thefitbud/thefitbud/pull/64) merged 28 Oct (ba605b8) · Changed screen · Trainer mobile · size S · depends on F1b · frames 31 item 1, 31 item 2
- Prev/next arrows, “1 of 3”, progress dashes

**F1e · Review sheet: resolved + all resolved**  
Done · PR [#65](https://github.com/thefitbud/thefitbud/pull/65) merged 28 Oct (b5dee28) · Changed screen · Trainer mobile · size S · depends on F1d · frames 31 resolved, 31 all-resolved
- Resolved by you · Undo, Next item; All 3 resolved → Next client

**MD1 · MD1 trainer mobile: Attention, Clients, status, check-in review**  
Done · PR [#16](https://github.com/thefitbud/thefitbud/pull/16) merged 22 Oct (ca1b5c2) · Changed screen · Trainer + trainee mobile · size — · depends on — · frames 05, 17, 18, 19
- Verification via P3 (MD1 narrow recheck)

**SEED · Realistic trainer demo world (SEED_DESIGN.md)**  
Done · PR [#17](https://github.com/thefitbud/thefitbud/pull/17) merged 22 Oct (a66facc) · Backend · API seed · size — · depends on — · frames —
- Caveats tracked in F4a

**IMPL-1 · MD1 fixes + Mark reviewed redesign + Home quiet refresh**  
Done · PR [#18](https://github.com/thefitbud/thefitbud/pull/18) merged 22 Oct (25511d4) · Changed screen · Trainer mobile, trainer web · size — · depends on — · frames 05, 31, 02
- Remaining phases tracked as F1a–F1k

**F1f1 · Sub-sheets: resolve confirm + nudge**  
Ready · Changed screen · Trainer mobile · size S · depends on F1e · frames 33, 34
- Layout per 31; wa.me prefill, you press Send

**F1f2 · Sub-sheets: ⋯ actions + add note**  
Ready · Changed screen · Trainer mobile · size S · depends on F1f1 · frames 35, 36
- Layout per 31

**F1f3 · Resolved read-only + ended client**  
Ready · Changed screen · Trainer mobile · size S · depends on F1f2 · frames 37, 41
- Read-only states, no actions for ended

**F1f4 · Loading + item no longer available**  
Ready · Changed screen · Trainer mobile · size S · depends on F1f3 · frames 38, 39
- Skeleton per 31 layout; not-found state

**F1f5 · Offline: actions disabled**  
Ready · Changed screen · Trainer mobile · size S · depends on F1f4 · frames 40
- Offline banner, actions disabled

**F1g · v3 trainer tab bar**  
Ready · Changed screen · Trainer mobile · size S · depends on F1b · frames 05 (tab bar)
- Needs you · Sessions · Clients · Check-ins · More (Sessions stub until S5a)

**F1h · Attention cards: names, “since” age, Mark answered Undo**  
Ready · Bug · Trainer mobile · size S · depends on F1b · frames 05
- Asked/Check-ins cards show client name (AttentionTab.tsx ~354–389)
- “since” = oldest open item (same as web)
- Mark answered has a 5 s Undo

**F1j · Needs you: all clear + offline cached**  
Ready · Changed screen · Trainer mobile · size S · depends on F1b · frames 43, 44
- States per mockup; v3 tab bar

**F1k · Needs you: couldn't load**  
Ready · Changed screen · Trainer mobile · size S · depends on F1j · frames 45
- Error with Retry (allowed recovery button)

**F3a · Clients list + Ended filter**  
Ready · Changed screen · Trainer mobile · size S · depends on P3, F1g · frames 17, 73  
_MD1-FIXES 10_
- Ended only under Ended; per-client weeks; one-row chips; state chips per mockup

**F3b · Client status**  
Ready · Changed screen · Trainer mobile · size S · depends on F3a · frames 18  
_MD1-FIXES 11–15_
- Header meta, Edit plan on web icon; kcal matches plan; Reminders card; per-client Recent activity with sublines

**F3c · Ended client status**  
Ready · Changed screen · Trainer mobile · size S · depends on F3b · frames 74  
_MD1-FIXES 16_
- Banner + Reactivate + last active week; read-only

**F3d · Check-in review + saved**  
Ready · Changed screen · Trainer mobile · size S · depends on F4a · frames 19, 75  
_MD1-FIXES 1–2_
- Rohan's check-in with scales, measurements, photos; 3 summary tiles

**F3e · Nudge log + Today link**  
Ready · Bug · Trainer mobile, API · size S · depends on F1f1 · frames 34  
_MD1-FIXES 9_
- Log “Nudge opened in WhatsApp · time” in Recent activity; prefill includes the Today link; never claim sent

**F4a · Seed quirks + seeded Rohan check-in**  
Ready · Backend · API seed · size S · depends on H1 · frames —
- Deepak on track, Farhan ≤ 10 open items (done once QS3 #28 merges), cities filled, current plan content in older history, Rohan Fri 16 Oct check-in
- db:reset and tests green

**F4b · Trainee Workout tab current week**  
Ready · Bug · Trainee mobile · size S · depends on P3 · frames 10  
_MD1-FIXES 17_
- Current week shows Lower body B · 6 exercises · 18 sets + missed card

**F4c · Next check-in after review**  
Ready · Bug · Trainee mobile · size S · depends on P3 · frames 101  
_MD1-FIXES 18_
- Today shows Next check-in on the weekly cadence after review

**F4d · Diet log buttons + offline planned kcal**  
Ready · Bug · Trainee mobile · size S · depends on P3 · frames 07, 86  
_MD1-FIXES 19–20_
- Eaten as planned / Something different back; offline adds planned kcal, reconciles on sync

**F5 · Capture scripts + seed spec → docs/design paths**  
On hold · Infra · Trainer web, API seed · size S · depends on X1 · frames —
- capture-tw-{a,b,c}-evidence.mjs, scripts/capture-ma.mjs, apps/api/src/seed/demo/spec.ts read docs/design/mockups/png (exists only after the design PR)

## Phase 4 · Client names in notifications


**N1a · Web/iPad: client name in bell + Home activity lines**  
Ready · Bug · Trainer web, iPad · size S · depends on HM2 · frames 123, 02 activity
- Bell items read “Rohan asked you on WhatsApp”, “Rohan submitted a check-in” (today AppShell.tsx :199, :207 have no name)
- Every activity line has the client name; no raw enums

**N1b · Mobile: client name in trainer notification list + push copy**  
Done · PR [#42](https://github.com/thefitbud/thefitbud/pull/42) merged 28 Oct (22f0798) · Bug · Trainer mobile, API · size S · depends on — · frames 120–122 copy
- notifications/copy.ts :114–124 (“Client asked on WhatsApp”, “Client renewal due”, “Client changed meal times”) → use the client name
- Check whether push text is built server-side too (to confirm) and fix there
- No raw enums

## Phase 5 · Platform & performance (Firoz's AGENT_TASK)

_Platform blockers (checked against Cloudflare docs 30 Oct): (1) DO class must be SQLite-backed (I7), not fixed by Paid; (2) D1 50 queries/invocation on Free → 1,000 on Paid (now bought); (3) CPU 10 ms on Free → 30 s on Paid (now bought); (4) migration-chain fix: already done 18 Oct (b5e4278), I9 dropped; (5) real Firebase auth (AU1/AU2) blocks staging/prod sign-in._

**I1a · Migration 0030: perf indexes**  
Done · PR [#39](https://github.com/thefitbud/thefitbud/pull/39) merged 30 Oct 16:14 IST (590cd7a) · Migration · API · size S · depends on H3 · frames —
- 0030_perf_indexes.sql verbatim; schema.ts mirrors it; journal + migration-chain test

**I1b · Query fixes: /exceptions/attention batching, no whole-table reads, user_roles memo**  
Ready · Backend · API · size M · depends on I1a · frames —  
_Polling moved to HM2._
- inArray batches ≤ 90 params; filter by trainer's clients everywhere listed in §4b
- Per-request user_roles memo
- Query-count tests

**I2a · Migration 0031: library schema**  
Done · PR [#41](https://github.com/thefitbud/thefitbud/pull/41) merged 30 Oct 16:23 IST (f826389) · Migration · API · size S · depends on I1a · frames —
- 0031_library_schema.sql verbatim + Drizzle edits (Appendix B); no drift on db:generate

**I2b · Locked foods 2026.10.9 library seed**  
Ready · Backend · API seed · size M · depends on I2a, D6 · frames 172 (data)
- D6 locked 23 Oct: 4 food types incl. beverage; cooking states raw / cooked / ready_to_eat / as_purchased
- Replace 01–06 + manifest; sha256 checked; 08_post_seed / 02b extras
- Foods 1,243, one default serving each
- OUT OF SCOPE: demo-seed slugs (I2e) and the tag fix (I2f)

**I2f · Library tag fix: dal-lentil-curry-generic is not Jain**  
Ready · Backend · API seed · size S · depends on I2b · frames 172 (data)  
_Firoz's D1 fix; separate from I2e so the locked library change is reviewable on its own._
- Remove the Jain tag from dal-lentil-curry-generic (its ingredients list onion and garlic)
- Apply as a post-seed correction (08_post_seed) so the locked 01–06 files and their sha256 stay unchanged (D18 locked 23 Oct)
- Library seed test asserts it isn't Jain-tagged

**I2e · Demo seed remap to library 2026.10.9 (D1 locked)**  
Ready · Backend · API seed · size M · depends on I2f, DV1 · frames —  
_Evidence: /workspace/fitbud-impl/D1-foods-and-D12-activate.md part A._
- afghani-chicken, chicken-yakhni → chicken-curry · tandoori-chicken → chicken-breast-grilled-without-sauce-skin-not-eaten
- bharwa-bhindi → okra-cooked-fat-added (Jain template N03 must contain no onion) · cabbage-carrot-thoran-with-coconut → beans-thoran · dal-dhokli → moong-dal-dhuli
- D16 (locked): N03 (Jain) dinner panchmel-dal → moong-dal-dhuli at 1.7–2× portion to keep protein; otherwise drop the Jain label from N03; panchmel-dal anywhere else → dal-lentil-curry-generic (none found on main @25511d4: only diets.ts:287, N03 dinner); I2f tag fix stays · jowar-dosa → plain-dosa
- lauki-ka-raita → cucumber-raita · mint-and-peanut-raita → cucumber-raita + a separate ~10 g peanuts-roasted item · matar-ki-sabzi → aloo-matar
- palak-mushroom-egg-bhurji → egg-bhujia-indian-style (N04 stays eggetarian) · safed-chana-curry-chole → kala-chana-curry · soyabean-curry → soybeans-boiled
- poha → poha-cooked-dish in the personas.ts slug list
- Rohan's plan portions adjusted to ~1,805 kcal / ~112 g protein (seed test band 1,700–2,000 kcal, 90–140 g)
- Done: db:reset loads with 0 missing slugs; seed tests pass; each template's diet tags stay consistent (Jain / vegan / eggetarian); full demo seed otherwise unchanged
- No migration in this task

**I2c · Exercise base emitter (03b) with storage keys**  
Ready · Backend · API seed · size M · depends on I2e · frames 173 (data)
- emit-exercise-base.ts → 03b_exercise_base.sql; keys exercises/<slug>/<n>.<ext>
- 1,362 exercises; foreign_key_check empty

**I2d · library-seed script: --remote guarded by --yes, chunking**  
Ready · Infra · API · size S · depends on I2c · frames —
- File list 01,02,02b,03,03b,04,05,06,08; remote skips 00/07; > 5 MB split; agent never runs remote
- See BR1.

**I3 · Migration 0032: meal_compliance.local_date + /clients window**  
Done · PR [#46](https://github.com/thefitbud/thefitbud/pull/46) merged 30 Oct 19:21 IST (ee04c87) · Migration · API · size S · depends on I2a · frames —
- Add + backfill + index; written on insert; /clients reads only the needed window

**I4a · wrangler.toml env.dev / staging / production**  
Ready · Infra · API · size S · depends on I2d · frames —
- Every binding repeated per env; local DLQ; no secrets in toml

**I4b · MEDIA_PREFIX + mediaKey helper**  
Ready · Backend · API · size S · depends on I4a · frames —
- Every MEDIA put/get/head/delete goes through mediaKey; keys env-agnostic

**I4c · Deploy / migrate / seed scripts per env**  
Ready · Infra · API · size S · depends on I4b · frames —
- deploy:<env>, db:migrate:<env>, seed --remote --env <env> --yes; nothing run remotely

**I5 · ZeptoMail email provider**  
Ready · Backend · API · size S · depends on I4c · frames —
- POST api.zeptomail.in/v1.1/email; token never logged; staging/prod only; mocked-fetch test
- v13 (beta must-have): provider choice is open (ZeptoMail, Cloudflare Email Service, Resend). Keep the provider behind one interface; secrets go in via the CF1 Worker-secrets step only, never in the repo or chat; verify the sending domain (SPF/DKIM) on staging

**I6 · Deploy per env**  
On hold · Infra · API · size S · depends on I1a–I5 · frames —
- Firoz runs: secrets → migrations --remote → seed --remote --yes → deploy; images already in R2
- Blocked by AU1, AU2, I7, and the Worker secrets step of CF1 (deferred to the first staging deploy).

**AU1 · Real Firebase ID token verification (jose + Google public keys)**  
Ready · Backend · API · size S · depends on — · frames —
- verifyFirebaseIdToken (apps/api/src/auth/firebase.ts) returns null when AUTH_MODE=firebase, so nobody can sign in on staging/prod
- Verify RS256 via jose createRemoteJWKSet against https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com; check iss https://securetoken.google.com/<FIREBASE_PROJECT_ID>, aud = project id, exp/iat, sub non-empty, auth_time ≤ now
- Used by routes/auth.ts and routes/realtime.ts; tests use a local JWKS
- Blocks I6

**AU2 · Refuse AUTH_MODE=test (and PUSH_PROVIDER_MODE=test, EMAIL_PROVIDER=dev_sink) outside local**  
Ready · Backend · API · size S · depends on AU1 · frames —
- If ENVIRONMENT is staging/production with test modes, return 500 with a clear log
- Add "staging" to the Env ENVIRONMENT type (today "local"|"production"|"preview")
- Blocks I6

**I7 · Durable Object migration: realtime class to SQLite (new_sqlite_classes)**  
Ready · Infra · API · size S · depends on — · frames —
- wrangler.toml has new_classes=["RelationshipRealtimeRoom"] (KV-backed); change to new_sqlite_classes before the first remote deploy (nothing deployed, no data migration)
- Workers Paid does NOT fix this
- Blocks I4a, I6

**I8 · D1 query budget per invocation + cron CPU**  
Ready · Backend · API · size S · depends on I1b · frames —
- Scheduled handler and /exceptions/attention loop over relationships with no db.batch
- Workers Paid (bought 30 Oct) raises the limit to 1,000 and cron CPU to 30 s, so the immediate blocker is resolved
- Keep I1b batching and add a query-count test for the cron path at demo-seed scale

**I9 · Migration-chain fix (flagged earlier)**  
Dropped · Migration · API · frames —
- Dropped 30 Oct: already fixed. Migration 0017 used a transaction and turned off FK checks (D1 rejects both); fixed 18 Oct in b5e4278 with PRAGMA defer_foreign_keys = true. The 30 migrations on main are clean and in order; 0030/0031 PRs don't clash.

**OB1 · Workers Logs: [env.staging.observability] 100%, [env.production.observability] head_sampling_rate 0.2**  
Ready · Infra · API · size S · depends on I4a · frames —
- wrangler.toml change (agent); local unaffected (LT1)
- Paid retention 7 days, 20M/month included; Observability pricing applies from 1 Dec 2026

**OB2 · Logging in scheduled/queue handlers; replace silent catch {}**  
Ready · Backend · API · size S · depends on OB1 · frames —
- Structured logs at start/end/error of scheduled() and queue()
- Replace bare catch { at domain/reminders.ts:231, 243, 795, 816, 844, 860, 880 and jobs/reminders.ts:54
- app.onError logs route, method, request id, user id

**OB3 · Cloudflare error/usage alerts**  
Ready · Ops (Firoz) · Cloudflare · size S · depends on OB1 · frames —
- Notifications for Worker errors/usage (budget alert already done 30 Oct under CF1)

**OB4 · Later observability: mobile Crashlytics, web error boundary, slow-D1 logging, X-Request-Id, email/push failure logs**  
Ready (later) · Backend/Mobile · All · size M (split) · depends on OB2 · frames —
- Split into S tasks when it starts

**CF1 · Firoz's manual Cloudflare steps**  
In progress · Ops (Firoz) · Cloudflare · size S · depends on — · frames —
- ✅ Buy Workers Paid ($5/mo) — done 30 Oct
- ✅ Budget alert — done 30 Oct
- ⏸ Set Worker secrets per env (MEDIA_SIGNING_SECRET, FIREBASE_SERVICE_ACCOUNT_JSON, WA_ACCESS_TOKEN, WA_APP_SECRET, WA_WEBHOOK_VERIFY_TOKEN, ZeptoMail token after I5) — deferred until the first staging deploy; Firoz runs it
- ☐ Rotate the Confluence credentials
- Agents never run remote commands

## Phase 6 · Backend for the redesign

**B1a · Migration 0034: load_kg / load_kind + parser + backfill**  
Ready · Migration · API · size M · depends on AC1a · frames feeds 11, 11c
- Parser: “40 kg”, “60kg”, lb → kg, “Bodyweight” → reps, “RPE 7” → text
- Set on save + backfill

**B1b · Strength read model API**  
Ready · Backend · API · size S · depends on B1a · frames feeds 160e
- Top set per exercise, workouts per week, “n sets not charted”

**B2a · Migration 0035: global check-in form v2 (D2 option A)**  
Ready · Migration · API · size S · depends on B1a · frames —
- Insert-only trigger kept; new assignments use v2

**B2b · Standard question keys in form schema + validation**  
Ready · Backend · API · size S · depends on B2a · frames feeds 14, 171
- Weight, measurements (picked subset), photos, ratings 1–5 Energy, Sleep quality, Stress, Hunger; own questions not charted

**B2c · Progress metrics API by question key**  
Ready · Backend · API · size M · depends on B2b · frames feeds 160–161
- Series by key; ranges 4 w / 12 w / All / Custom; compare two

**B3a · Migration 0036: payment records + subscription tracking fields**  
Ready · Migration · API · size M · depends on B2a · frames feeds 209–212, IP-08
- Tracking only (resolved 30 Oct): amount ₹, subscription type, coaching mode (online / in-person / hybrid), start and due dates, Paid/Unpaid, method Cash/UPI/Bank; CRUD on records
- No payment collection, no gateway, no invoices, no session counting (no sessions included/used/remaining)

**B3b · Client settings API: basic details + subscription edit**  
Ready · Backend · API · size M · depends on B3a · frames feeds 209–212
- Validation renewal after start; ended read-only on server; no collect/invoice endpoints
- Edits the tracking fields: amount, subscription type, coaching mode, start/due dates, paid/unpaid, method (Cash/UPI/Bank); no collection, gateway or session counting

**AC1a · Migration 0033: remove “configured” (D12 locked)**  
In review (on hold) · PR [#50](https://github.com/thefitbud/thefitbud/pull/50) · Migration · API, core · size S · depends on I3 · frames —
- UPDATE coaching_configurations SET status='draft' WHERE status='configured'; drop + recreate coaching_configurations_one_open_uidx WHERE status='draft'
- Leave configured_at in place, nullable and unused (no table rebuild)
- v12: when this merges, update the Confluence pages Workflows and States, Conceptual Database Schema, Conceptual API Contract and Current State to drop 'configured' (no Confluence change before then)
- States are draft → active → superseded; remove 'configured' from coachingConfigurationStatusSchema, labels and CSS; configuredAt returns null (deprecated)
- Migration-chain test; no route changes in this task

**AC1b · API: atomic Activate from draft + immediate schedule + discard route**  
In review (on hold) · PR [#57](https://github.com/thefitbud/thefitbud/pull/57) · Backend · API · size M · depends on AC1a · frames feeds 148, 149, IP-07  
_Evidence: D1-foods-and-D12-activate.md part B. Resolves D3._
- POST …/activate accepts draft: validates required sections (D17: short goal, expectations, check-ins, tracking; 422 CONFIGURATION_INCOMPLETE with missingSections[]), then supersedes the old version and activates the new one in ONE db.batch, keeping the record-version check
- Right after activation, materialise the schedule for this relationship (existing replenishRelationship) instead of waiting for the 5-min cron
- Editing active: existing POST …/versions opens vN+1; saving it goes live at once (D12b option a, no scheduled state)
- New DELETE route to discard the open vN+1 draft
- GET returns missingSections so the UI's “n sections left” matches the server; POST …/configure becomes a deprecated no-op; checkins.ts:696 → draft | active
- Tests: draft → active directly, rollback on version conflict, discard, assignments exist right after activation; update the 6 existing config test files

## Phase 7 · Trainee mobile

**T1a · Today v3: empty + partial**  
Ready · Changed screen · Trainee mobile · size S · depends on F4d · frames 04 empty, 04 partial (iOS + Android)
- kcal ring + macro bars + Workout/Meals/Steps chips; no %, no “left”
- v12: Steps stays a chip (Firoz 30 Oct); target from B4a (default 8,000)

**T1b · Today v3: done + rest day**  
Ready · Changed screen · Trainee mobile · size S · depends on T1a · frames 04 done, 04 rest
- Done chips green with check; rest day neutral chip

**T1c · Today v3: past day**  
Ready · Changed screen · Trainee mobile · size S · depends on T1b · frames 04 past
- Banner with Back to today

**T1d · Today v3: skeleton + offline**  
Ready · Changed screen · Trainee mobile · size S · depends on T1c · frames 96, 104
- Skeleton mirrors v3; “1 log waiting to send”

**T2a · Banners over v3 Today: meal + coach note**  
Ready · Changed screen · Trainee mobile · size S · depends on T1d · frames 29, 29b
- In-app banners over v3 Today

**T2b · Check-in reviewed banner + reminders paused card**  
Ready · Changed screen · Trainee mobile · size S · depends on T2a · frames 113, 115
- Per mockups on v3 Today

**T3a · Set entry: kg keypad + Bodyweight**  
Ready · Changed screen · Trainee mobile · size S · depends on B1a · frames 11, 11c
- kg default, ±2.5, Bodyweight toggle; saves numeric load

**T3b · Light rest timer**  
Ready · Changed screen · Trainee mobile · size S · depends on T3a · frames 11b
- Light rest card; light theme

**T4 · Check-in with picked measurements**  
Ready · Changed screen · Trainee mobile · size S · depends on B2b · frames 14, 14c
- Only picked measurements, last value, keypad; four 1–5 ratings

## Phase 8 · Trainer web & iPad

**W1a · Client workspace tabs consistent everywhere**  
Done · PR [#40](https://github.com/thefitbud/thefitbud/pull/40) merged 28 Oct (8f941be) · Behaviour · Trainer web, iPad · size S · depends on — · frames 162, 03 headers
- Overview · Plan · Activity · Progress · Check-ins · History; no Sessions/Packages/Configure tabs

**W1b · Client header ⋯ menu**  
Ready · New screen · Trainer web, iPad · size S · depends on W1a, CE2, IP1a, W1e · frames 208, 208b
- Client settings first; end coaching etc. per mockup

**W1c · Client settings overview**  
Ready · New screen · Trainer web, iPad · size S · depends on W1b, B3b · frames 209, 209b
- Basic details, subscription, payment records, relationship
- Shows amount, type, coaching mode, start/due dates, paid/unpaid, method (Cash/UPI/Bank); tracking only; no session counts or package counts from frame 209

**W1d · Edit basic details drawer**  
Ready · New screen · Trainer web · size S · depends on W1c · frames 210
- Validation; none on trainer mobile

**W2a · Edit subscription + validation**  
Ready · New screen · Trainer web · size S · depends on W1d · frames 211, 211b
- Drawer (frame 211, hybrid variant); renewal-before-start error
- Fields: amount, subscription type, coaching mode, start/due dates, paid/unpaid, method (Cash/UPI/Bank); tracking only. Do not build the frame's session-package fields (no sessions included/used/remaining)

**W2b · Client settings: ended read-only**  
Ready · New screen · Trainer web · size S · depends on W2a · frames 212
- Read-only, no edit actions

**W2c · Payment records (tracking only)**  
Ready · New screen · Trainer web · size S · depends on W2b · frames IP-08
- P15 wording; no collect/pay/invoice/gateway
- Tracking only: amount, Paid/Unpaid, method Cash/UPI/Bank, date. Build only the payment-records part of IP-08; skip its sessions part (no session counting)

**W3a · Plan › Coaching setup (no basics/subscription, editable targets)**  
Ready · Changed screen · Trainer web, iPad · size M · depends on W2a, CE5 · frames 148, 149
- No “Raises a flag when” column; workouts/week, meals/day, response window look editable; 149-ref not built
- v12: add an editable daily steps target, default 8,000, per client

**AC2 · Coaching setup: Save draft + Activate coaching, confirmation dialog, Save as vN+1**  
Ready · Changed screen · Trainer web, iPad · size S · depends on W3a, AC1b, DS3 · frames 148, 149 footers + DS3 dialog  
_Same file as W3a: serialize. No trainer-mobile or trainee changes._
- Remove markConfigured, its button and every 'configured' branch (pill, primary action)
- First setup: Save draft (autosave stays) + Activate coaching, disabled until required sections are complete, hint “Draft · n sections left: …”
- Activate opens the DS3 dialog (start date, workouts, meals, check-ins, tracking, reminders, plan published or “nothing scheduled until a plan is published”); one call to the atomic activate
- Editing active: first edit opens vN+1; footer Discard + “Save as vN+1” with the changes-only dialog; wording “new targets apply from tomorrow”
- Plan-aware success copy; update the e2e test and TW-11 checklist text
- v12: the steps target (default 8,000) is part of the saved version and the dialog summary

**W3b · Coaching mode section (hybrid)**  
Ready · New screen · Trainer web · size S · depends on AC2 · frames IP-07
- Inside Coaching setup, standard tabs
- v12: coaching mode (online / in-person / hybrid) is a field of the subscription version, alongside subscription type (B3a/B3b); this section reads and edits it

**W3c · Plans: one current program card**  
Ready · Changed screen · Trainer web · size S · depends on W1a, IP1b · frames 150
- Workout part + nutrition part + versions

**W4a · Client Check-ins tab + empty**  
Ready · Changed screen · Trainer web · size S · depends on W1a · frames 162, 162b
- Summary, chips All · To review · Overdue · Reviewed · Missed with counts; Overdue row wa.me draft

**W4b · Check-ins tab: ended + iPad**  
Ready · Changed screen · Trainer web, iPad · size S · depends on W4a · frames 162c, 192b
- Ended: no Overdue chip/rows; iPad 1024

**W5a · Check-in form builder standard questions**  
Ready · Changed screen · Trainer web · size S · depends on B2b · frames 171, 171b
- Fixed wording + measurement picker; own questions “not charted”; no body fat

**W5b · Overview Reminders card + Reminders drawer**  
Ready · Changed screen · Trainer web · size S · depends on W1a · frames 03c, 181
- Card › Details opens 181 over Overview (gap check 181 first)

**W6a · Progress: metric picker + weight**  
Ready · Changed screen · Trainer web, iPad · size S · depends on B2c, IP1b · frames 160
- Picker = standard questions; ranges 4 w / 12 w / All / Custom

**W6b · Progress: ratings + measurements**  
Ready · Changed screen · Trainer web · size S · depends on W6a · frames 160b, 160c
- 1–5 axis; multi-line measurements

**W6c · Progress: compare two metrics**  
Ready · Changed screen · Trainer web · size S · depends on W6b · frames 160d
- Two scales

**W6d · Progress: strength from logs**  
Ready · Changed screen · Trainer web · size S · depends on W6c, B1b · frames 160e
- Top set per exercise, workouts per week, “n sets not charted”

**W7a · Progress: photos compare**  
Ready · Changed screen · Trainer web · size S · depends on W6d · frames 160f
- Two dates, pose

**W7b · Progress: sparse + empty**  
Ready · Changed screen · Trainer web · size S · depends on W7a · frames 160g, 161
- Points, no trend claim; empty state

**W7c · Progress: ended + loading**  
Ready · Changed screen · Trainer web · size S · depends on W7b · frames 160h, 160i
- Read-only; skeleton

## Phase 9 · Trainer mobile quick jobs

**M1a · More + notifications off**  
Ready · Changed screen · Trainer mobile · size S · depends on F1g, P4 · frames 51, 53
- Profile card, permission row with Open settings

**M1b · Notification settings + offline save failed**  
Ready · Changed screen · Trainer mobile · size S · depends on M1a · frames 52, 58
- Toggles + quiet hours, optimistic with rollback

**M1c · Android 13 permission prompt**  
Ready · Changed screen · Trainer mobile · size S · depends on M1b · frames 54
- POST_NOTIFICATIONS before enabling

**M2a · Profile + sign out confirm**  
Ready · Changed screen · Trainer mobile · size S · depends on M1a · frames 55, 57
- Fields per mockup; confirm sheet

**M2b · Help (no mail app sheet)**  
Ready · Changed screen · Trainer mobile · size S · depends on M2a · frames 56
- mailto + Copy address / Copy details

**M2c · Role select + switch-role sheet**  
Ready · Changed screen · Trainer mobile · size S · depends on M2b · frames 59, 61
- Remember my choice; sneha.review never sees it

**M2d · Unsupported role**  
Ready · Changed screen · Trainer mobile · size S · depends on M2c · frames 60
- Help + Sign out

**M3a · Check-ins quick list: To review + Overdue**  
Ready · Changed screen · Trainer mobile · size S · depends on F1e, P4 · frames 46, 47
- To review opens review-sheet flow; Overdue wa.me prefill; no history

**M3b · Check-ins: empty + loading**  
Ready · Changed screen · Trainer mobile · size S · depends on M3a · frames 48, 49
- Per mockups

**M3c · Check-ins: Android**  
Ready · Changed screen · Trainer mobile · size S · depends on M3b · frames 50
- Android variant

**MA · Trainer-mobile Activity feed (scope per D4)**  
Dropped · Changed screen · Trainer mobile · size S each · depends on D4 · frames 62–72
- D4 locked 23 Oct: dropped; history stays web/iPad only

## Phase 10 · Sessions & in-person

On hold by Firoz (in-person batch).

**S1a · Migration (next free number, after 0037): sessions, attendance, check-in calls**  
On hold · Migration · API · size S · depends on B3a · frames —
- Tables only + Drizzle; no screen work

**S1b · Sessions + check-in calls API**  
On hold · Backend · API · size M · depends on S1a · frames feeds 200–207
- CRUD; optional meeting link; online-only coaches: calls only
- v12: external meeting links (Zoom/Meet etc.) on calendar entries are allowed; no in-app video or voice calling

**S1c · Attendance + package rules**  
On hold · Backend · API · size M · depends on S1b · frames feeds IP-11, IP-15
- Late counts as attended; no-show and late cancel < 12 h use a session; override + Waive; carry-over on by default

**S1d · Session/call reminders (queue)**  
On hold · Backend · API · size S · depends on S1c · frames feeds 205
- 15 min before calls, 45 min before sessions; phone delivery needs X4 (to confirm)

**S2a · Migration 0038 + coach-logged sets API**  
On hold · Migration · API · size M · depends on S1a, B1a · frames feeds IP-12–IP-14
- One or many present clients, same exercise, with Undo

**S2b · Trainee suggest-a-change API**  
On hold · Backend · API · size S · depends on S2a · frames feeds IP-16
- Trainee can't edit coach-logged sets; suggestion → coach accepts

**S3a · Web Sessions: week calendar**  
On hold · New screen · Trainer web, iPad · size M · depends on S1b · frames 200 calendar
- Inside Sessions; 6 am–9 pm incl. Sunday; calls dashed teal

**S3b · Web Sessions: online-only coach**  
On hold · New screen · Trainer web · size S · depends on S3a · frames 207
- Calls only

**S3c · Schedule-a-call prompts**  
On hold · New screen · Trainer web · size S · depends on S3a · frames 203, 204
- After review / when assigning; date, time, duration, link, note
- v12: the link is an external meeting link (allowed); no in-app calling

**S4a · iPad group session by exercise**  
On hold · New screen · iPad · size M · depends on S2a, S3a · frames IP-05
- Present clients only; Undo

**S4b · Log during/after a session (web/iPad)**  
On hold · New screen · iPad, trainer web · size S · depends on S4a, DS6 · frames IP-03, IP-04, IP-06 (reference)
- D15 locked 23 Oct: build from the DS6 frames (log after a session on web and iPad, live logging on iPad) once Firoz locks them

**S5a · Trainer mobile Sessions tab: today**  
On hold · New screen · Trainer mobile · size S · depends on S1b, F1g · frames IP-09
- Today's sessions + calls

**S5b · Batch roll-call**  
On hold · New screen · Trainer mobile · size S · depends on S5a, S1c · frames IP-11
- Expected → Present/Late/Absent

**S5c · Group logging**  
On hold · New screen · Trainer mobile · size S · depends on S5b, S2a · frames IP-12
- Present clients, same exercise, Undo

**S5d · Single-client + after-session quick log**  
On hold · New screen · Trainer mobile · size S · depends on S5c · frames IP-13, IP-14
- During session; after-session sheet

**S6a · Day agenda**  
On hold · New screen · Trainer mobile · size S · depends on S5a · frames 201
- Agenda per mockup

**S6b · Add session / add call**  
On hold · New screen · Trainer mobile · size S · depends on S6a · frames 202, 202b
- In-person session; check-in call
- v12: a call carries an external meeting link (allowed); no in-app calling

**S6c · Online-only Sessions tab + empty**  
On hold · New screen · Trainer mobile · size S · depends on S6b · frames 206, 206b
- Empty invites adding a call, light in-person hint

**S6d · Session/call reminder notification copy**  
On hold · New screen · Trainer mobile · size S · depends on S1d · frames 205
- Copy + deep link; delivery with X4

**S6e · Package + renew package (if kept)**  
Dropped · New screen · Trainer mobile · size S · depends on D5 · frames IP-15, IP-15b
- D5 locked 23 Oct: dropped; no package screens on trainer mobile

**S7 · Trainee: coach-logged workout + suggest a change**  
On hold · New screen · Trainee mobile · size S · depends on S2b · frames IP-16 (+ IP-10 reference)
- Read-only coach-logged sets; suggestion pending until accepted

## Phase 11 · Devices, push, design PR

**X1 · Design PR: merge design/today-rings-redesign after lock**  
Done · PR [#66](https://github.com/thefitbud/thefitbud/pull/66) merged 30 Oct 18:00 IST (5ae527b) · Infra · — · size S · depends on D9 · frames —
- Frames locked 28 Oct (D9): same review as P5 — the 22 Oct frames on design/today-rings-redesign (docs/design/README.md + mockups/png), then I open/merge the design PR
- Ask before opening/merging; then delete the design branch (ask first); unblocks F5
- #59 merged 28 Oct into design/today-rings-redesign (567f1d7). The branch is 127 commits behind main (30 Oct): merge main into it (merge, not rebase) before opening the PR. See X1b.

**X1b · Design PR: move mockups back to docs/spec/mockups/png**  
Dropped (v13) · Infra · — · size S · depends on X1 · frames —
- Superseded: #66 landed the locked frames at docs/design/mockups/png and the design branch is deleted
- Open a PR moving the mockup PNGs to docs/spec/mockups/png and update references (F5 capture scripts, seed spec.ts, README index)
- Merge main into design/today-rings-redesign first (127 behind). Ask before opening

**X2 · Phone build bugs: API URL not built in, predev filter, react-native-svg pin**  
Ready · Infra · Mobile · size S · depends on F4d · frames —
- The API base URL is not built into the phone app: read process.env.EXPO_PUBLIC_API_BASE_URL literally so Expo inlines it.
- predev is still broken on main: "pnpm --filter thefitbud build:packages" → "pnpm -w run build:packages".
- apps/mobile/package.json has "react-native-svg": "^15.16.0" with expo ~52.0.46; pin to the SDK 52 version (npx expo install react-native-svg, 15.8.0).

**X3 · EAS dev build + physical phone test**  
Ready · QA · Mobile · size M · depends on X2 · frames —
- expo-dev-client via EAS on SDK 52; Firoz has an Expo account (28 Oct); EAS credentials vaulted 28 Oct. Use an EAS development build (expo-dev-client); Expo Go cannot run SDK 52 for this app.
- Never paste Expo credentials in chat

**B4a · Migration 0037: daily_steps + per-client steps target**  
Ready · Migration · API · size S · depends on B3a · frames feeds 04, 93, 160
- daily_steps (relationship, trainee-local date, steps, source, synced_at), one row per day
- Steps target on the coaching configuration, default 8,000, editable per client

**B4b · Steps sync + read API**  
Ready · Backend · API · size S · depends on B4a · frames feeds 04, 160
- Trainee upserts daily totals; trainee reads today's steps + target; authorized trainer reads a client's daily steps

**T5a · Read steps from HealthKit / Health Connect + sync**  
Ready · Integration · Trainee mobile · size M · depends on B4b, X3 · frames —
- Needs the dev build (X3), not Expo Go; permission flow; daily totals only; syncs via B4b; feeds the T1a Steps chip

**T5b · Steps setup (iOS)**  
Ready · New screen · Trainee mobile · size S · depends on T5a · frames 93
- Was in G11; Apple Health permission screen

**T5c · Install Health Connect (Android)**  
Ready · New screen · Trainee mobile · size S · depends on T5a · frames 95
- Was in G11; install / open Health Connect, then grant

**W6e · Progress: steps metric**  
Ready · Changed screen · Trainer web, iPad · size S · depends on W6a, B4b · frames 160
- Steps as a metric in the picker; daily steps vs target

**BT1 · TestFlight + Google Play closed-testing builds**  
Ready · Infra · Mobile · size M · depends on X3, X6, BT3 · frames —
- EAS production-profile builds; eas submit to TestFlight (internal + external testers) and to a Play **closed** testing track
- App Store Connect / Play Console records, bundle ids, privacy questionnaire / Data safety form, Health permissions declarations (HealthKit, Health Connect READ_STEPS)
- Privacy policy URL from BT3 in both listings. Never paste Expo, Apple or Google credentials in chat; use vaulted credentials (X3)
- Beta stays closed: no public App Store release, no Play open/production track

**BT2 · Basic crash reporting**  
Ready · Infra · Mobile, API · size S · depends on X3, I4a · frames —
- Sentry (or equivalent) for Expo (sentry-expo / @sentry/react-native config plugin) and for Workers (@sentry/cloudflare or toucan); release + environment tags
- DSN via env/secrets per CF1, never committed; staging and prod only; scrub PII (no names, notes or health data in events)
- OB4 keeps the later extras (error boundary polish, slow-D1, request ids)

**BT3 · Privacy policy + Terms pages**  
Ready · New screen · Trainer web, trainee, trainer mobile · size S · depends on DS5 · frames DS5 legal frame
- Public trainer-web routes /privacy and /terms (with the D7 “Credits and licences” section); links from sign-in, settings/More (both mobile modes) and trainer web
- Stable URLs for the App Store and Play listings (BT1); text drafted by Firoz or counsel, not invented by the agent

**BT4 · Confirm D1 Time Travel + restore runbook**  
Ready · Ops/Docs · API · size S · depends on I4a · frames —
- Confirm Time Travel is available on the staging and prod D1 databases (retention per plan) with wrangler d1 time-travel info
- Write docs/runbooks/d1-restore.md: find a bookmark/timestamp, restore, verify, re-deploy; rehearse once on staging

**BP1 · In-app account deletion**  
Ready (later) · Backend + screen · API, mobile, trainer web · size M · depends on AU1 · frames new frame
- Before public release (Apple 5.1.1(v) and Google Play account-deletion rules); not needed for the closed beta
- Delete or anonymise the user's data, end active relationships, revoke Firebase user; web deletion URL for the Play listing

**BP2 · Automated D1 backups**  
Ready (later) · Infra · API · size S · depends on BT4 · frames —
- Before public release: scheduled export to R2 with retention, plus a restore test; complements Time Travel

**W0b · QA reports in docs/qa/**  
Ready · Docs · Repo · size S · depends on — · frames —
- Create docs/qa/ on main; new QA reports go there as QA-<ID or PR>.md (the /workspace/qa files are box-only); index in docs/qa/README.md

**W0c · Spec scaffolding in docs/specs/**  
Ready · Docs · Repo · size S · depends on W0b · frames —
- Add docs/specs/_TEMPLATE.md and docs/specs/batches/_TEMPLATE.md (see Spec rules), then the W1 batch file and the specs for its tasks

**X6 · Physical-device guide + app.json/eas.json changes**  
Ready · Docs/Infra · Mobile · size S · depends on X2 · frames —
- ID X6 (the clarification called it X5, but X5 is already the seed plan_versions bug)
- Write the guide (EAS development build with expo-dev-client; Expo Go cannot run SDK 52)
- app.json/eas.json changes: dev-client profile, EXPO_PUBLIC_API_BASE_URL per profile
- X3 then uses it

**X4 · Push notifications + Live Activity wiring**  
Ready · Backend · Mobile, API · size M each · depends on X3 · frames 27–28, 30, 105–122, 124
- v12: push is MVP (Firoz 30 Oct); off hold; split into one-notification tasks when it starts

## Phase 12 · Gap buckets (Approved frames; P1 turns each gap into an S task)

**G1 · Web sign in + first run**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on P1 · frames 01, 197, 125–128
- Matches or one S task per screen with a gap

**G2 · Roster + add client + invites**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on P1 · frames 136–145, 196
- As G1

**G3 · Overview, intake review, notes**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on P1 · frames 03 ×2, 03b, 146, 147, 188, 189, 192
- As G1

**G4 · Plans + builders**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on P1 · frames 151–157, 194, 195, 200 plan-filtered
- As G1

**G5 · Activity + check-in review (web)**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on P1 · frames 158, 159, 163, 164, 198
- As G1

**G6 · Templates + libraries**  
Ready · Gap bucket · Trainer web · size S each · depends on P1 · frames 168–170, 172–175
- As G1

**G7 · History, settings, asked drawer, system states, search**  
Ready · Gap bucket · Trainer web · size S each · depends on P1 · frames 165, 176, 177, 182–187, 190
- As G1

**G8 · Home all clear + iPad Home**  
Ready · Gap bucket · Trainer web, iPad · size S each · depends on HM2 · frames 135, 191
- As G1, after HM2

**G9 · Trainee sign in, onboarding, diet**  
Ready · Gap bucket · Trainee mobile · size S each · depends on P1 · frames 06, 06b, 103, 20–26, 07b, 08, 08b, 08c, 09, 100, 102
- As G1

**G10 · Trainee workout, progress, in-app notifications**  
Ready · Gap bucket · Trainee mobile · size S each · depends on P1 · frames 10b, 12, 13, 99, 15, 98, 114
- As G1

**G11 · Trainee settings, sync, ended**  
Ready · Gap bucket · Trainee mobile · size S each · depends on P1 · frames 16, 76–85, 87, 88, 89–92 (v12: 93 → T5b, 95 → T5c)
- As G1

# Appendix B · Resolved decisions

| ID | Decision | Where |
|---|---|---|
| D1 | Demo foods remap (locked 22 Oct) | Mapping + Rohan ~1,805 kcal / ~112 g → I2e; dal-lentil-curry-generic Jain tag → I2f. |
| D3 | Coaching setup editable after configured | Answered by D12: no 'configured'; edits open vN+1 → Save as vN+1. |
| D11 | Side panel scope + bulk (locked) | Per client, coaching-configuration exceptions only; bulk for compatible types → DS2, SPB, SP1–SP4. |
| D12 / D12b | Activate (locked; D12b option a) | draft → active → superseded; atomic activate + immediate schedule; Save as vN+1 goes live now, “new targets apply from tomorrow” → DS3, AC1a, AC1b, AC2. |
| D13 | Home full views (locked) | Needs attention, Renewals due, Asked you on WhatsApp; Check-ins card → inbox filtered To review → DS1, HV1–HV4. |
| D16 | N03 Jain dinner dal (locked 22 Oct, 6:43 pm) | N03 dinner uses moong-dal-dhuli instead of panchmel-dal; panchmel-dal elsewhere (if any) → dal-lentil-curry-generic; I2f tag fix stays → I2e back to Ready. |
| D2 | Global check-in form v2 (locked 23 Oct, option A) | v2 via a new migration (0035 in the planned order), insert-only trigger kept; past check-ins stay on v1, new assignments use v2 → B2a; B2b, B2c, T4, W5a, W6a–W6d, W7a–W7c back to Ready. |
| EC1 | Ended-client rules from PR #25 (locked 23 Oct, all six recommendations) | Close all open exceptions at end, server-side read-only, log-time bounds, frozen ended period, seed + backfill of resolved_at, lock alignment later → EC1a–EC1g. |
| D4 | Trainer-mobile Activity feed (locked 23 Oct) | Dropped; history stays web/iPad only → MA dropped, frames 62–72 retired. |
| D5 | Trainer-mobile package screens (locked 23 Oct) | Dropped → S6e dropped, IP-15 / IP-15b retired. |
| D6 | food_type / cooking_state value sets (locked 23 Oct) | Keep 4 food types incl. beverage; cooking states raw / cooked / ready_to_eat / as_purchased → I2b. |
| D7 | Image attributions (revised by Firoz, 23 Oct) | No separate credits screen; title, author, source, licence per CC BY-SA image in a “Credits and licences” section of a standard legal page next to Privacy and Terms, designed later → DS5. |
| D8 | R2 bucket fitbud-files-dev (done 23 Oct) | Empty and unreferenced on every branch; deleted 23 Oct 2026 10:13 IST. Remaining: fitbud-media-nonprod, fitbud-media-prod. |
| D9 | 22 Oct frames (23 Oct / clarified 28 Oct) | P5/X1: review & lock frames already on design/today-rings-redesign (docs/design/README.md + mockups/png). DS6/DS7 are separate new frames I design first. |
| D10 | Branch protection on main (23 Oct / updated 30 Oct) | Done: ruleset "main" active → H4 Done. |
| D14 | Renewal row destination (locked 23 Oct) | Interim: that client's subscription in Coaching setup until Client settings (W2a) ships → DS4, HM3, HV2. |
| D15 | Session logging on web/iPad (locked 23 Oct) | I design proper frames first (log after a session on web and iPad, live logging on iPad); Firoz locks them before build → DS6, S4b. |
| D17 | Required sections (locked 23 Oct) | Short goal, expectations, check-ins, tracking → DS3, AC1b. |
| D18 | Jain tag fix (locked 23 Oct) | Post-seed correction (08_post_seed); locked files and sha256 unchanged → I2f. |
| DK1 | Drink servings (locked 23 Oct) | Add cup (150 ml) and glass (250 ml) to the 15 capped drinks via post-seed extras; fix black tea's label → DK1. |
| DF1 + CE6 | Read-only vs disabled (locked 23 Oct) | Frame 179 read-only style (plain values, no input boxes) for ended clients and any non-editable field; greyed disabled only for briefly unavailable controls; I mock frames first → DS7, DF1, CE6. |
| Steps target | Default with coach override (locked 30 Oct) | Default 8,000 steps; the coach can change it per client in Coaching setup → B4a, W3a, AC2. Steps stays a chip on Today. |
| HM5 label | Reminder link copy (23 Oct) | “View reminder settings” → “View reminder history” → LB1. |
| D-new | Open design questions (neutral, for Firoz; not locked) | Per-client expectation thresholds (API change); no Next-up card OK?; IP-07 Configure folded into Coaching setup (W3b assumes yes); earlier mockup decisions to confirm: nudge same on both platforms, meal reminder Open + Snooze only, snoozed reminder resends once and skip not stored, one workout reminder a day, reactivate on web only, keep the reminder-time suggestion, fold logged meals. Note only; does NOT change T1a or frame 04. |

# Appendix C · Screen coverage matrix

| Frame | Screen · state | Platform | README status | Task | Coverage |
|---|---|---|---|---|---|
| 01 | Sign in · Default | Web | Approved | G1 | Spot-check (TW-B) |
| 02 | Home + review side panel · item resolved · Undo · Next item 2 of 3 | Web | Draft | SP1 | Rebuild |
| 02 | Home + review side panel · Needs you / Reviewed, item 1 of 3, actions footer | Web | Draft | SP1 | Rebuild |
| 02 | Home + review side panel · Resolve: outcome chips + private note | Web | Draft | SP2 | Rebuild |
| 03 | Client workspace · Overview · Full page | Web | Approved | G3 | Spot-check (TW-C) |
| 03 | Client workspace · Overview · This week, today selected (week/day nav) | Web | Approved | G3 | Spot-check (TW-C) |
| 03b | Client workspace · Overview · Previous week (week 5), Wed 7 Oct selected | Web | Approved | G3 | Spot-check (TW-C) |
| 03c | Client workspace · Overview · Reminders side card · Details opens 181 | Web | Draft | W5b | Rebuild |
| 04 | Today (Option B progress card) · done | Android | Locked | T1b | Rebuild |
| 04 | Today (Option B progress card) · empty | Android | Locked | T1a | Rebuild |
| 04 | Today (Option B progress card) · partial | Android | Locked | T1a | Rebuild |
| 04 | Today (Option B progress card) · past day | Android | Locked | T1c | Rebuild |
| 04 | Today (Option B progress card) · rest day | Android | Locked | T1b | Rebuild |
| 04 | Today (Option B progress card) · done | iOS | Locked | T1b | Rebuild |
| 04 | Today (Option B progress card) · empty | iOS | Locked | T1a | Rebuild |
| 04 | Today (Option B progress card) · partial | iOS | Locked | T1a | Rebuild |
| 04 | Today (Option B progress card) · past day | iOS | Locked | T1c | Rebuild |
| 04 | Today (Option B progress card) · rest day | iOS | Locked | T1b | Rebuild |
| 05 | Needs you · Needs you + Reviewed sections | iOS | Locked | F1b | Built (F1b #48) |
| 05 | Needs you · moved to Reviewed · Undo toast | iOS | Locked | F1c | Built (F1c #61) |
| 05 | Needs you · swipe left: Mark reviewed | iOS | Locked | F1c | Built (F1c #61) |
| 06 | Sign in · Password | iOS | Approved | G9 | Spot-check (MA) |
| 06b | Sign in · Code | iOS | Approved | G9 | Spot-check (MA) |
| 07 | Diet · Default | iOS | Approved | F4d | Rebuild |
| 07b | Diet · Photo after logging | iOS | Approved | G9 | Spot-check (MA) |
| 08 | Something different · Sheet | iOS | Approved | G9 | Spot-check (MA) |
| 08b | Something different · Changed the portion | iOS | Approved | G9 | Spot-check (MA) |
| 08c | Something different · Ate out | iOS | Approved | G9 | Spot-check (MA) |
| 09 | Food search · Results + quantity | iOS | Approved | G9 | Spot-check (MA) |
| 10 | Workout tab · Week + today's session | iOS | Approved | F4b | Rebuild |
| 10b | Workout day · Detail | iOS | Approved | G10 | Spot-check (MB) |
| 11 | Active workout · set entry · kg keypad | iOS | Draft | T3a | Rebuild |
| 11c | Active workout · set entry · Bodyweight (reps only) | iOS | Draft | T3a | Rebuild |
| 11b | Active workout · Rest timer | iOS | Draft | T3b | Rebuild |
| 12 | Workout summary · Done | iOS | Approved | G10 | Spot-check (MB) |
| 13 | Progress · Default | iOS | Approved | G10 | Spot-check (MB) |
| 14 | Check-in · Step 1 · weight, picked measurements, photos | iOS | Draft | T4 | Rebuild |
| 14c | Check-in · measurement entry · keypad | iOS | Draft | T4 | Rebuild |
| 15 | Notifications inbox · Default | iOS | Approved | G10 | Gap check |
| 16 | More · Default | iOS | Approved | G11 | Spot-check (MC) |
| 17 | Clients · Default | iOS | Approved | F3a | Rebuild |
| 18 | Client status · Default | iOS | Approved | F3b | Rebuild |
| 19 | Check-in review · Writing review | iOS | Approved | F3d | Rebuild |
| 20 | Invite acceptance · Default | iOS | Approved | G9 | Spot-check (MA) |
| 21 | Intake · Step 2 of 5 | iOS | Approved | G9 | Spot-check (MA) |
| 22 | Waiting for coach · Default | iOS | Approved | G9 | Spot-check (MA) |
| 23 | Reminder setup · Step 1 | iOS | Approved | G9 | Spot-check (MA) |
| 24 | Assigned meal plan · Training day | iOS | Approved | G9 | Spot-check (MA) |
| 25 | Ask coach · Sheet | iOS | Approved | G9 | Spot-check (MA) |
| 26 | Item unavailable · Default | iOS | Approved | G9 | Spot-check (MA) |
| 27 | Workout ongoing notification (Android) · Expanded (Android equivalent of 27b) | Android | Approved | X4 | Planned (push) |
| 27 | Live Activity · collapsed (state 1 of 2) | iOS | Approved | X4 | Planned (push) |
| 27b | Live Activity · expanded, touch and hold (state 2 of 2) | iOS | Approved | X4 | Planned (push) |
| 27c | Live Activity · collapsed, resting | iOS | Approved | X4 | Planned (push) |
| 28 | Lock · meal reminder · Open + Snooze | iOS | Approved | X4 | Planned (push) |
| 29 | In-app banner · meal over v3 Today | iOS | Draft | T2a | Rebuild |
| 29b | In-app banner · coach note over v3 Today | iOS | Draft | T2a | Rebuild |
| 30 | Lock · reminders · Check-in + note | iOS | Approved | X4 | Planned (push) |
| 31 | Exception review sheet · all 3 resolved · Next client | iOS | Locked | F1e | Built (F1e #65) |
| 31 | Exception review sheet · item 1 of 3 | iOS | Locked | F1d | Built (F1d #64) |
| 31 | Exception review sheet · item 2 of 3 | iOS | Locked | F1d | Built (F1d #64) |
| 31 | Exception review sheet · resolved · Undo · Next item | iOS | Locked | F1e | Built (F1e #65) |
| 33 | Resolve confirm sheet · outcome chips, note, lock helper | iOS | Approved | F1f1 | Rebuild |
| 34 | Nudge sheet · WhatsApp prefill, you press Send | iOS | Approved | F1f1 | Rebuild |
| 35 | ⋯ action sheet · Add note, Message on WhatsApp | iOS | Approved | F1f2 | Rebuild |
| 36 | Add note sheet · Visible to Rohan on | iOS | Approved | F1f2 | Rebuild |
| 37 | Resolved · read-only | iOS | Approved | F1f3 | Rebuild |
| 38 | Loading skeleton · Default | iOS | Approved | F1f4 | Rebuild |
| 39 | Item no longer available · Default | iOS | Approved | F1f4 | Rebuild |
| 40 | Offline · actions disabled | iOS | Approved | F1f5 | Rebuild |
| 41 | Ended client · read-only banner | iOS | Approved | F1f3 | Rebuild |
| 43 | Attention · all clear | iOS | Approved | F1j | Rebuild |
| 44 | Attention · offline cached | iOS | Approved | F1j | Rebuild |
| 45 | Attention · couldn't load | iOS | Approved | F1k | Rebuild |
| 46 | Check-ins · To review | iOS | Approved | M3a | Rebuild |
| 47 | Check-ins · Overdue | iOS | Approved | M3a | Rebuild |
| 48 | Check-ins · nothing to review | iOS | Approved | M3b | Rebuild |
| 49 | Check-ins · loading | iOS | Approved | M3b | Rebuild |
| 50 | Check-ins · Android | Android | Approved | M3c | Rebuild |
| 51 | More · Default | iOS | Approved | M1a | Rebuild |
| 52 | Notification settings · Default | iOS | Approved | M1b | Rebuild |
| 53 | More · notifications off → Open settings | iOS | Approved | M1a | Rebuild |
| 54 | Android 13 permission prompt · Default | Android | Approved | M1c | Rebuild |
| 55 | Profile · Default | iOS | Approved | M2a | Rebuild |
| 56 | Help · no mail app sheet | iOS | Approved | M2b | Rebuild |
| 57 | Sign out confirm · Default | iOS | Approved | M2a | Rebuild |
| 58 | Notification settings · offline, save failed snackbar | iOS | Approved | M1b | Rebuild |
| 59 | Role select · Default | iOS | Approved | M2c | Rebuild |
| 60 | Unsupported role · Default | iOS | Approved | M2d | Rebuild |
| 61 | Switch to coach view to open this? · Default | iOS | Approved | M2c | Rebuild |
| 62 | Activity feed · Default | iOS | Approved | MA | Retired (D4) |
| 63 | Activity · group expanded, 3 new pill | iOS | Approved | MA | Retired (D4) |
| 64 | Meal detail sheet · planned vs actual | iOS | Approved | MA | Retired (D4) |
| 65 | Workout detail sheet · sets | iOS | Approved | MA | Retired (D4) |
| 66 | Client picker sheet · Default | iOS | Approved | MA | Retired (D4) |
| 67 | Row actions sheet · Default | iOS | Approved | MA | Retired (D4) |
| 68 | Filtered empty · Meals | iOS | Approved | MA | Retired (D4) |
| 69 | Offline · cached | iOS | Approved | MA | Retired (D4) |
| 70 | Error with Retry · Default | iOS | Approved | MA | Retired (D4) |
| 71 | Skeleton rows · Default | iOS | Approved | MA | Retired (D4) |
| 72 | Activity · Android | Android | Approved | MA | Retired (D4) |
| 73 | Clients · Ended filter | iOS | Approved | F3a | Rebuild |
| 74 | Client status · ended summary + last week | iOS | Approved | F3c | Rebuild |
| 75 | Check-in review · saved, read-only | iOS | Approved | F3d | Rebuild |
| 76 | Reminder settings · Default | iOS | Approved | G11 | Spot-check (MC) |
| 77 | Reminders · permission denied | iOS | Approved | G11 | Spot-check (MC) |
| 78 | Reminders · paused notice, saving toast | iOS | Approved | G11 | Spot-check (MC) |
| 79 | Reminders · Android | Android | Approved | G11 | Spot-check (MC) |
| 80 | Quiet hours · Default | iOS | Approved | G11 | Spot-check (MC) |
| 81 | Quiet hours · validation | iOS | Approved | G11 | Spot-check (MC) |
| 82 | Your meal times · Default | iOS | Approved | G11 | Spot-check (MC) |
| 83 | Meal times · validation | iOS | Approved | G11 | Spot-check (MC) |
| 84 | Meal times saved toast · Default | iOS | Approved | G11 | Spot-check (MC) |
| 85 | Sync status · Default | iOS | Approved | G11 | Spot-check (MC) |
| 86 | Diet · offline, planned kcal added | iOS | Approved | F4d | Rebuild |
| 87 | Couldn't send · log against the new meal | iOS | Approved | G11 | Spot-check (MC) |
| 88 | Sign out with unsent logs · Default | iOS | Approved | G11 | Spot-check (MC) |
| 89 | Ended · Today history | iOS | Approved | G11 | Gap check |
| 90 | Reactivation card · Default | iOS | Approved | G11 | Gap check |
| 91 | Restart while coached by Asha · Default | iOS | Approved | G11 | Gap check |
| 92 | Request expired · Default | iOS | Approved | G11 | Gap check |
| 93 | Steps setup · Default | iOS | Approved | T5b | Planned |
| 95 | Install Health Connect · Default | Android | Approved | T5c | Planned |
| 96 | Today · loading skeleton (v3 layout) | iOS | Draft | T1d | Rebuild |
| 98 | Notifications · empty | iOS | Approved | G10 | Gap check |
| 99 | Workout · skip today sheet over Workout tab | iOS | Approved | G10 | Spot-check (MB) |
| 100 | Check-in sent · Default | iOS | Approved | G9 | Spot-check (MA/MB) |
| 101 | Check-in reviewed with note · Default | iOS | Approved | F4c | Rebuild |
| 102 | Diet · couldn't load | iOS | Approved | G9 | Spot-check (MA/MB) |
| 103 | Sign in · wrong password | iOS | Approved | G9 | Spot-check (MA) |
| 104 | Today · offline, 1 log waiting to send | Android | Draft | T1d | Rebuild |
| 105 | Android · Lunch and Snack · Open, Snooze | Android | Approved | X4 | Planned (push) |
| 106 | Lock · Time for Lower body B? · Start, Not today | iOS | Approved | X4 | Planned (push) |
| 107 | Android · workout reminder | Android | Approved | X4 | Planned (push) |
| 108 | Lock · 2 things left today | iOS | Approved | X4 | Planned (push) |
| 109 | Lock · check-in ready | iOS | Approved | X4 | Planned (push) |
| 110 | Android · check-in can still go in | Android | Approved | X4 | Planned (push) |
| 111 | Lock · Rahul's reminder | iOS | Approved | X4 | Planned (push) |
| 112 | Lock · plan updated | iOS | Approved | X4 | Planned (push) |
| 113 | Today · in-app banner check-in reviewed (rest day) | iOS | Draft | T2b | Rebuild |
| 114 | Inbox · coach answered | iOS | Approved | G10 | Gap check |
| 115 | Today · meal reminders paused card | iOS | Draft | T2b | Rebuild |
| 116 | Android · 2 notes | Android | Approved | X4 | Planned (push) |
| 117 | Lock · restart coaching | iOS | Approved | X4 | Planned (push) |
| 118 | Lock · coaching ended | iOS | Approved | X4 | Planned (push) |
| 119 | Lock · details hidden | iOS | Approved | X4 | Planned (push) |
| 120 | Trainer lock · merged alerts | iOS | Approved | X4 | Planned (push) |
| 121 | Trainer Android shade · Default | Android | Approved | X4 | Planned (push) |
| 122 | Trainer in-app banner · Default | iOS | Approved | X4 | Planned (push) |
| 123 | Web bell panel · Default | Web | Approved | N1a | Rebuild (client names) |
| 124 | Android lock · meal reminder | Android | Approved | X4 | Planned (push) |
| 125 | First run · profile | Web | Approved | G1 | Gap check |
| 126 | First run · starting templates | Web | Approved | G1 | Gap check |
| 127 | First run · invite first client | Web | Approved | G1 | Gap check |
| 128 | First run · you're set | Web | Approved | G1 | Gap check |
| 131 | Home + review side panel · nudge limited, client quiet hours, ⋯ menu | Web | Draft | SP2 | Rebuild |
| 132 | Home + review side panel · resolved item, read-only (from Reviewed) | Web | Draft | SP3 | Rebuild |
| 133 | Home + review side panel · item no longer exists | Web | Draft | SP3 | Rebuild |
| 135 | Home · all clear | Web | Approved | G8 | Gap check |
| 136 | Client roster · Default | Web | Approved | G2 | Spot-check (TW-B) |
| 137 | Roster · no match | Web | Approved | G2 | Spot-check (TW-B) |
| 138 | Roster · no clients | Web | Approved | G2 | Spot-check (TW-B) |
| 139 | Roster · error | Web | Approved | G2 | Spot-check (TW-B) |
| 140 | Roster · Ended | Web | Approved | G2 | Spot-check (TW-B) |
| 141 | Add client · Default | Web | Approved | G2 | Spot-check (TW-B) |
| 142 | Invite ready · Default | Web | Approved | G2 | Spot-check (TW-B) |
| 143 | Coached before · Reactivate instead | Web | Approved | G2 | Spot-check (TW-B) |
| 144 | Onboarding page · Invited (step 1 of 4) | Web | Approved | G2 | Spot-check (TW-B) |
| 145 | Onboarding page · Invited, revoke confirm | Web | Approved | G2 | Spot-check (TW-B) |
| 146 | Onboarding page · Intake submitted (step 3), review | Web | Approved | G3 | Spot-check (TW-C) |
| 147 | Onboarding page · Joined, intake in progress (step 2) | Web | Approved | G3 | Spot-check (TW-C) |
| 148 | Plan › Coaching setup · new client draft, Goal + Starting point open (no basics/subscription) | Web | Draft | W3a | Rebuild |
| 149 | Plan › Coaching setup · active, Expectations editing (targets only) | Web | Draft | W3a | Rebuild |
| 149-ref | Plan › Coaching setup · active, Expectations with flag-rules column (old 149) | Web | Reference | — | Reference (not built) |
| 150 | Plan › Plans · one current program (workout part + nutrition part) + versions | Web | Draft | W3c | Rebuild |
| 151 | Plan › Plans · no plan yet | Web | Approved | G4 | Spot-check (TW-D) |
| 152 | Workout plan builder · Default | Web | Approved | G4 | Spot-check (TW-D) |
| 153 | Builder · couldn't save / conflict | Web | Approved | G4 | Spot-check (TW-D) |
| 154 | Nutrition plan builder · Default | Web | Approved | G4 | Spot-check (TW-D) |
| 155 | Publish & schedule modal · Default | Web | Approved | G4 | Spot-check (TW-D) |
| 156 | Diet change scope · Default | Web | Approved | G4 | Spot-check (TW-D) |
| 157 | Publish · partial failure | Web | Approved | G4 | Spot-check (TW-D) |
| 158 | Activity · Meals | Web | Approved | G5 | Spot-check (TW-E) |
| 159 | Meal panel · planned vs actual | Web | Approved | G5 | Spot-check (TW-E) |
| 160 | Progress · default: metric picker, Weight, 12 w, latest entries | Web | Draft | W6a | Rebuild |
| 160b | Progress · check-in answers (Sleep, Energy, Stress 1–5) multi-select | Web | Draft | W6b | Rebuild |
| 160c | Progress · body measurements multi-line (waist, hip, chest) | Web | Draft | W6b | Rebuild |
| 160d | Progress · compare two metrics (Weight + Sleep, two scales) | Web | Draft | W6c | Rebuild |
| 160e | Progress · workout progress from logs (top set per exercise, workouts per week) | Web | Draft | W6d | Rebuild |
| 160f | Progress · progress photos compare (two dates, pose) | Web | Draft | W7a | Rebuild |
| 160g | Progress · sparse data (2 weigh-ins) | Web | Draft | W7b | Rebuild |
| 160h | Progress · ended client, read-only | Web | Draft | W7c | Rebuild |
| 160i | Progress · loading skeleton | Web | Draft | W7c | Rebuild |
| 161 | Progress · no data yet (empty) | Web | Draft | W7b | Rebuild |
| 162 | Client workspace · Check-ins tab · list with filters incl. Overdue | Web | Locked | W4a | Rebuild |
| 162b | Client workspace · Check-ins tab · empty | Web | Locked | W4a | Rebuild |
| 162c | Client workspace · Check-ins tab · ended client, read-only | Web | Locked | W4b | Rebuild |
| 163 | Check-in review · Default | Web | Approved | G5 | Spot-check (TW-E) |
| 164 | Check-in · already reviewed | Web | Approved | G5 | Spot-check (TW-E) |
| 165 | History · Default | Web | Approved | G7 | Spot-check (TW-G) |
| 166 | Check-ins inbox · Default | Web | Approved | HV4 | Gap check |
| 167 | Check-ins · none waiting | Web | Approved | HV4 | Gap check |
| 168 | Templates · Type, Owner, Status filters | Web | Approved | G6 | Spot-check (TW-F) |
| 169 | Templates · filtered empty (Nutrition + Mine) | Web | Approved | G6 | Spot-check (TW-F) |
| 170 | Onboarding form builder · Default | Web | Approved | G6 | Spot-check (TW-F) |
| 171 | Check-in form builder · standard questions + own questions | Web | Draft | W5a | Rebuild |
| 171b | Check-in form builder · measurements picker open | Web | Draft | W5a | Rebuild |
| 172 | Libraries · Foods + drawer | Web | Approved | G6 | Spot-check (TW-F) |
| 173 | Libraries · Exercises | Web | Approved | G6 | Spot-check (TW-F) |
| 174 | Templates · Use for client modal | Web | Approved | G6 | Spot-check (TW-F) |
| 175 | Templates · Make my copy modal | Web | Approved | G6 | Spot-check (TW-F) |
| 176 | Settings · Profile | Web | Approved | G7 | Spot-check (TW-G) |
| 177 | Settings · Notifications | Web | Approved | G7 | Spot-check (TW-G) |
| 178 | End coaching modal · Default | Web | Approved | P2 | Spot-check (TW-G), P2 recheck |
| 179 | Ended workspace · read-only | Web | Approved | P2 | Spot-check (TW-G), P2 recheck |
| 180 | Reactivate modal · Default | Web | Approved | P2 | Spot-check (TW-G), P2 recheck |
| 181 | Reminder responsiveness drawer · over client Overview, opened from Reminders card › Details | Web | Draft | W5b | Gap check |
| 182 | Asked coach drawer · Default | Web | Approved | G7 | Spot-check (TW-G) |
| 183 | Asked · pain topic | Web | Approved | G7 | Spot-check (TW-G) |
| 184 | Error state · Default | Web | Approved | G7 | Spot-check (TW-A) |
| 185 | Not found · Default | Web | Approved | G7 | Spot-check (TW-A) |
| 186 | Offline banner · Default | Web | Approved | G7 | Spot-check (TW-A) |
| 187 | No access · Default | Web | Approved | G7 | Spot-check (TW-A) |
| 188 | Note composer · drawer over Overview | Web | Approved | G3 | Spot-check (TW-C) |
| 189 | Note composer · delete confirm | Web | Approved | G3 | Spot-check (TW-C) |
| 190 | Search palette · Default | Web | Approved | G7 | Spot-check (TW-A) |
| 191 | Home · 1024 icon rail | iPad | Approved | G8 | Gap check |
| 192 | Client Overview · 1024, week nav | iPad | Approved | G3 | Spot-check (TW-C) |
| 192b | Client workspace · Check-ins tab · iPad 1024 | iPad | Locked | W4b | Rebuild |
| 193 | Exception drawer · 768 portrait | iPad (portrait) | Approved | SP1b | Rebuild |
| 194 | Builder · two panes, library toggle | iPad | Approved | G4 | Spot-check (TW-D) |
| 195 | Builder · read-only, open on a larger screen | iPad (portrait) | Approved | G4 | Spot-check (TW-D) |
| 196 | Roster · 768 portrait | iPad (portrait) | Approved | G2 | Spot-check (TW-B) |
| 197 | Sign in · single column | iPad (portrait) | Approved | G1 | Spot-check (TW-B) |
| 198 | Check-in review · 1024 stacked | iPad | Approved | G5 | Spot-check (TW-E) |
| 199 | Drawer · nudge waits for client quiet hours | Web | Approved | SP2b | Rebuild |
| 200 | Sessions · calendar (week) · sessions + check-in calls | Web | Locked | S3a | New |
| 200 | Plan › Plans · versions filtered Workout + Superseded | Web | Approved | G4 | Spot-check (TW-D) |
| 201 | Sessions · agenda · day agenda | iOS | Locked | S6a | New |
| 202 | Add to calendar · in-person session | iOS | Locked | S6b | New |
| 202b | Add to calendar · check-in call | iOS | Locked | S6b | New |
| 203 | Check-in review · schedule-a-call prompt | Web | Locked | S3c | New |
| 204 | Assign check-in · schedule-a-call prompt | Web | Locked | S3c | New |
| 205 | Session / call reminder · notification | iOS | Locked | S6d | New |
| 206 | Sessions tab (online-only coach) · calls | iOS | Locked | S6c | New |
| 206b | Sessions tab (online-only coach) · empty | iOS | Locked | S6c | New |
| 207 | Sessions (online-only coach) · calls only | Web | Locked | S3b | New |
| 208 | Client header ⋯ menu · open over Overview (Client settings first) | Web | Draft | W1b | New |
| 208b | Client header ⋯ menu · open over Overview | iPad | Draft | W1b | New |
| 209 | Client settings · overview: basic details, subscription & package, relationship | Web | Draft | W1c | New |
| 209b | Client settings · overview | iPad | Draft | W1c | New |
| 210 | Client settings · edit basic details (drawer) | Web | Draft | W1d | New |
| 211 | Client settings · edit subscription & package (drawer, hybrid) | Web | Draft | W2a | New |
| 211b | Client settings · validation: renewal before start | Web | Draft | W2a | New |
| 212 | Client settings · ended client, read-only | Web | Draft | W2b | New |
| IP-03 | Session detail · Default | Web | Reference | S4b | Reference (scope per D15) |
| IP-04 | Log workout for client · Default | iPad | Reference | S4b | Reference (scope per D15) |
| IP-05 | Group session · by exercise | iPad | Locked | S4a | New |
| IP-06 | In-person check-in · Default | iPad | Reference | S4b | Reference (scope per D15) |
| IP-07 | Plan › Coaching setup · Coaching mode section (hybrid), standard tabs | Web | Draft | W3b | New |
| IP-08 | Client settings › Subscription & package · hybrid client: package, payment records, sessions | Web | Draft | W2c | New |
| IP-09 | Sessions tab · today | iOS | Locked | S5a | New |
| IP-10 | Coach-logged workout (trainee) · Default | iOS | Reference | S7 | Reference |
| IP-11 | Batch roll-call · Expected → Present/Late/Absent | iOS | Locked | S5b | New |
| IP-12 | Group logging · same exercise, present clients | iOS | Locked | S5c | New |
| IP-13 | Single-client logging · during session | iOS | Locked | S5d | New |
| IP-14 | After-session quick log · sheet | iOS | Locked | S5d | New |
| IP-15 | Package · plain fields | iOS | Locked | S6e | Retired (D5) |
| IP-15b | Renew package · carry-over on | iOS | Locked | S6e | Retired (D5) |
| IP-16 | Suggest a change (trainee) · coach-logged set | iOS | Locked | S7 | New |
