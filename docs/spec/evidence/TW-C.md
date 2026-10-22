# TW-C evidence (fix round)

Branch: `cursor/tw-c-workspace-frame-4c36` · PR #7  
Base: `cursor/tw-b-entry-roster-invites-582d`  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof: `pnpm typecheck` **17/17** · `pnpm test` **17/17** (API **222** tests incl. nutrition parity + notes DELETE)  
Banned-strings hard-fail on TW-C routes; axe clean on prior capture (re-verify after visual rebuild preferred).

Screenshots under `docs/spec/evidence/TW-C/` (prior pack + this round’s API/UI fixes). Side-by-side: `TW-09-side-by-side.png`.

## Summary counts (post fix-round, honest)

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-09a | 15 | 1 | 16 |
| TW-09 | 13 | 2 | 15 |
| TW-10 | 10 | 1 | 11 |
| TW-11 | 12 | 1 | 13 |
| TW-34 | 11 | 1 | 12 |
| **Total** | **61** | **6** | **67** |

## Fix-round highlights (verified in code + tests)

1. **Most severe open item** — `loadOpenException` severity-first (critical → oldest).
2. **Week strip** — per-day workout state + mealSlots + legend (UI + contract).
3. **Nutrition parity** — `/me/day` joins compliance by assignment `localDate`; trainer unscales once; seed test compares Rohan + Aarav.
4. **No future meals/activity** — week “so far” + recent activity filters `occurredAt > now` and pending/scheduled.
5. **Check-in card** — prefers submitted awaiting review.
6. **Ended read-only** — overview/configure/notes mutating CTAs disabled.
7. **Notes** — Edit / Make private / Delete UI + DELETE API + tests; pronoun “their”; toasts.
8. **Configure 404** — GET config/subscription return **200 null**.
9. **ErrorState** — workspace load uses TW-33 ErrorState with request id + Email support.
10. **Offline** — Add note / Review / mutating actions disabled.
11. **Notes fetch error** — ErrorState, not “No notes yet”.
12. **Kickers** — plain Plan/Activity/Progress/Check-ins/History + ink-500 contrast.
13. **FilterBar** — nowrap single row at 1280.
14. **Seed** — age/gender, staggered check-ins, Sneha long answer, plan macros, Week 6 started_at, Rohan reminders, Fat loss · Phase 2.

## Remaining FAILs (honest)

| ID | Why |
|---|---|
| TW-09a.16 / TW-09.15 / TW-10.11 / TW-11.13 / TW-34.12 | DoD loading/empty/error/offline/partial not each re-captured as separate evidence files this round |
| TW-09a.6 | Custom meal times chip present (Deepak); live “within one refresh of trainee change” still not e2e-proven |

## Mockup diffs still visible

Week strip now closer to mockup 03 (check/×/meal dots/legend). Header flat + `Clients › Name`. Plan side card includes Workouts/Meals rows. Nutrition targets now seed-scale (~1.8k kcal). Remaining: mockup-specific workout names/day copy may still vary with seed assignment names; re-capture recommended after `db:reset` for pixel review.
