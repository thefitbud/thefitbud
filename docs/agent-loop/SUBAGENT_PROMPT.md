# FitBud Sub-Agent Slice Prompt Template

Fill every section for **one slice only**. Do not hand a sub-agent the whole MVP.

---

## Slice

- **ID:** e.g. `C3`
- **Title:** e.g. Workout loop (end-to-end)
- **Depends on (must be done):** e.g. `C2`

## Outcome

- One user-visible result this slice must deliver.

## Scope

- Allowed applications / packages / files.
- Explicit non-goals for this slice.

## Confluence pages to read

List only pages required by [Agents.md](../../Agents.md) context-loading rules:

-
-

## Figma (UI slices only)

- Link / frames when applicable.
- Precedence: Project Details / Workflows / UX Architecture win over Figma.

## Steps

1. Contract or schema work
2. Implementation
3. Verification

## Risks or questions

- Only material uncertainties. Stop if an answer would change product behavior or architecture.

## Done when

- Observable acceptance criteria (bullet list).

## Verification commands

Use root workspace scripts. Do not claim pass unless executed:

```bash
pnpm lint
pnpm typecheck
pnpm test
# plus slice-specific: auth, migration, integration, e2e, offline, a11y
```

## Stop conditions (human approval)

Stop and report without improvising when the slice would:

- Change MVP scope or a documented non-goal
- Introduce a new role, application, provider, or infrastructure service
- Change authentication or authorization boundaries
- Change ownership semantics
- Make a destructive or irreversible migration
- Remove or rewrite historical coaching records
- Change published-plan immutability or version-effective behavior
- Choose unspecified conflict resolution that could discard user data
- Put sensitive information in notifications, logs, or analytics
- Require production credentials or direct production-data access

## Security

- Do not copy secrets from Confluence Credentials into the repo, logs, tracker, prompts, or commits.
- Use local `.env` / `.dev.vars` only (gitignored).

## After completion

1. Update [SLICE_TRACKER.md](./SLICE_TRACKER.md): mark slice `done` or `blocked`, fill checks and notes.
2. Append a session-log entry.
3. Return: key paths created, checks run and results, blockers / follow-ups, any stop-and-ask items.
