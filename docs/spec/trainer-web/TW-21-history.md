# TW-21 · History

**ID:** TW-21 · **Name:** History · **Priority:** P2 · **Route/screen:** `/clients/:rid/history` (`?kind=&from=&to=`) · **Batch:** TW-G (see `../BATCHES.md`)

**Files to touch:**
- `apps/trainer-web/src/pages/ClientHistoryPage.tsx` (exists: old code. Rebuild it to the target; do not patch it)

**API (from the guide):** `GET /history/relationships/:rid` (paged 30/50, kind, occurredFrom, occurredTo)

**Code status:** old code exists (the guide labelled it "Implemented"). **That code is LEGACY. Rebuild the screen to the target design below; don't patch the old UI.**

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TW-21 -->
### TW-21 · History

> **Priority:** P2 · **Route:** `/clients/:rid/history` (`?kind=&from=&to=`) · **Files:** `pages/ClientHistoryPage.tsx` · **API:** `GET /history/relationships/:rid` (paged 30/50, kind, occurredFrom, occurredTo)

1. **Purpose.** A readable ledger of coaching events: plan versions, reviews, interventions, check-ins and lifecycle.
2. **Entry.** Workspace tab, and the Plan "History" link (`kind=plan_version`).
3. **Legacy (do not keep).** `shots/d1440_10_client1_history.png`. A dense list of identical small cards.

4. **Gaps to close.** No grouping. Every kind looks the same. Some labels use enum-like wording.
5. **Target design.**
   - Group by week ("Week of 5 Oct").
   - Rows carry a kind icon (plan, check-in, note, review, exception, relationship), a sentence ("You published *Fat loss v4* · effective Wed 14 Oct"), a relative time and a link to the source.
   - A kind filter as pills, plus a date range.
   - Use neutral wording only, and never "clinical intervention".
6. **States.** Empty: "Nothing recorded yet." Load more.
7. **Edge cases.** Ended relationships still show their full history, read-only.
8. **Deep links.** None.
9. **References.** No strong external reference.
10. **UX decisions.** Weekly grouping matches the coaching cadence.
11. **Implementation.** Sentence templates live in the `packages/copy` keyed by history kind.
12. **Acceptance criteria.**
    - [ ] Grouped by week.
    - [ ] Kind icons.
    - [ ] Sentences come from the catalogue.
    - [ ] Filters reset the cursor.
13. **Priority:** P2.
<!-- END VERBATIM TW-21 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-21.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-21.1** [guide §12] Grouped by week.
2. **TW-21.2** [guide §12] Kind icons.
3. **TW-21.3** [guide §12] Sentences come from the catalogue.
4. **TW-21.4** [guide §12] Filters reset the cursor.
5. **TW-21.5** [QA checklist #1] Grouped by week ("Week of 5 Oct").
6. **TW-21.6** [QA checklist #2] Each row: kind icon (plan, check-in, note, review, exception, relationship), a readable sentence ("You published … · effective …"), relative time, source link.
7. **TW-21.7** [QA checklist #3] Kind filter pills plus a date range. They update the URL (`?kind=`), and the list resets.
8. **TW-21.8** [QA checklist #4] Neutral wording: no "clinical intervention" and no enum-like labels.
9. **TW-21.9** [QA checklist #5] Empty: "Nothing recorded yet." plus Load more. Ended clients (Kavya `/clients/b9f01670-8acc-45f6-adab-d7728bca88a6/history`) still show their full history.
10. **TW-21.10** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
11. **TW-21.11** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- RCA.md §5: TW-21 was ⚠️ in run 3 and became ✅ in run 4 with no review.
- Code at 7f74108: `pages/ClientHistoryPage.tsx:164` has a manual "Refresh" button. On web this is allowed, but the guide's refresh state is a thin top progress bar (§1.6.5), so prefer refetch-on-focus.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `R/history`
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-21.png`. Save extra states as `docs/spec/evidence/TW-21--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

