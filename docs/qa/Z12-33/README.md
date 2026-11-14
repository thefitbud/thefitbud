# QA · Z12-33 · Trainer cache late-write guard

Privacy follow-up to Z11-8 (`docs/specs/Z11-8.md`). Non-UI. The device run below is done later by the orchestrator through the Z12-35 harness.

## Design

- `apps/mobile/src/trainer/cache.ts` keeps an epoch that advances on every owner change (`setTrainerCacheOwner` with a different value, including `null`) and on every `clearTrainerCache()`. Setting the same owner again (a `/me` reload for the same trainer) changes nothing.
- A caller reads `trainerCacheEpoch()` when its fetch **starts** and passes it as the required third argument of `writeTrainerCache(key, value, startedAt)`. A write whose epoch is no longer current is dropped, so a fetch started under trainer A that resolves after A signs out and B signs in never lands under B.
- Setting a new non-null owner removes every `trainer:` entry that is not that owner's (another trainer's scoped keys and legacy unscoped keys) from both `localStorage` and the memory map. A user change without a sign-out (a new sign-in over a session that never signed out, a `/me` that returns a different user, a web reload) leaves nothing of the previous trainer.
- `AuthProvider.applyMe` still sets the owner from the server's `/me` only; the three callers (`AttentionTab.tsx`, `ClientsTab.tsx`, `ClientStatusScreen.tsx`) capture the epoch at the top of `load()`.

## Tests by criterion

| Criterion | Tests |
|---|---|
| A late write started under A is dropped after A signs out and B signs in | `cache.test.ts` (both stores): "drops a write whose fetch started under A and resolved after A signed out and B signed in (Z12-33)", "drops a late write after a direct switch from A to B with no sign-out", "drops a late write that resolves after sign-out, even if A signs straight back in". `AuthProvider.trainerCache.test.ts`: "a fetch started for A that resolves after A signs out and B signs in writes nothing (Z12-33)". Real screen, real cache, one per caller, each named "a load started for trainer A that resolves after B signs in writes nothing under B (Z12-33)": `AttentionTab.states.render.test.tsx`, `ClientsTab.cache.render.test.tsx`, `clientStatus/ClientStatus.test.tsx` |
| The previous owner's keys are removed when the userId changes, not only on sign-out | `cache.test.ts` (both stores): "a userId change removes the previous owner's entries, not only sign-out (Z12-33)". `AuthProvider.trainerCache.test.ts`: "a second trainer signing in on the same phone reads nothing of A's" (now also asserts A's keys are gone from storage), "a /me reload that returns a different user removes the previous trainer's entries (Z12-33)" |
| The same trainer keeps their snapshot and in-flight writes (no regression to offline Attention) | `cache.test.ts`: "setting the same owner again keeps their entries and in-flight writes (a /me reload)". `AuthProvider.trainerCache.test.ts`: "a /me reload for the same trainer keeps their snapshot and in-flight writes". `ClientsTab.cache.render.test.tsx`: "a load that resolves for the same trainer still writes the roster". The existing Z11-8 tests and the AttentionTab offline tests still pass |

`AttentionTab.states.render.test.tsx` now uses the real cache module (scoped to a trainer in `beforeEach`) instead of a mock map, so the offline cases exercise the same scoping and epoch rules as production.

## Mutation checks

- Guard removed (`if (startedAt !== epoch) return;` deleted from `writeTrainerCache`): 8 tests fail (6 in `cache.test.ts`, 1 in `AuthProvider.trainerCache.test.ts`, 1 in `AttentionTab.states.render.test.tsx`). Restored: all pass.
- Owner-change purge removed (the `removeTrainerEntries` call in `setTrainerCacheOwner`): 4 tests fail (2 in `cache.test.ts`, 2 in `AuthProvider.trainerCache.test.ts`). Restored: all pass.
- Caller captures the epoch at write time instead of fetch start, one caller at a time: `AttentionTab.tsx`, `ClientsTab.tsx` and `ClientStatusScreen.tsx` each fail their own late-write test. Restored: all pass.

## Checks run

`pnpm build:packages`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @fitbud/mobile test` (126 files, 1265 tests after the review fix round) and `pnpm test` (17 of 17 tasks, first round): all pass.

## Device gate result

**PASS, run 43646702056** (Device gate, dispatched on `main` with `ref=claude/Z12-33-cache-late-write`, `flows=z12-33`): iOS simulator and Android emulator, light and dark, 4 of 4 flows in each, device log clean (`scan-logs`: no findings). Flows: `apps/mobile/.maestro/device/z12-33/` (run in order; 2 and 4 with the device offline).

| Flow | Steps | What it proved |
|---|---|---|
| `1-two-trainers` | 1–6 | Rahul signs in on a fresh install and loads Attention, Clients and Rohan Mehta's status screen; pulls to refresh on Attention and signs out while it may still load (the late-write path); Priya signs in on the same install. Attention, Clients and Lakshmi Iyer's screen each render Priya's own data first, and none shows Rohan Mehta, Aarav Shah, Meera Iyer or Ishita Banerjee |
| `2-offline-priya` | 7 | Offline as Priya, her own roster shows from the cache (Lakshmi Iyer): the guard keeps the signed-in trainer's own writes. Attention and Clients then show "You're offline …" or "Couldn't load", never Rahul's clients |
| `3-rahul-again` | 8, online | Priya signs out, Rahul signs back in: Attention and Clients show his data and none of Priya's (Lakshmi Iyer, Karan Mehra) |
| `4-offline-rahul` | 8, offline | Offline as Rahul, his own roster (loaded online in flow 3) shows from the cache; Attention and Clients show the offline line or "Couldn't load", never Priya's clients |

Step 8 departs from the manual steps below in one way (recorded in `docs/qa/Z12-35/README.md`): Attention is the landing tab, so it loads online as Rahul signs in, before the device can go offline. The privacy check still holds.

Earlier run 43642084004 failed on Android only (iOS passed). Root cause was the flows, not the app: on Android a client row's status chip is its own "Attention" text node, so tapping "Attention" from the Clients tab opened that client (Deepak Nair) instead of the tab. Dark flow 1 then could not find "More", and flow 4 could not find "Clients" in both themes. Dark flow 2 failed in cascade: Rahul never signed out, so the offline Clients tab showed Rahul's own snapshot (Rohan Mehta, Priya Nair, …) under Rahul. That is the expected behaviour (A sees A's own snapshot offline), not the guard dropping Priya's write, and the light run's flow 2 showed Priya's own snapshot offline. Fix: the flows reach Attention through More, which has no other "Attention" text. No privacy assertion was removed.

## Device check (manual steps; run via the Z12-35 harness)

Run on one iOS simulator (393×852) against the local API on the demo seed (`pnpm db:reset`, `pnpm api`). Personas from `docs/LOCAL_TESTING.md`.

1. Fresh install (or erase the app's data) on the simulator. Launch the app.
2. Sign in as `rahul.coach@demo.fitbud.test` / `FitBud-demo-2026`. Choose Trainer if asked.
3. Open **Attention** and wait for the list (Rohan Mehta should be there). Open **Clients** and wait for the roster. Open one client (for example Rohan Mehta) and wait for the status screen. Screenshot each: `rahul-attention.png`, `rahul-clients.png`, `rahul-client.png`.
4. Pull to refresh on Attention and, while it is still loading, sign out (this exercises the late-write path; if the refresh is too fast to catch, carry on).
5. Sign in as `priya.coach@demo.fitbud.test` / `FitBud-demo-2026` on the same simulator, without reinstalling.
6. Open **Attention**, **Clients** and a client. Confirm nothing from Rahul's account shows: no Rohan Mehta, no Rahul client names, only Priya's roster (Lakshmi, Karan). Screenshot: `priya-attention.png`, `priya-clients.png`, `priya-client.png`.
7. Turn the network off (simulator: disconnect the Mac's network or stop the local API), pull to refresh on Attention and Clients. Expected: either Priya's own last snapshot with "You're offline. Showing the last update from …", or the "Couldn't load" error state. Never any of Rahul's rows. Screenshot: `priya-offline-attention.png`, `priya-offline-clients.png`.
8. Turn the network back on, sign out, sign in as `rahul.coach@demo.fitbud.test` again, go offline before opening Attention and pull to refresh. Expected: the "Couldn't load" error state (Rahul's earlier snapshot was removed when Rahul signed out in step 4, and sign-out also removes Priya's), never Priya's rows.
9. Save the screenshots to `docs/qa/Z12-33/` and record PASS or FAIL per step here.
