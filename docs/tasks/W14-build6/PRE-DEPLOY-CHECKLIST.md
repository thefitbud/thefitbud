# W14 build-6 fixes: pre-deploy checklist (staging)

For Firoz, who runs every deploy and build (AGENTS.md: agents never run remote or deploy commands). Written 28 Nov 2026 by the QA lead session. Tick each item before its deploy step.

## What is in `main` and what each change needs

| Change | PR | Needs |
|---|---|---|
| Z14-45 Submit intake works | #605 | Mobile build |
| Z14-46 Intake layout (TR-03), ✕ → Finish later / Sign out | #606 | Mobile build |
| Z14-47 Intake polish (label gap, sleep labels, ✕ waits for save) | #615 | Mobile build |
| Z14-39, Z14-40, Z14-41, Z14-44 (W14 follow-up, mobile) | #594, #591, #595, #598 | Mobile build |
| W13 fix batch W13-13 … W13-22 (trainer web) | #596 … #613 | Trainer-web deploy |
| Z14-38 trainer-web cache headers | #593 | Trainer-web deploy |
| Z14-42 closed-window copy | #600 | API deploy (no migration) |
| Z14-48 exercise drawings API (once merged) | #616 | API deploy + drawings upload |
| Z14-49 trainer-web exercise thumbnails (once merged) | — | Trainer-web deploy, after the Z14-48 steps |
| Z14-50 e2e no longer depends on the seed date (once merged) | — | Nothing (test-only) |

None of these adds a database migration.

## Before the staging API deploy
- [ ] `main` CI is green on the commit you deploy (Actions, CI workflow, latest `main` run).
- [ ] **`MEDIA_SIGNING_SECRET` is set on staging** (`wrangler secret list --env staging`). Z14-48 signs exercise drawing links with it. If it's missing, the exercise Library list returns an error. Meal photos use the same secret, so if they load on staging it's set, but confirm. `docs/staging-setup.md` still lists it as "To do".
- [ ] The same secret is set on production before the next production deploy.

## Right after the staging API deploy (Z14-48)
- [ ] Upload the exercise drawings to the staging bucket. It can be re-run safely; drop `--yes` first to print the commands and check them:
  `pnpm --filter @fitbud/api media:upload-exercises -- --target staging --yes`
- [ ] Spot check: open Library › Exercises on staging web after Z14-49 is deployed, and confirm drawings show and one exercise without a drawing shows the dumbbell icon.
- [ ] At the next production deploy: same upload with `--target production`.

## Trainer-web deploy (W13 fixes, Z14-38, later Z14-49)
- [ ] Deploy after the API deploy above (Z14-49 reads the new fields).
- [ ] Cache headers: run the two `curl -sI` checks in `docs/qa/Z14-38/README.md`.
- [ ] Don't rely on the review panel's "Window" row date while testing. It can show the planned day instead of the due day for meals whose window ends after midnight. This is a known follow-up and isn't fixed yet.

## Mobile build (one EAS pair, from `main` at `6d0267d` or later)
- [ ] iOS `staging-store` to TestFlight and Android to Play internal. There are no over-the-air updates, so the mobile fixes only arrive through this build.
- [ ] Device checks: see `docs/qa/Z14-45/`, `Z14-46/` and `Z14-47/` READMEs. In short: intake shows "Step 1 of 2", Submit moves to the waiting screen and stays there after a relaunch, ✕ opens Finish later with Sign out and is dimmed while saving, Android back on step 1 opens the same sheet, and VoiceOver/TalkBack reads the sleep question as "not answered".
- [ ] Note whether the intake question headings feel small (about 17 pt against about 24 pt in frame TR-03).
