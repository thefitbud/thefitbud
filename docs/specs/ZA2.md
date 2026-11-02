---
id: ZA2
title: P1 full UI audit on main: per-screen gap lists for G1–G11 and the W7–W10 screens
batch: W5
depends_on: [ZA1]
lane: qa-audit
files_owned:
  - docs/qa/P1/**
  - docs/qa/QA-P1.md
frames: []
model: opus
size: M
---

## Outcome
Firoz and the planner have one report that says, for every built screen, which frames it matches and exactly what is missing, so the W7–W11 specs are refreshed with real gaps before any UI task starts.

## Context
- Covers master-list (v13) items P1, P3, MBR, MCD. Everything the implementer needs from those rows is pasted here.
- Scope: every frame in `docs/design/mockups/png/` that has a built screen (Appendix C of the master list grouped them as G1–G11 plus the redesign phases). Viewports: 1440x900 (web), 1024x768 and 768x1024 (iPad), 393x852 (iOS frames) and 412x915 (Android frames).
- Run locally only, on the realistic demo seed (`pnpm --filter @fitbud/api db:reset && seed`), trainer web via `pnpm dev`, mobile via Expo web at the frame viewport. Never run e2e global setup against the running dev app: it kills `wrangler`/`workerd` and hard-codes port 8787.
- Fold-ins: P3 (MD1 narrow recheck: frames 17, 18, 19, 73, 74, 75, 10, 101, 07, 86), MBR (MB fix2 recheck: the claim of 1 MATCH / 21 CLOSE), MCD (confirm the clock-dependent API date tests are fixed: run `pnpm --filter @fitbud/api test` with `TZ=Pacific/Kiritimati` and `TZ=Pacific/Pago_Pago`).
- Known inputs to confirm: trainer web QA found screens that fail the design guide; mobile leftovers (ISO dates on Today/Diet, Diet kcal vs meals mismatch, 28 raw enum labels) are fixed by ZA3 and ZA6, so check them after those merge.
- Output format, per bucket file `docs/qa/P1/G<n>.md` and `docs/qa/P1/redesign.md`: one row per frame with verdict MATCH / CLOSE / GAP, and for each GAP a bullet with `file:line` on `main` and the frame detail it misses. `docs/qa/QA-P1.md` is the index with counts and the list of W11 tasks whose gap list changes.
- Design guide for every UI task: `docs/design/README.md` (v3 rules and the frame index), `docs/design/DESIGN-NOTES.md` (palette, type, spacing, components, data and time), `docs/design/DECISIONS-21OCT.md`, and the screen spec in `docs/spec/`. Dates read like "Wed 21 Oct" (never ISO), enums always go through `labelFor` (`packages/core/src/labels.ts`), touch targets are at least 44 pt / 44 px, counts and kcal use tabular numbers.
- Design-review step (W5 ZA1): after capturing, run `node scripts/qa/visual/diff.mjs --task <ID>` on the captures and attach the generated `docs/qa/<ID>/design-review.md` to the PR. A frame difference the spec does not explain is fixed or listed in the PR as a follow-up, never silently left.

## Gap list
- No screen-by-screen audit exists since the 21 Oct frames; `docs/qa/README.md` lists only I2b, I2c and AB2 reports.
- The W11 gap-bucket specs (ZG1–ZG20) carry gaps found by a code read on `main` at 4d6d264; P1 confirms or replaces them with captured evidence.
- `apps/api/src/seed/demo/demo-seed.test.ts:708-712` is the clock-sensitive determinism test MCD refers to.
- Written against `main` at 4d6d264. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] Every frame in Appendix C that has a built screen appears in exactly one `docs/qa/P1/*.md` table with a verdict and a capture path.
- [ ] Every GAP row has at least one `file:line` on the audited `main` SHA and names the target task ID (ZC…, ZD…, ZE…, ZF… or ZG…), or `new` when no task covers it.
- [ ] `docs/qa/QA-P1.md` lists the MCD result with both TZ runs, and the P3 / MBR rechecks with each item still open.
- [ ] Captures are saved under `docs/qa/P1/captures/` at the viewports above and each has a design-review line from ZA1's script.
- [ ] No app code changes.
- [ ] No ISO dates, raw enum values, percentages or streaks on the changed screens; `docs/spec/banned-strings.json` passes.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- Fixing any gap (W7–W11 tasks do that).
- Staging or production runs.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- None beyond running the existing suites; the report records the commands and their result.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- No frame in the repo yet (planned frame above). Capture to `docs/qa/ZA2/` and attach; the design review compares against the planned frame once it lands.

## Stop conditions
- A screen cannot be reached on the demo seed without a code change; list it as `unreachable` with the reason.
- More than 40 GAP rows land on one bucket; split the bucket file and say so in the index.
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** or listed as a question in `docs/specs/batches/W5.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
