---
id: CU3
title: AppRouter: pin how errorMessage and the route interact
batch: W3b
depends_on: [CU2]
lane: mobile
files_owned:
  - apps/mobile/src/navigation/AppRouter.tsx
  - apps/mobile/src/navigation/routerView.ts  # new: pure (route, errorMessage) -> view
  - apps/mobile/src/navigation/routerView.test.ts  # new
frames: []
model: sonnet
size: S
---

## Outcome
The rule "an auth error message wins over the current route, except on the auth screen" is pinned by a test, so a refactor cannot silently show a signed-in screen over a failed session load (or hide the auth screen behind the error). **P0 in W3b.**

## Context
- Source: the W3 report's "Follow-ups raised on 3 Nov" (`docs/specs/batches/W3.md`, 3 Nov continuation) and QA1's "Follow-ups raised" (`docs/specs/batches/QA1.md`); W3b is approved by Firoz, 3 Nov 2026 (`docs/specs/batches/W3b.md`).
- The review offered two fixes: a first-class `offline` route, or a test pinning "errorMessage wins over the route name". **Take the test route**: a new route changes `AuthProvider`'s route union and its consumers, which is product/architecture scope this cleanup batch does not decide.

## Gap list
- `apps/mobile/src/navigation/AppRouter.tsx:37`: `if (errorMessage && route.name !== "auth")` decides the whole screen; nothing tests it, and the coupling lives inside JSX.
- Written against `main` at dadaa13. The implementer re-checks each item against the latest `main` before building (AGENTS.md).

## Acceptance criteria
- [ ] The decision moves into `routerView.ts` as a pure function of `route` and `errorMessage` (loading, error, auth, signed-in views); `AppRouter.tsx` renders from it with identical behaviour.
- [ ] Tests pin: error + any non-auth route → error view; error + auth route → auth view; no error → the route's view; loading unchanged.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Out of scope
- An `offline` route, `AuthProvider.tsx` changes, any copy change.
- Product rules (CLAUDE.md, never break): only the trainer resolves an exception (no auto-resolve); no auto-send (WhatsApp is a wa.me prefill); no percentages or streaks; payments are tracking only; ended clients are read-only on server and UI.
- Working rules (CLAUDE.md): never run remote or deploy commands; no secrets in code, logs or commits; one task, one branch `claude/<ID>-<slug>`, one PR `<ID>: <summary>` off the latest `main`; update by merging `main`, never rebase or force-push.

## Tests to add
- `routerView.test.ts`: the four cases above, table-driven over every `route.name` the union allows.
- Checks to run: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Visual check
- n/a (no visual change).

## Stop conditions
- The extraction would change what any route renders.
- A file outside `files_owned` must change.
- The spec leaves open a decision that changes product behavior, scope, architecture, auth or data.
- The task would need a remote command, a secret or a deploy.
