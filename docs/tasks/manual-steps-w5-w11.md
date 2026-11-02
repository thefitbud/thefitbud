# Manual steps for W5–W11 (Firoz)

**Status:** DO NOT START: these batches are planning only, kept ready for after the beta ships. Do not pick up or run any task here until Firoz says so.

Separate from `manual-steps.md`. P0 blocks a task, P1 is a decision a task waits on, P2 is a step after merge.

## P0 · blocks tasks
- [ ] **W5** Merge QA1 (Maestro + Playwright capture) before ZA1 starts; ZA1's visual diff runs after `qa.yml`.
- [ ] **W7** Draw DS1 (views), DS2 (bulk resolve), DS4 (home HM3) and DS7 (ended read-only) frames for ZC10, ZC8, ZC2 and ZC13.
- [ ] **W8** Draw DS3 (client setup AC2) frames for ZD6.
- [ ] **W11** Draw the BP1 account deletion frames (`BP1-delete-account-ios.png`, `BP1-delete-account-web.png`) for ZG29.

## P1 · answers
- [ ] **W5** Q-W5-1, Q-W5-2, Q-W5-3 (see W5.md).
- [ ] **W6** Q-W6-1 backup token scope; Q-W6-2 account deletion grace period.
- [ ] **W7** Q-W7-1, Q-W7-2 copy.
- [ ] **W9** Q-W9-1 health libraries.
- [ ] **W11** Q-W11-1 Phase 10 stays on hold?

## P2 · after merge
- [ ] **W5** Re-seed production drinks (DK1) after ZA9 merges.
- [ ] **W6** BP2 backups: create the R2 bucket, lifecycle rule and a scoped API token as a Worker secret (never in a file); run one restore test.
- [ ] **W6** Run a read-only count for EC1f on staging (dropped task, D-W6-6) to confirm nothing needs backfill.
- [ ] **W6** Apply the new D1 migrations to staging, then production.
- [ ] **W9** Test steps sync on your Android dev build; submit the Play Health Connect declaration.
