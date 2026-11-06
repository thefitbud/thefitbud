---
id: I4c
title: Deploy, migrate and library-seed scripts per env (plus predev filter fix)
batch: W1
depends_on: [I4b, AU1]
lane: infra
files_owned:
  - apps/api/package.json  # scripts block only, D-W1-6 decided
  - apps/api/scripts/deploy-env.ts
  - apps/api/scripts/deploy-env.test.ts
frames: []
model: sonnet
size: S
---

## Outcome
Firoz has one documented command per env to deploy the API, apply D1 migrations and load the library, each refusing to run remotely without an explicit confirmation flag.

## Context
- v14 I4c: add `deploy:staging`, `deploy:production`, `db:migrate:staging`, `db:migrate:production` and a library seed entry `seed:library --env <env> --remote --yes` in `apps/api/package.json`. Agents add and test the scripts (with `--dry-run` where Wrangler supports it). **Only Firoz runs them for real.** There is no demo seed for remote envs.
- D1 names: staging `fitbud-staging`, production `fitbud-prod` (I4a). Wrangler commands: `wrangler deploy --env <env>`, `wrangler d1 migrations apply <db> --env <env> --remote`.
- Wrapper: `apps/api/scripts/deploy-env.ts <deploy|migrate> --env staging|production [--yes] [--dry-run]`. Without `--yes` it prints the exact command and exits 1. With `--dry-run` it runs `wrangler deploy --dry-run` (migrate has no dry run: it prints the command and exits 0). Use the existing `runCommandSync` (`apps/api/scripts/lib/run-command.ts`).
- The library entry calls `tsx scripts/library-seed.ts --env <env> --remote --yes`; the remote logic itself is I2d (library lane). If I2d has not merged, `library-seed.ts` refuses `--remote` today (`library-seed.ts:51-55`), which is the safe behaviour.
- **X2 fix moved here (W1.md ownership fix, 31 Oct 2026):** `apps/api/package.json` `predev`, `predb:reset` and `presetup:local` use `pnpm --filter thefitbud build:packages`, which CI reports as "No projects matched the filters". Change each to `pnpm -w run build:packages` (root `package.json:9` defines `build:packages`).

- D-W1-6 (Firoz, 31 Oct 2026): I4c owns only the `scripts` block of `apps/api/package.json`; AU1 adds `jose` to `dependencies`. Start after AU1 is merged (or merge `main` in first); do not edit `dependencies` or `devDependencies`.

## Gap list
- `apps/api/package.json:7-9`: `pnpm --filter thefitbud build:packages` in three pre-scripts.
- `apps/api/package.json:16-17`: only `db:migrate:local` and an env-less `db:migrate`; no deploy or per-env scripts.
- No `apps/api/scripts/deploy-env.ts`.

## Acceptance criteria
- [ ] `apps/api/package.json` has `deploy:staging`, `deploy:production`, `db:migrate:staging`, `db:migrate:production`, `seed:library:staging`, `seed:library:production`, each going through `deploy-env.ts` or `library-seed.ts` with `--env`.
- [ ] Running any of them without `--yes` prints the command and exits non-zero without calling Wrangler.
- [ ] `pnpm --filter @fitbud/api deploy:staging -- --dry-run` completes a Wrangler dry run locally.
- [ ] `predev`, `predb:reset`, `presetup:local` use `pnpm -w run build:packages`; `pnpm db:reset` works from a clean checkout.
- [ ] `git diff main -- apps/api/package.json` touches only the `scripts` block.
- [ ] The agent ran no remote command (state it in the PR).

## Out of scope
- I2d (`library-seed.ts` remote mode), WD1 (web deploy script, W2), I6 / I6b (Firoz's deploys). No CI deploy workflow.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits (only `.example` env files and the demo seed); one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `apps/api/scripts/deploy-env.test.ts`: argument parsing; refuses without `--yes`; builds the exact Wrangler argv per env with `runCommandSync` mocked; rejects unknown env names.
- Checks to run: `pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a

## Stop conditions
- A frame or decision is missing or ambiguous, or a decision this spec relies on is still marked **Open** in `docs/specs/batches/W1.md`.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command (`wrangler deploy`, `wrangler d1 … --remote`, `seed --remote`, `eas build`, `eas submit`), a secret, production data or a deploy.
