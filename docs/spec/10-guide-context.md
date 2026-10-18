# 10 · Guide context: version, v1.2 changes, access notes

Copied verbatim from the guide's front matter (lines 8–37) and Appendix A (lines 4948–4957). The v1.2 change table records the **latest decisions** (sign-in, WhatsApp, no auto-send, Home rows), so read it with `01-product-rules.md`.

**Deliberately left out:** guide Appendix B ("Screen status summary"). Its "Implemented" labels are what misled earlier agents. Each screen file's header gives the code status, and the old code is LEGACY. Appendix D's images are attached to the relevant screen files.

<!-- BEGIN VERBATIM front-matter -->
**Version:** 1.2 · **Date:** Saturday 17 October 2026, evening (IST). v1.0 was 14 Oct. v1.1 (17 Oct, afternoon) folded in the user's answers to the open questions and their navigation changes. v1.2 (17 Oct, evening) adds the user's second set of decisions: WhatsApp built but switched off, email-only OTP for now, no auto-sending on anyone's behalf, Home rows, and OQ-25 to OQ-31. All are recorded as **[DECISION · user 17 Oct]** and listed in §5.4 "Resolved decisions" · **Owner:** dev fitbud · **Audience:** the implementing coding agent, plus design and product reviewers.
**Status:** This guide is the agent-facing source of truth for UI and UX. It sits under the Confluence product contract (see §1.2 "Authority"), so it never overrides product behaviour defined there. Where this guide adds behaviour the contract doesn't cover (for example the reminder engine refinements, the "asked coach" marker and WhatsApp deep links), the item is labelled **[DECISION · user 14 Oct]** or **[PROPOSED]**. Each one also appears in the open-questions list (§5.4) so it can be written back to Confluence.

**Inputs this guide was built from**

| Input | What was used |
|---|---|
| Confluence space `FM` (thefitbud.atlassian.net). Local exports are in `/workspace/fitbud-ux/sources/` | Project Details, UX and Screen Architecture, Workflows and States (decisions A–G and the 10 Oct clarifications), Current State and Iteration Guide, Iteration A Trainer UI Contract Decisions. Technical Architecture and SLOs was re-read in full on 14 Oct. A CQL check on 14 Oct showed that no FM page has changed since 10 Oct 2026, so the local exports are current. |
| Earlier research | `/workspace/fitbud-ux/FitBud_UIUX_Research.md` (Figma audit, competitor teardown, retention research) and `/workspace/fitbud-impl/FitBud_Trainer_Web_Gap_Analysis.md` (53 implemented screenshots, Figma vs implemented) |
| Figma | Trainee `lIUv0KzTaIEb61aYRePzB5` (8 frames) and trainer `WxSw4jGGeOigNmc6RKFhfh` (10 frames), using the exported screenshots in `/workspace/fitbud-ux/screens/`. A fresh Figma call on 14 Oct hit the Starter-plan MCP rate limit, so no new frames were pulled (see Appendix A). |
| Code | Repo `thefitbud` on branch `feat/iteration-a-backend` at `ae1cfa6` (11 Oct 2026). It was read on the user's PC with read-only PowerShell, and no git state was changed. Route tables, screen files, contracts (`packages/contracts`), reminder constants (`packages/core/src/reminder.ts`) and theme tokens (`packages/ui-mobile/src/theme.ts`) were all inspected. |
| Web research | Competitor help centres, platform guidelines (Material 3, Apple HIG, Android, Expo, WhatsApp, WCAG) and behaviour research. Every URL is listed in §6, and URLs were checked on 14 Oct where possible. |

---

## v1.2 changes (17 Oct 2026, evening)

Page numbers refer to this PDF.

| # | Change | Where (section · page) |
|---|---|---|
| 1 | **Sign-in:** password (mobile or email) and **email OTP** are live. The WhatsApp OTP is fully built but behind the flag `wa_otp` (off), and shows as a disabled "Coming soon" option. No SMS. System email is sent from a configurable sender, `tech@thefitbud.com` for now. | D18, D30 · p. 8 · §1.6.11 · p. 20 · TW-01 · p. 25 · TR-01 · p. 86 · TR-02 · p. 88 · TW-07 · p. 40 · §3.1 · p. 122 · §3.1a · p. 124 |
| 2 | **Automated WhatsApp** (the Cloud API client, template registry with Meta approval status, budget ledger, cap and alerts) is fully built behind `wa_automation` (off). Only push and user-tapped `wa.me` links work today. Template copy is strictly utility, with a lint checklist. Settings show "Coming soon". | D10, D17 · p. 8 · §4.2 · p. 143 · §4.5 · p. 146 · §4.6 · p. 148 · TR-05 · p. 90 · TR-16 · p. 109 · TW-11 · p. 47 · TW-31 · p. 75 · §3.5 · p. 129 · §3.2 · p. 126 · §3.6 · p. 132 · §4.4 · p. 146 |
| 3 | **Never auto-send on a person's behalf.** Re-engagement and every trainer message are `wa.me` prefills that the person sends. The wording is now "written as the trainer" or "trainer-signed text". Text only, no voice notes. | D31 · p. 8 · TW-04 · p. 30 · §4.2 · p. 143 |
| 4 | **Home "Needs attention": one row per client on web** (rows, not cards), with a rationale, wireframe and keyboard model. Cards stay on trainer mobile. | D32 · p. 8 · TW-04 · p. 30 · TM-01 · p. 80 |
| 5 | **OQ answers:** OQ-25 and OQ-31 defaults accepted; OQ-26 removes the optional-item late window; OQ-27 utility-only copy; OQ-28 alerts built; OQ-29 a reply-within-a-day promise; OQ-30 steps not shared, plus a go/no-go evaluation. | §5.4 · p. 153 · §3.7 · p. 135 · §1.6.10 · p. 19 · TR-25 · p. 118 · TR-07 · p. 96 · TR-10 · p. 102 · TW-28 · p. 72 · TM-07 · p. 83 · TR-20 · p. 113 |
| 6 | Roadmap, backlog, acceptance criteria, Appendix B and Confluence conflicts (C-13 to C-15) updated | §5.1 · p. 150 · §5.2 · p. 150 · §5.5 · p. 156 · §5.3 · p. 153 · §6 refs R95–R100 · p. 158 · App. A · p. 164 · App. B · p. 164 · App. C · p. 166 |
<!-- END VERBATIM front-matter -->

<!-- BEGIN VERBATIM appendix-a -->
## A. Access notes and limitations

- **Figma:** the 14 Oct call hit the Starter-plan MCP tool-call limit. The guide uses the earlier exports (8 trainee frames, and 4 of 10 trainer frames as images). The trainer Plan Builder, Plan, Check-ins, Activity, Progress and History frames are described from the earlier metadata audit only.
- **Mobile app:** not run. TM and TR "current state" comes from reading the source code. There are no device screenshots.
- **Meta developer docs:** the fetch tool got a 403. The opt-in content was verified through the kap.so mirror and a direct HTTP 200 check. The 17 Oct pricing figures were verified through web search and the R78 news coverage, and the Meta pages returned HTTP 200 to a direct check.
- **17 Oct 2026 update (v1.1):** the user's answers to ten open questions and four navigation changes were applied across the guide. Confluence wasn't edited; the conflicts are listed in §5.5. No Figma calls were made for this update.
- **17 Oct 2026, evening (v1.2):** decisions on sign-in (email OTP live, WhatsApp behind a flag), WhatsApp automation (built behind flags, with a template registry), no auto-sending on anyone's behalf, rows for web Home, and OQ-25 to OQ-31 were applied. No Figma or Confluence calls were made. New references R95 to R100 were checked by direct HTTP status (200), except npm (403 to automated fetches, verified through search). A candidate Meta "manage templates" URL returned 404 and was **not** used. There's no strong reference for the steps card or the "Coming soon" disabled state; they follow the guide's own principles.
- **Security observation:** a Confluence CQL search excerpt displayed plaintext credentials from pages titled "FitBud Credentials" and "Adtune Credentials" in space FM. Those pages were **not opened** and the values were not used. Recommendation: rotate those secrets and restrict or remove the pages.
- **Repository:** read-only PowerShell reads. No git changes were made. The working tree had 5 modified test files and 1 staged doc (`docs/implementation/fitbud-p1-baseline.md`), which were left untouched.
<!-- END VERBATIM appendix-a -->
