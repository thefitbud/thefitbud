# W3b · Cleanup: QA1 and W3 review follow-ups, qa-scripts required

**Status:** Draft (3 Nov 2026). Specs written for every W3b task (see Lanes). Approved by Firoz, 3 Nov 2026: turn the QA1/W3 review follow-ups into one small cleanup batch, built **after AB5** (merged, #175) and **before W4**. Decisions D-W3b-1 and D-W3b-2 decided by Firoz, 3 Nov 2026. No open questions.
**Source:** `docs/specs/batches/QA1.md` "Follow-ups raised" and `docs/specs/batches/W3.md` "3 Nov continuation" → "Follow-ups raised on 3 Nov" (written by ff7fcb8).
**Goal:** no misleading error on the password-reset screen, honest docs and tests for the auth/router seams, a required and never-stuck `qa-scripts` check, and the QA suite's known gaps closed before W4's dress rehearsal.
**Launch rule:** Firoz's launch message is the go. If a decision below is still marked **Open**, the tasks that need it stop and report.

## Decisions
- **Carried over (decided):** every W3 and QA1 decision, in particular D-W3-11 (SecureStore session), D-W3-12 and D-W3-18 (no misleading catch), D-QA1-6 (`ci.yml` stays the PR gate), D-QA1-7 (one staging writer at a time), D-QA1-10 (Maestro PR smoke is advisory), D-QA1-15 (qa-smoke lint path goes to BT2).
- **D-W3b-1 `qa-scripts` is a required status check on `main`. Decided by Firoz, 3 Nov 2026.** The `qa-scripts` job in `.github/workflows/qa.yml` costs about 15 s and runs only when `scripts/qa/**` changes; otherwise it is skipped, and a skipped job counts as passing. Every PR must therefore stay mergeable: the workflow always triggers on PRs (no top-level `paths` filter; path logic stays job-level) and `qa-scripts` is never left Expected, Pending or Cancelled — which means the workflow-level `concurrency` group (D-QA1-7) moves onto the staging jobs. **CU4** makes the workflow change and, after it merges, applies the branch protection with `gh api` (the one remote write this decision authorises; every existing protection setting is preserved).
- **D-W3b-2 CU6 may add mobile dev dependencies and change `pnpm-lock.yaml`. Decided by Firoz, 3 Nov 2026** (with the batch): a render harness needs a test renderer. Dev dependencies only, no native module, no new EAS build. CU6 is the only W3b task that owns the lockfile.
- **D-W3b-3 Item 7 (lint/typecheck of `e2e-staging/**` and `qa-smoke/**`) is folded, not sequenced.** Recorded by the planning bot, 3 Nov 2026. `qa-smoke` is already typechecked on `main` (QT6, `apps/api/tsconfig.json`); its lint path is **folded into BT2** (W4, owns `apps/api/package.json`; `docs/specs/BT2.md` gains the criterion and `apps/api/qa-smoke/**` for lint fixes). The trainer-web half (`e2e-staging/**` lint and typecheck) is **CU10** here. Sequencing after BT2 was rejected because W3b runs before W4.
- **D-W3b-4 AppRouter gets a test, not an `offline` route.** Recorded by the planning bot, 3 Nov 2026: a new route changes `AuthProvider`'s route union (product/architecture scope); CU3 extracts the decision and pins it.

## Lanes
| lane | tasks | model | files_owned (summary) | specs |
|---|---|---|---|---|
| mobile | CU1 **[top priority]** → CU2 **[top priority]** → CU3 **[top priority]** → CU5 → CU6 → CU7 → CU15 | sonnet (CU1, CU2, CU3, CU5, CU7, CU15), opus (CU6) | `apps/mobile/src/trainee/settings/PasswordScreen.tsx`, `passwordResetErrors*.ts` (CU1); `apps/mobile/src/lib/api.ts` comment (CU2); `apps/mobile/src/navigation/AppRouter.tsx`, `routerView*.ts` (CU3); `apps/mobile/src/lib/reportError*.ts` (CU5); `apps/mobile/package.json` devDeps, `pnpm-lock.yaml`, `apps/mobile/vitest.config.ts`, `apps/mobile/src/test/render.tsx`, `ErrorBanner.render.test.tsx` (CU6); `apps/mobile/src/trainer/MoreScreen*.ts*` (CU7); `apps/mobile/src/components/Field*.tsx`, `apps/mobile/.maestro/common/sign-in-code.yaml` (CU15) | CU1.md, CU2.md, CU3.md, CU5.md, CU6.md, CU7.md, CU15.md |
| ci | CU4 **[top priority]** | sonnet | `.github/workflows/qa.yml`; branch protection after merge (D-W3b-1) | CU4.md |
| web | CU8 | sonnet | `apps/trainer-web/src/auth/AuthLayout.tsx`, `apps/trainer-web/src/styles.css` (`.auth-formside`), `apps/trainer-web/e2e/bt3f-signin-footer.spec.ts` | CU8.md |
| qa | CU9 → CU10 | sonnet | `.gitignore`, `scripts/qa/summarize*.mjs` (CU9); `apps/trainer-web/package.json` scripts, `apps/trainer-web/e2e-staging/**` (CU10) | CU9.md, CU10.md |
| qa-seed | CU11 → CU12 → CU13 | opus (CU11), sonnet (CU12, CU13) | `apps/api/src/seed/qa/**`, `apps/api/scripts/qa-seed*.ts`, `apps/api/qa-smoke/trainer.smoke.test.ts`, `apps/api/qa-smoke/expectations.ts`, `apps/mobile/.maestro/flows/trainee/checkin.yaml` (CU11); `apps/api/qa-smoke/negative.smoke.test.ts` (CU12); `packages/contracts/src/me-week.ts`, `packages/contracts/src/index.ts` export, `apps/api/src/routes/me-day.ts` `/week` response, `apps/api/qa-smoke/trainee-day.smoke.test.ts` (CU13) | CU11.md, CU12.md, CU13.md |
| docs | CU14 | sonnet | `AGENTS.md` (one sentence, API bullet) | CU14.md |
| human | device screenshots owed by #164 (see Order step 5): **manual, owned by FitBud UI after the next iOS/Android dev build**, not an agent task | — | `docs/qa/` (that task's folder) | — |

Two tasks never own the same file. `qa-scripts` (CU4) runs on CU9 because CU9 touches `scripts/qa/**`, which proves the required check end to end. Migrations: none. Lockfile: CU6 only (D-W3b-2). Cross-batch: BT2 (W4) gains `qa-smoke` lint (D-W3b-3); W3b runs before W4, so nothing in W4 waits on a W3b file except BT2 merging `main` in as usual.

## Order (3 implementer slots, one Max seat)
1. **Start:** slot 1 **CU1** (P0, honest-error rule). Slots 2 and 3 stay free until CU1 merges, so the P0 trio lands first.
2. **Then, in order:** **CU2** (after CU1), **CU3** (after CU2), **CU4** (after CU3; P0, D-W3b-1), then the QA hygiene and the rest as slots free: **CU9** (after CU4), **CU11** (after CU4), **CU5** (after CU3 and CU4), **CU10** (after CU9), **CU12** (after CU11), **CU6** (after CU5), **CU13** (after CU12), **CU8** (after CU4), **CU14** (after CU4), **CU7** (after CU6), **CU15** (after CU6 and CU7). Never more than 3 at once.
3. **Merge** each PR when it is ready: `ci` green, `qa-scripts` green or skipped (required from CU4 on), review PASS, merge commits, bottom-up within a lane.
4. **After CU4 merges:** CU4's implementer applies the branch protection (D-W3b-1) and pastes the before/after required-checks read in the PR.
5. **FitBud UI:** after the next dev build (AB5's iOS build and the Android rebuild), capture the AB4 screenshots into `docs/qa/AB4/`.

## Specs (written 3 Nov)
`docs/specs/` has CU1–CU15, each with `batch: W3b`. `docs/specs/BT2.md` (W4) gains the `qa-smoke` lint criterion (D-W3b-3).

## Done when
- All CU tasks merged; `qa-scripts` listed as a required check on `main` and a PR that does not touch `scripts/qa/**` merges with it skipped.
- The password-reset screen passes the no-misleading-catch rule; the follow-up lists in `QA1.md` and `W3.md` are all covered by a task, by BT2, or by the human row above.

## What Firoz reviews
- CU1's copy table, CU4's protection before/after, CU7/CU8 screenshots, CU13's reported api-client mismatch (a decision for later).

## Report (filled in by the orchestrator at the end)
