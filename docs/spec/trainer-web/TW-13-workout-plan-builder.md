# TW-13 · Workout plan builder (three-pane)

**ID:** TW-13 · **Name:** Workout plan builder (three-pane) · **Priority:** P1 · **Route/screen:** `/clients/:rid/plan/:planId/versions/:versionId/edit` (`?tab=workout`); template mode `/templates/workout/:tid` · **Batch:** TW-D (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/components/plan-composition/PlanCompositionEditor.tsx` (exists: old code. Rebuild it to the target; do not patch it)
- `builder` [new]

**API (from the guide):** `GET/PUT /plans/:planId/versions/:versionId`, preview, publish; `GET /libraries/exercises?q&muscleGroup&equipment&difficulty`

**Code status:** the guide says "Figma-only layout (content partially implemented)" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-13 -->
### TW-13 · Workout plan builder (three-pane)

> **Priority:** P1 · **Route:** `/clients/:rid/plan/:planId/versions/:versionId/edit` (`?tab=workout`); template mode `/templates/workout/:tid` · **Files:** `components/plan-composition/PlanCompositionEditor.tsx` → split into `builder/` [new] · **API:** `GET/PUT /plans/:planId/versions/:versionId`, preview, publish; `GET /libraries/exercises?q&muscleGroup&equipment&difficulty`

1. **Purpose.** Compose a weekly workout program quickly: days, sessions, exercises, sets, reps, load, rest and notes.
2. **Entry.** TW-12 *Adjust plan* or *Start blank*, and a template editor.
3. **Legacy (do not keep).**
   - Figma "Plan Builder" frame (metadata audit only; no screenshot, due to the Figma rate limit). It has a three-pane layout plus banned analytics (stimulus, weekly sets volume, HRV).
   - Code: a single-column composition editor with add, reorder and duplicate, and limits. There's no weekday mapping UI.
4. **Gaps to close.** The layout doesn't scale. There's no weekday mapping (which causes the consistency notice). There's no preview. The library is a separate page.
5. **Target design.** Three panes at ≥1280.

   | Left (240) · Days | Centre (flex) · Session editor | Right (360) · Library drawer |
   |---|---|---|
   | Mon to Sun list. Each day shows its session name or "Rest", and the row can be dragged to reorder. "+ Add session". A session can be assigned to multiple weekdays through a weekday chip row (M T W T F S S). | Session title and an instruction note. Exercise blocks: name, primary muscle chip, and a **set table** (set #, reps or range, load as kg or a text label like "RPE 7", rest seconds, notes). Actions: add set, duplicate set, superset group (P2), delete. The prescription lives here, never in the library (10 Oct contract). | Search, then filters for muscle, equipment and difficulty. Each result shows the name, primary and secondary muscles and a media thumbnail when one exists (`LinkedMedia`), with **Add to session** (or drag it in). "Create exercise" opens the TW-26 form in the drawer. |

   - **Top bar:** "Draft v4 · Saved 10:42" (autosave status), *Preview as client* (opens a phone-frame preview of TR-10 for any chosen day), and **Publish…** (primary), which opens the TW-16 assign modal.
   - **Validation panel:** shown inside the Publish modal, with no separate inspector. "2 days have no session · Tue, Thu are rest days. Is that intended?" and the consistency check against configuration ("Configuration expects 4 sessions/week; plan has 3").
6. **States.**
   - Autosave: Saving, Saved, Couldn't save (Retry). Use a debounced `PUT` with `expectedVersion`.
   - Conflict: "This draft was changed in another tab."
   - Empty session: "Add exercises from the library →".
   - Library empty or error, shown inline in the drawer.
7. **Interactions and edge cases.**
   - Keyboard: `/` focuses library search, Enter adds the highlighted exercise, Tab moves through set cells, ⌘D duplicates a set.
   - Undo stack for the last 20 edits on the client.
   - Below 1280, the library becomes a toggleable drawer. Below 1024, the builder is read-only with "Open on a larger screen".
   - Published versions can't be opened here. The route rejects them, and the editor shows "Create a new version to edit".
8. **Deep links.** None. It's an editing surface.
9. **References.**
   - Adopt: the TrueCoach workout builder [R4] https://help.truecoach.co/en/articles/3047972-the-workout-builder-basics and its feature page [R5] https://truecoach.co/features/program-workout-builder/
   - Adapt: the Everfit create-a-workout flow [R10] https://help.everfit.io/en/articles/4620472-create-a-workout
   - Avoid: Figma's analytics inspector (banned, Iteration A §10).
10. **UX decisions.**
    - The weekday chips implement decision B (weekday-to-session mapping, rest days).
    - Library on the right plus "Add to session" removes page switching.
    - Publish always goes through the assign step, so trainers never publish without seeing the dates affected.
11. **Implementation.**
    - Components: `builder/BuilderLayout`, `DaysPane`, `SessionEditor`, `SetTable`, `LibraryDrawer` (wrapping the existing `LibrarySearch`), `PublishModal`.
    - API-CHG: version content gains `schedule: { [weekday]: sessionId | 'rest' }`. Generation must use it (gap: it currently derives from frequency).
    - Use the existing preview endpoint for *Preview as client*.
12. **Acceptance criteria.**
    - [ ] Three panes at 1440. The library adds to the selected session.
    - [ ] Weekday mapping is saved, and generation honours it.
    - [ ] Autosave shows its status.
    - [ ] Publish opens TW-16.
    - [ ] No analytics, volume or fatigue UI.
    - [ ] Exercise library items carry no default reps or load.
13. **Priority:** P1.
<!-- END VERBATIM TW-13 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-13.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-13.1** [guide §12] Three panes at 1440. The library adds to the selected session.
2. **TW-13.2** [guide §12] Weekday mapping is saved, and generation honours it.
3. **TW-13.3** [guide §12] Autosave shows its status.
4. **TW-13.4** [guide §12] Publish opens TW-16.
5. **TW-13.5** [guide §12] No analytics, volume or fatigue UI.
6. **TW-13.6** [guide §12] Exercise library items carry no default reps or load.
7. **TW-13.7** [QA checklist #1] Three panes at ≥1280: Days (Mon–Sun, session or "Rest", weekday chips M T W T F S S) · Session editor · Library drawer.
8. **TW-13.8** [QA checklist #2] The session editor has exercise blocks with a set table (set #, reps, load kg or "RPE 7", rest s, notes) and add set / duplicate / delete.
9. **TW-13.9** [QA checklist #3] Library drawer: search plus muscle / equipment / difficulty filters, results with muscles and a thumbnail, **Add to session**. Library items carry no default reps or load.
10. **TW-13.10** [QA checklist #4] Top bar: "Draft vN · Saved hh:mm" autosave status, *Preview as client*, primary **Publish…** (opens the TW-16 modal).
11. **TW-13.11** [QA checklist #5] Empty session: "Add exercises from the library →".
12. **TW-13.12** [QA checklist #6] No analytics, volume, fatigue or HRV panels. Below 1024 px: read-only with "Open on a larger screen".
13. **TW-13.13** [18 Oct QA] No "Library snapshot <uuid>" text; library items show "From library · snapshot".
14. **TW-13.14** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
15. **TW-13.15** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Code at 7f74108: `components/plan-composition/PlanCompositionEditor.tsx:247` and `:1047` render "Library snapshot {item.sourceFoodLibraryItemId}", a raw UUID (banned string).
- No client draft exists at seed time. Click **Adjust plan** on `R/plan` first (checklist).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URLs:** template mode `/templates/workouts/cb44ac29-6ed6-45c7-a371-d56584df0650`. Client mode: `R/plan/b93731fe-d057-43dd-9c60-e472837bb587/versions/<draftVersionId>/edit`. No draft exists at seed time, so click **Adjust plan** on `R/plan` first; it opens this route. If the browser tester shouldn't mutate data, use template mode only.
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-13.png`. This screen has mobile-web rules, so also save **390×844** as `docs/spec/evidence/TW-13-390.png`. Save extra states as `docs/spec/evidence/TW-13--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

