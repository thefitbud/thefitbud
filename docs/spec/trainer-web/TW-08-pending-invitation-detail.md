# TW-08 · Pending invitation detail

**ID:** TW-08 · **Name:** Pending invitation detail · **Priority:** P2 · **Route/screen:** `/invitations/:invitationId` · **Batch:** TW-B (see `../BATCHES.md`)

**Files to touch:**
- `pages/InvitationPage.tsx` [new]
- `apps/trainer-web/src/pages/PendingInvitationPage.tsx` (actual file)

**API (from the guide):** `GET /invitations/:invitationId`; re-issue or revoke [API-NEW]

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2, lines 1141–1167. Changes: the misleading "Status" label is dropped, two subsections are renamed, and image paths point to `../img/`. Nothing else is changed.

<!-- BEGIN VERBATIM TW-08 -->
### TW-08 · Pending invitation detail

> **Priority:** P2 · **Route:** `/invitations/:invitationId` · **Files:** `pages/InvitationPage.tsx` [new] · **API:** `GET /invitations/:invitationId`; re-issue or revoke [API-NEW]

1. **Purpose.** Manage an invite that hasn't been accepted yet. Invited clients have no workspace (contract: "Do not invent a workspace id for a pending invite").
2. **Entry.** An invited roster row, or a Home "Getting started" row.
3. **Legacy (do not keep).** Roster rows show "Waiting for acceptance" with a WhatsApp Remind button. There's no detail view.
4. **Gaps to close.** The trainer can't see the pinned form, when the invite was sent, or how to resend or revoke it.
5. **Target design.**
   - A compact page. The card shows name, email, WhatsApp, "Invited 12 Oct", the pinned onboarding form name and version ("FitBud standard intake · v3", with Preview), and a status chip (Invited).
   - Actions:
     - Primary: **Remind on WhatsApp**, prefilled (§4.4 W-INV-R).
     - Secondary: *Copy new link* (re-issue).
     - Overflow: *Revoke invite*, after a confirm step.
6. **States.**
   - Accepted already: redirect to the client workspace.
   - Revoked: read-only, with "Revoked on…".
7. **Edge cases.** Re-issuing invalidates the old token. The confirm copy says so: "The old link will stop working."
8. **Deep links.** None.
9. **References.** No strong external reference. It's a FitBud-specific need.
10. **UX decisions.** Keeps the invitation and relationship models separate, matching the contract.
11. **Implementation.** API-NEW: `POST /invitations/:id/reissue` and `POST /invitations/:id/revoke`.
12. **Acceptance criteria.**
    - [ ] The pinned form version is shown.
    - [ ] Re-issue returns a new link and the old one fails.
    - [ ] An accepted invite redirects to the workspace.
13. **Priority:** P2.
<!-- END VERBATIM TW-08 -->

---

## (c) Reference images

Open **every** image below before you write code. LEGACY images show what to remove. REFERENCE images show the target or inspiration.

- The guide has no image for this screen. Build from the text above and `00-foundations.md`.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TW-08.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TW-08.1** [guide §12] The pinned form version is shown.
2. **TW-08.2** [guide §12] Re-issue returns a new link and the old one fails.
3. **TW-08.3** [guide §12] An accepted invite redirects to the workspace.
4. **TW-08.4** [QA checklist #1] A compact card: name, email, WhatsApp, "Invited <date>", pinned onboarding form name plus version (with Preview), and an **Invited** status chip.
5. **TW-08.5** [QA checklist #2] Primary **Remind on WhatsApp** opens a prefilled `wa.me` (not auto-sent).
6. **TW-08.6** [QA checklist #3] Secondary *Copy new link* (re-issue). Its confirm says "The old link will stop working."
7. **TW-08.7** [QA checklist #4] Overflow *Revoke invite* with a confirm step. After revoking: read-only "Revoked on …".
8. **TW-08.8** [QA checklist #5] No workspace tabs and no fake client header for an invite.
9. **TW-08.9** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
10. **TW-08.10** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- No screen-specific failure recorded. Code fact: `pages/PendingInvitationPage.tsx` exists (the guide names `InvitationPage.tsx`).

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- **URL:** `/invitations/06b54e81-016c-4220-a9a8-31195324669b` · **Account:** rahul.coach (Anita)
- `R` = `/clients/c422296e-ed7b-4196-a2b4-647096af3002` (Rohan, slipping)

## (g) Viewport for evidence

**1440×900** (desktop, Chromium). Save it as `docs/spec/evidence/TW-08.png`. Save extra states as `docs/spec/evidence/TW-08--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

