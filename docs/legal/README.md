# FitBud · legal documentation

This folder holds FitBud's legal documentation. It has two levels, and the difference matters.

| Path | What it is | Who writes it | May ship? |
|---|---|---|---|
| `docs/legal/drafts/` | **Agent-prepared drafts** for counsel and founder review. Not legal advice. Not approved. | Claude Code, from the repository and the owner's product decisions | **No** |
| `docs/legal/privacy.md`, `terms.md`, `credits.md` | **Counsel-approved final text**, committed by Firoz (D-W3-4) | Counsel / Firoz | Yes — this is what BT3 copies into `content.ts` |

**BT3 and BT3b must not read anything in `drafts/`.** D-B13 (owner, 31 Oct 2026) stands: counsel writes the shipping text, agents build the pages and links. These drafts exist to give counsel a complete, product-accurate starting point instead of a blank page, and to make the review a markup exercise rather than a drafting one.

## The draft set

| # | Draft | Covers | Primary reader |
|---|---|---|---|
| 00 | [`00-counsel-brief.md`](drafts/00-counsel-brief.md) | How the drafts were built, every assumption, the open questions, the risk register, the compliance check | Counsel, first |
| 01 | [`01-terms-of-service.md`](drafts/01-terms-of-service.md) | The master agreement for everyone: the service, eligibility, accounts, IP, liability, termination, governing law | Counsel |
| 02 | [`02-trainer-terms.md`](drafts/02-trainer-terms.md) | Trainer supplemental terms: coaching responsibility, client data handling, payments, warranties | Counsel |
| 03 | [`03-trainee-terms.md`](drafts/03-trainee-terms.md) | Trainee supplemental terms: what the trainer sees, what the trainee provides, ending coaching | Counsel |
| 04 | [`04-privacy-policy.md`](drafts/04-privacy-policy.md) | The DPDP notice and privacy policy → becomes `docs/legal/privacy.md` | Counsel |
| 05 | [`05-health-disclaimer.md`](drafts/05-health-disclaimer.md) | Health, fitness and medical disclaimer; assumption of risk | Counsel |
| 06 | [`06-acceptable-use.md`](drafts/06-acceptable-use.md) | Acceptable use, including what a trainer may and may not ask a client for | Counsel |
| 07 | [`07-beta-terms.md`](drafts/07-beta-terms.md) | Closed beta terms: TestFlight and Play closed testing, feedback, no warranty, data reset | Counsel |
| 08 | [`08-credits-and-licences.md`](drafts/08-credits-and-licences.md) | CC BY-SA attribution for exercise drawings and wger text; food data sources → becomes `docs/legal/credits.md` | Founders (facts are from the repo) |
| 09 | [`09-data-inventory-and-retention.md`](drafts/09-data-inventory-and-retention.md) | What the system actually stores, every processor, the proposed retention schedule, security measures | Founders + counsel |
| 10 | [`10-rights-and-grievance-procedure.md`](drafts/10-rights-and-grievance-procedure.md) | Internal runbook: data principal requests, deletion, breach notification | Founders |
| 11 | [`11-store-privacy-disclosures.md`](drafts/11-store-privacy-disclosures.md) | Answers for Play Data safety and Apple App Privacy, traced to code | Founders |
| 12 | [`12-in-app-notices.md`](drafts/12-in-app-notices.md) | The consent and notice strings the app itself must show, per screen | Founders + counsel |
| 13 | [`13-counsel-positions.md`](drafts/13-counsel-positions.md) | A drafted position on every open question (P1–P16), for counsel to confirm or overrule | Counsel |

Read 00 first. Read 09 before 04 — the privacy policy is only as true as the inventory behind it.

[`FILL-SHEET.md`](FILL-SHEET.md) lists every placeholder in the drafts, with the five blocking values separated from everything that can wait.

## The contracting party

The drafts name **M/s Oryvate**, a partnership firm of two partners that operates FitBud as one of its products, as the party to every agreement. Two people operating the business together are a partnership firm under the Indian Partnership Act, 1932 by operation of law, whether or not a deed exists — a sole proprietorship has one owner by definition and does not fit.

The partners are named in only two user-facing documents: Terms of Service §1, and the Privacy Policy (§2, and one partner as Grievance Officer in §14). Everywhere else the party is "FitBud", which Terms §1 defines as meaning Oryvate wherever it acts. This is deliberate. Terms of Service §18.3 transfers the agreements to a company on incorporation without re-signature, and provides that a change in the firm's constitution does not disturb them.

Open items on this, for counsel (brief §3): confirmation that a partnership is the right characterisation; whether the firm's unregistered status must be disclosed; and the consequence of section 69 of the Partnership Act, under which an unregistered firm cannot sue to enforce a contract.

## Conventions in the drafts

- `[[LIKE THIS]]` is a placeholder that must be filled before anything ships.
- `> **COUNSEL:**` is a question or flag for the reviewing lawyer, to be deleted before publication.
- `> **FACT:**` is a statement traced to a file in this repository, cited by path. If the code changes, the draft is wrong and must be updated.
- Statutory timelines are stated only where taken from the instrument itself (SPDI Rules, the 2021 Intermediary Rules, the CERT-In Directions, the DPDP Rules), with the source in draft 13 P6. Where no instrument fixes a number, the drafts use `[[CONFIRM: ...]]` rather than guess.

## Status

| Step | Owner | State |
|---|---|---|
| Drafts prepared | Claude Code | Done, 2 Nov 2026 |
| Founder read-through and placeholder fill | Firoz | Open |
| Counsel review and sign-off | Counsel | Open — text needed by **Mon 9 Nov** (beta tasklist, schedule risk) |
| Final text committed as `privacy.md`, `terms.md`, `credits.md` | Firoz | Open |
| Pages built and linked | BT3, BT3b | Blocked on the step above |

If counsel's text slips past 9 Nov, the tasklist's fallback applies: publish a short interim policy that counsel signs off, and replace it later. Both stores require a live privacy-policy URL before a testing track accepts builds.

## Disclaimer

These drafts were prepared by an AI coding agent from the product's own source code and documentation. They are not legal advice, they have not been reviewed by a lawyer, and no part of them should be published, shown to users or relied on until a qualified Indian legal practitioner has reviewed and approved them.
