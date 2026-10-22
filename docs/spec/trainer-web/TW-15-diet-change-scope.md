# TW-15 · Diet change scope (Today onward vs Today only)

**ID:** TW-15 · **Name:** Diet change scope (Today onward vs Today only) · **Priority:** P1 · **Route/screen:** a step inside the Publish modal (TW-16) when only nutrition changed in an adjustment · **Batch:** TW-D (see `../BATCHES.md`)

**Files to touch:**
- (the guide lists none; find the owning file with `rg` before you start)

**API (from the guide):** API-NEW publish option `dietChangeScope: 'today_onward' | 'today_only'`

**Code status:** the guide says "Missing" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1518–1540. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-15 -->
### TW-15 · Diet change scope (Today onward vs Today only)

> **Priority:** P1 · **Where:** a step inside the Publish modal (TW-16) when only nutrition changed in an adjustment · **API:** API-NEW publish option `dietChangeScope: 'today_onward' | 'today_only'`

1. **Purpose.** Implements decision B's diet change scope.
2. **Entry.** Publishing a nutrition-only adjustment.
3. **Legacy (do not keep).** Not offered.
4. **Gaps to close.** Trainers can't make a one-day change ("Wedding today, swap dinner") without altering the whole plan.
5. **Target design.** Two radio cards.
   - **"From today onward" (default):** "Updates the plan from today. Today's and future meals that aren't logged yet will change."
   - **"Today only":** "Changes only today's meals that aren't logged yet. The plan stays the same from tomorrow."
   - A preview list follows: "3 meals will change today: Lunch, Snack 2, Dinner. Breakfast is already logged and won't change."
6. **States.** If nothing is eligible: "All of today's meals are already logged. Nothing will change today."
7. **Edge cases.** Workouts are unaffected. Logged meals are protected.
8. **Deep links.** The trainee receives the P-PLAN push (§4) only for Today onward, and the I-DAY inbox item for Today only.
9. **References.** No strong external reference. This is FitBud's contract behaviour.
10. **UX decisions.** Default to the safer, more common choice. The preview builds trust.
11. **Implementation.** The modal step is in `PublishModal`. API-NEW: a scope parameter and a dry-run preview endpoint.
12. **Acceptance criteria.**
    - [ ] The default is Today onward.
    - [ ] The preview lists the affected and protected meals.
    - [ ] Today only leaves tomorrow's assignments unchanged.
13. **Priority:** P1.
<!-- END VERBATIM TW-15 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-15.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-15.1** [guide §12] The default is Today onward.
2. **TW-15.2** [guide §12] The preview lists the affected and protected meals.
3. **TW-15.3** [guide §12] Today only leaves tomorrow's assignments unchanged.
4. **TW-15.4** [QA checklist #1] Two radio cards: **"From today onward"** (default, selected) and **"Today only"**, each with its explanation copy.
5. **TW-15.5** [QA checklist #2] A preview list: "N meals will change today: … Breakfast is already logged and won't change."
6. **TW-15.6** [QA checklist #3] If everything is already logged: "All of today's meals are already logged. Nothing will change today."
7. **TW-15.7** [QA checklist #4] Workouts aren't affected, and logged meals are protected.
8. **TW-15.8** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
9. **TW-15.9** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Only reachable inside Publish for a nutrition-only change (needs a draft plus an edit). Not verified in QA.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **Where:** publish a nutrition-only adjustment: `R/plan` → Adjust plan → change a meal only → Publish… (mutates local data). The capture script shows the versions panel at `R/plan` (click *View* on the effective version).
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-15.png`. Save extra states as `docs/spec/evidence/TW-15--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

