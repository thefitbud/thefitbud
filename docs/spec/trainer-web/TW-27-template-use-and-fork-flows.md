# TW-27 · Template use and fork flows (modal set)

**ID:** TW-27 · **Name:** Template use and fork flows (modal set) · **Priority:** P2 · **Route/screen:** modals launched from TW-23 · **Batch:** TW-F (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/templates/PlanTemplateFamily.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**Code status:** old code exists (the guide labelled it "Implemented (inline)"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1997–2017. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-27 -->
### TW-27 · Template use and fork flows (modal set)

> **Priority:** P2 · **Where:** modals launched from TW-23 · **Files:** `PlanTemplateFamily.tsx` (fork, apply)

1. **Purpose.** Make Use and Fork explicit and safe.
2. **Entry.** Template card actions.
3. **Legacy (do not keep).** Fork and apply are inline actions.
4. **Gaps to close.** No confirmation of what happens. No client picker for Use.
5. **Target design.**
   - **Use for client:** a modal with a client search (only clients who are ready or active), then "Creates a draft plan for Priya from *Fat loss base*. Nothing changes for Priya until you publish." The trainer lands in the builder (TW-13) with the draft.
   - **Fork:** a name field ("Copy of Fat loss base"), then "Your copy is yours to edit. The FitBud base won't change." The trainer lands in the template editor.
6. **States.** Errors appear inline.
7. **Edge cases.** Use deep-copies with fresh ids (contract).
8. **Deep links.** None.
9. **References.** No strong external reference.
10. **UX decisions.** The copy states the copy semantics explicitly, which avoids "did I change the original?" anxiety.
11. **Implementation.** `UseTemplateModal` and `ForkTemplateModal`.
12. **Acceptance criteria.**
    - [ ] Use creates a draft, never a published version.
    - [ ] Fork creates a trainer-owned copy.
13. **Priority:** P2.
<!-- END VERBATIM TW-27 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-27.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-27.1** [guide §12] Use creates a draft, never a published version.
2. **TW-27.2** [guide §12] Fork creates a trainer-owned copy.
3. **TW-27.3** [QA checklist #1] **Use for client** modal: client search (only ready or active clients; Kavya and Nikhil shouldn't appear) and the copy "Creates a draft plan for <client> from <template>. Nothing changes for <client> until you publish."
4. **TW-27.4** [QA checklist #2] After Use: you land in the builder with a **draft** (not published).
5. **TW-27.5** [QA checklist #3] **Fork** modal: name field prefilled "Copy of <template>", copy "Your copy is yours to edit. The FitBud base won't change."
6. **TW-27.6** [QA checklist #4] After Fork: you land in the template editor, and the card shows the "Mine" owner chip.
7. **TW-27.7** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
8. **TW-27.8** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No full-plan (combined) template is seeded. Create one through Templates → Full plans → New, or test Use/Fork on Workouts bases.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/templates/workouts` → click **Use** or **Fork to edit** on a FitBud base card (e.g. "Beginner home · no equipment · 3 days/week"). There's no seeded full plan; the capture script used `/templates/full-plans/<id>` after creating one.
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-27.png`. Save extra states as `docs/spec/evidence/TW-27--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

