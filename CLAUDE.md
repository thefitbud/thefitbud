# FitBud · instructions for Claude Code

India-first coaching app for independent personal trainers. MVP, heading to a 20-trainer **closed** beta (TestFlight + Google Play closed testing).

The full engineering rules are in Agents.md, imported here. Everything below adds to them; where this file is more specific, it wins.

@Agents.md

## Source of truth for a task

1. **The task spec**, `docs/specs/<ID>.md`. It is self-contained: you need nothing beyond it, the frames it names and the code it names. Its batch file is `docs/specs/batches/Wn.md`.
2. **Locked frames**, `docs/design/mockups/png/` (index and precedence: `docs/design/README.md`). Every frame there is locked. Refer to a frame by its file name.
3. **Content rules**, `docs/spec/01-product-rules.md` and `docs/spec/banned-strings.json`.
4. **QA reports**, `docs/qa/` (`QA-<ID or PR>.md`; index in `docs/qa/README.md`).
5. **Confluence is reference only.** Read it if the connector is available and the spec points to it. Never block on it. If Confluence and the spec disagree, follow the spec and report the difference in the PR.

**Stop and ask** (comment on the PR or end the session with a question) when any of these is true. Never guess.
- The spec has no task file, or a frame or decision it needs is missing.
- A file outside the spec's `files_owned` must change.
- Any other stop rule in Agents.md "Decisions and stop rules" applies. There is **no mid-task human approval**: if the spec decides it (a new provider, an auth change), build it.

## Commands (repo root; Node 22.23+, pnpm 9.15.4)

```bash
pnpm install
pnpm setup:local          # creates apps/api/.dev.vars
pnpm build:packages       # needed before lint/typecheck/test
pnpm db:reset             # migrations + library + realistic demo seed (~2.5 min)
pnpm api                  # API on 8787
pnpm web                  # trainer web on 5173 (proxies /api to the API)
pnpm lint && pnpm typecheck && pnpm test   # what the required `ci` check runs
pnpm affected             # lint/typecheck/test for packages changed since HEAD^1
```

Trainer-web e2e (Playwright). The e2e global setup **resets the local DB and restarts the API**:
```bash
cd apps/trainer-web
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm test:e2e          # full e2e on spare ports
FITBUD_API_PORT=8788 FITBUD_WEB_PORT=5174 pnpm test:e2e:banned   # banned-strings scan only
```
On the default port 8787, global setup kills every local wrangler/workerd. On any other port it kills only what listens on that port. `SKIP_E2E_API_BOOT=1` reuses a running, seeded API. `TRAINER_WEB_URL` reuses a running web server.

Demo sign-in: `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`. All personas are in `docs/LOCAL_TESTING.md`.

## Visual check (UI tasks)

1. Run the app on the demo seed.
2. Capture the screen with Playwright at the frame's viewport: web 1440×900, iPad 1024×768 / 768×1024, iOS 393×852, Android 412×915.
3. Save the screenshots to `docs/qa/<ID>/` and put them next to the frame in the PR.

PASS means layout, copy and states all match the frame. Tests and CI passing are not enough.

## Product rules (never break)

- No auto-resolve: only the trainer resolves an exception. A late log is "logged late", never auto-closed.
- No auto-send: WhatsApp is a wa.me prefill that the user sends.
- No percentages or streaks. No invented insights, scores or recommendations.
- Dates read like "Wed 21 Oct". No ISO dates or raw enum values in the UI.
- Touch targets are at least 44 pt.
- Ended clients are read-only, on both the server and the UI.
- Payments are tracking only (amount, type, coaching mode, dates, paid/unpaid, method Cash/UPI/Bank). No collection, gateway, invoices or session counting.
- External meeting links on calendar entries are fine. No in-app video or voice calling.

## Working rules for agents

- **Never run remote or deploy commands.** That includes `wrangler deploy`, `d1 … --remote`, `seed --remote`, `eas submit` and store consoles. Firoz runs those.
- **No secrets** in code, chat, logs or commits. Only `.example` env files and the demo seed.
- **One task, one branch, one PR, off the latest `main`.**
  - Branch: `claude/<ID>-<slug>`.
  - PR title: `<ID>: <summary>`.
  - Fill in `.github/pull_request_template.md`.
  - Don't stack unless the spec says to.
  - Update a branch by merging `main` into it. Never rebase or force-push.
- **Keep PRs pure.** Backend/migration PRs are separate from UI PRs. Migrations go one at a time. Take the next free number from `apps/api/drizzle/meta/_journal.json` when the PR is opened, and renumber at merge time if another migration landed first. Never edit a migration that is already merged.
- **Merging** (only when the batch file allows it):
  - Merge commits only, bottom-up, when `ci` is green and review passed.
  - Never squash, never `--admin`.
  - Never touch PRs labelled `do-not-merge`.
  - Never close PRs, change labels or delete branches.
- **Standing owner authorization (repo owner, tech@thefitbud.com, in a Claude Code session on 31 Oct 2026; applies to this and all future tasks).** Agents act without asking for approval:
  - Open the PR when the work is done, get it reviewed by a fresh reviewer subagent that sees the specs and the diff (not your conclusions), fix what it confirms, and merge once `ci` is green and the review passes. This counts as the batch file allowing the merge. The merge rules above still apply (merge commits, never squash or `--admin`, `do-not-merge`, no label or branch changes).
  - Launch parallel sessions or subagents when the work benefits from it.
  - Still stop and report on the stop rules (a decision the spec leaves open, a destructive migration, another lane's file). Never run remote or deploy commands and never handle secrets; agents have no production credentials.
- **Usage limit:** at about 95% plan usage, start no new tasks; finish only what is in flight.
- **Report honestly.** List the checks you ran and their results. Say plainly what you could not run.
