# FitBud UI/UX spec pack: READ THIS FIRST

This pack turns the *FitBud UI/UX Implementation Guide v1.2* (5,086 lines; the guide itself was retired on 30 Oct 2026 and this pack is now the source) into **one file per screen** (70 screens: 35 trainer web, 9 trainer mobile, 26 trainee mobile) plus shared files and a batch plan. Every guide section is copied **verbatim**.

## Why this exists

Last time, agents read about 40% of the guide, never opened the images, patched the old UI described under "Current state" and graded themselves with ✅ tables. Every rule below is there to stop that happening again.

## Rules for agents (non-negotiable)

1. **Read `00-foundations.md` and `01-product-rules.md` first, IN FULL.** Then read **only the files for your batch** (see `BATCHES.md`), **IN FULL**, every line including tables, code blocks and the "Observed in 18 Oct QA" list. Also read the shared files each screen file lists under "Read first".
2. **Open the locked frames for your screens** in [`docs/design/`](../design/README.md) (screen index in its README). They are the only visual target (locked 28 Oct 2026). The old `img/` Figma references and legacy captures were removed on 30 Oct 2026. If a screen or state has no locked frame, stop and ask for design; never invent it.
3. **"Legacy (do not keep)" sections describe old UI that you must REPLACE.** Don't restyle it, keep it, or patch it toward the target. Where a file says "old code exists", that code is legacy: rebuild the screen from the target design. (The guide's "Status: Implemented" labels were removed on purpose, because they misled the last agents.)
4. **Batch 0 first.** No screen batch starts before Batch 0 (API/seed fixes, `packages/core` labels and formatter, tokens, Satoshi, Button/StatusChip/overflow, pull-to-refresh Screen, banned-strings test) is merged.
5. **Never edit anything under `docs/spec/`** (screen files, shared files, `banned-strings.json`). The only exception is adding your evidence files to `docs/spec/evidence/`. If the spec is unclear, contradictory or wrong, **flag it in your report** under "Spec questions" and carry on with the rest.
6. **Definition of done for a screen** = **every** numbered acceptance check in its file (`<ID>.<n>`) is met, and:
   - proven by a screenshot at the viewport stated in section (g), saved to **`docs/spec/evidence/<ID>.png`** (plus `<ID>-390.png` where required, and `<ID>--<state>.png` for extra states such as empty, error, offline, drawer open or a second account);
   - and a **per-check PASS/FAIL table** in your report, where each row cites the evidence file (or a named test for behaviour checks such as keyboard or Undo).
7. **No ✅ without evidence.** Don't use ✅/❌ tables, "all done", or summary scores. A check with no cited screenshot or test is **FAIL**. A partly met check is **FAIL**, with a note.
8. **Use the demo state** given in section (f) of each screen file (accounts, routes, seed IDs; full list in `09-demo-data.md`). Reset with `pnpm db:reset` before taking evidence.
9. **Run the banned-strings check** (`01-product-rules.md` §B) on every screen and state you touched, and attach its output.

## Report template (one per batch)

```
## Batch <ID>: report
Commit: <sha>    Branch: <name>    Date/time (IST):

### <SCREEN-ID> <name>
| Check ID | PASS/FAIL | Evidence file | Note |
|---|---|---|---|
| TW-04.1 | PASS | docs/spec/evidence/TW-04.png | 8 rows + "View all (23)" |
| TW-04.4 | FAIL | tests/home-keyboard.spec.ts | Esc doesn't restore focus yet |
...
Banned-strings run: <command> → <n> errors, <n> warnings (output attached)

### Spec questions
- <file § / check ID>: <question>, what you did meanwhile
```

## Map of this folder

| File | What |
|---|---|
| `00-foundations.md` | Guide §1.1–1.6 verbatim (principles, tokens, type, components, formatting, copy), plus repo implementation notes and known token bugs |
| `01-product-rules.md` | Product rules, banned strings/patterns, formatting rules |
| `banned-strings.json` | Machine-readable banned patterns for the Playwright check |
| `02-navigation.md` | Guide §1.7 IA and routes, screen catalogue intro, trainer mobile and trainee intros (verbatim) |
| `03-api-changes.md` | Known API/seed/helper bugs with file:line (Batch 0), every API-NEW/API-CHG line by screen, existing route modules |
| `04-flows.md` | Guide §3 end-to-end flows (verbatim) |
| `05-notifications.md` | Guide §4 notifications and WhatsApp templates (verbatim) |
| `06-roadmap-backlog-qa.md` | Guide §5 roadmap, backlog and QA (verbatim) |
| `07-code-map.md` | Guide Appendix C (verbatim; its paths date from commit ae1cfa6, so check them with `rg`) |
| `08-references.md` | Guide §6 references (verbatim) |
| `09-demo-data.md` | Demo accounts, seed IDs, how to reach hard states |
| `10-guide-context.md` | Guide version, the v1.2 decision changes table and Appendix A access notes (verbatim) |
| `trainer-web/TW-*.md` | 35 trainer web screens (TW-01…TW-34, plus TW-09a) |
| `mobile/TM-*.md`, `mobile/TR-*.md` | 9 trainer mobile and 26 trainee mobile screens |
| `img/` | Guide images, plus `img/mobile-qa/` 18 Oct captures (LEGACY) |
| `evidence/` | Where your screenshots go |
| `BATCHES.md` | Batch plan, dependency order, check counts, demo states, spec questions |

Each screen file has: (a) a header (ID, name, priority, route, files to touch, API, code status); (b) the guide section verbatim between `<!-- BEGIN VERBATIM -->` markers; (c) reference images, labelled LEGACY or REFERENCE; (d) numbered acceptance checks; (e) what was observed in the 18 Oct QA; (f) the demo state to verify; (g) the viewport for evidence.

Total acceptance checks across all screens: **717**.
