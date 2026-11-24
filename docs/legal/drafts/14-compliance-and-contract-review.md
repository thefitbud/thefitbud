# 14 · Pre-beta compliance and contract review

> **Not legal advice.** Prepared 24 Nov 2026 by AI agents acting in the role of Indian counsel. Two independent reviews were run — a regulatory compliance check and a clause-by-clause contract review — by agents that had not seen the drafter's brief (00) or positions (13). Their findings were then checked against the draft text before inclusion. A qualified Indian advocate must confirm before anything here is relied on.
> **Scope:** drafts 01–07 and 12 (user-facing), with 09–11 as factual context. **Review basis:** no organisational playbook exists, so the contract review uses general Indian market practice for consumer app terms. **Our side:** the operator, Shaik Firoz Basha (sole proprietor, FitBud).

---

## Verdict for the 1 Dec 2026 closed beta: **Proceed with conditions**

Both reviews reached the same conclusion independently. The drafting is unusually honest about who does what and who sees what, and the core risk allocation is sound. **What falls short is mostly implementation, not wording**: consent is not yet recorded, retention promises do not yet match the code, and a few operational duties (CERT-In logging, processor contracts, the Play health declaration) are not done. Overall risk for the beta: **Medium** — low consumer-law exposure while it is free and small, but the liability clauses protect little without proof of acceptance and retained records.

---

## A. Conditions — do these before the first real invitation

| # | Condition | Why | Where | Type |
|---|---|---|---|---|
| A1 | **Build the acceptance screens and the acceptance log**: separate tick boxes, 18+ confirmation, a versioned row per document per user (add app build and timestamp), and a confirmation email linking to the versions accepted | SPDI r.5(1) needs written consent *before* health data is collected, and the Privacy Policy already says "your tick box is that consent". Without a record, assent cannot be proved (IT Act s.10A; Bharatiya Sakshya Adhiniyam s.63) | 12 §2.1–2.3 | Product |
| A2 | **Show the Health and Fitness Disclaimer before acceptance, and add it to the agreement tick box** | 05 says it must be shown before acceptance; 12 shows it after. An exclusion seen only after contracting is the easiest to attack. 01 §18.1 makes it part of the agreement but no box names it | 05 header, 12 §2.1–2.2, §4 | Text + product |
| A3 | **Make retention and deletion promises true, and add a legal-claims exception** | 04 promises deletion "within [[30]] days", but `idempotency_records` and `sync_mutations` keep full response bodies with no expiry and the backup window is unknown — a misstatement in a published policy (SPDI r.5(4)). Separately, deleting an injured client's records on request destroys the evidence both FitBud and the trainer need (DPDP s.17(1)(a) supports a restricted copy). The Intermediary Rules also require registration data to be kept 180 days after an account closes | 01 §14.3, 04 §9 and §12, 09 §5.3, 10 §9.2 | Code + text |
| A4 | **Accept each processor's data-processing terms and establish the data locations** | SPDI r.7 allows transfer only to a recipient ensuring the same protection; 04 §8 is still blank | 04 §8, 09 §4, §7 | Owner |
| A5 | **CERT-In: export request logs for 180 days and register a point of contact** | CERT-In Directions (28 Apr 2022); logs may sit abroad if producible on demand | 09 §5.1, 10 §6.3 | Ops |
| A6 | **Google Play: complete the Health apps declaration, Data safety form and deletion link** | Required for closed-testing tracks too; 11 §2.3 still says "[[Confirm]]" | 11 | Owner |
| A7 | **Tighten the liability clause and fix the survival list** (redlines R4, R5 below), and fill the open placeholders | 12.2 is not subject to 12.5; the cap does not say it covers negligence; 14.3 survives §16 instead of §18; 04 §16 still carries "[[BUSINESS ADDRESS]]"; 05 §4 "[[AGE]]"; 01 §12.3, §15.2, §16, §17.4 | 01, 04, 05 | Text |

## B. Before external TestFlight review or public launch

| # | Item | Why | Where |
|---|---|---|---|
| B1 | **In-app account deletion** — a Settings → Delete account button that creates a logged request and confirms on screen; manual completion behind it is fine | Apple guideline 5.1.1(v): apps outside regulated industries should not require users to send an email to delete. Likely a blocker at external beta review, certain at launch | 12 §9, 07 §4.2, 04 §12 |
| B2 | **Intermediary compliance (s.79 safe harbour)** — state the intermediary role for user content (R1), add the Rule 3(1)(b) prohibited-content list to the AUP, adopt 24 h acknowledgement / 15 days resolution / 72 h for removal requests, send users an annual reminder of the rules | Safe harbour for trainer-authored plans is FitBud's strongest defence in the injured-client scenario, and it is cheap to keep | 01 §2, 04 §14, 06 |
| B3 | **Consent withdrawal in the app** before 13 May 2027; until then, correct the text | 04 §6.2 says withdrawal "is as easy as giving it", but it is email-only — untrue now, a DPDP s.6(4) breach from May 2027 | 04 §6.2 |
| B4 | **Written security policy** built from 09 §6; switch the IP hash to a keyed hash | SPDI r.8 expects a documented security programme | 09 §2.1, §6 |
| B5 | **DPDP readiness for 13 May 2027** — fill 10 §3 timelines (30-day internal target, 90-day outer limit, DPDP Rules r.14(3)), add a nominee field, keep processing logs for one year (r.8(3)) and state it as a retention exception | | 10 §3–4.6, 04 §9 |
| B6 | **Before charging trainers** — incorporate, buy cyber and liability insurance, add GST and app-store billing terms, and check the E-Commerce Rules disclosures | Paying self-employed trainers may be "consumers" (CPA s.2(7)), which sharpens unfair-term review | 01 §15 |

---

## C. Regulatory map

| Regulation | Applies | Key requirement | Status |
|---|---|---|---|
| IT Act s.43A and SPDI Rules 2011 | **Now, until 13 May 2027** | Published policy (r.4); written consent before collecting health data (r.5(1)); purpose and retention limits (r.5(4)); named Grievance Officer, one month (r.5(9)); equivalent protection on transfer (r.7); documented security (r.8) | **Partly** — policy and grievance officer done; consent recording, transfers, retention accuracy and security policy open (A1, A3, A4, B4) |
| DPDP Act 2023 and Rules 2025 | Board provisions now; duties, rights and penalties from **13 May 2027**. A proposal to bring this forward has not been notified | Notice; easy withdrawal; breach report in 72 h; one-year logs; 90-day request window | **Partly** — drafts are written to DPDP; B3, B5 open |
| IT (Intermediary Guidelines) Rules 2021 and s.79 | Now — FitBud hosts and transmits user content | Rules and prohibited-content list; 180-day registration-data retention; 24 h / 15 days / 72 h timelines; annual reminder | **Not met** (B2, A3) |
| CERT-In Directions 2022 | Now | 6-hour incident reporting; point of contact; 180-day logs | **Partly** (A5) |
| Consumer Protection Act 2019 | Weak while free; real once trainers pay | No unfair contract terms (s.2(46)) | **Mostly met** — keep 01 §12.5 and the trainer-only indemnity |
| Consumer Protection (E-Commerce) Rules 2020 | Only if FitBud charges | Rule 4 disclosures | N/A now (B6) |
| Contract Act 1872 (ss.23, 27, 28); IT Act s.10A | Now | Valid clickwrap; no bar on legal proceedings or limitation periods | **Met, two tweaks** (R10, R13) |
| Advertising and health-claim law | If marketing claims are made | No cure, treatment or weight-loss claims | **Met** (11 §4, 06 §2.3) |
| Apple 5.1.1(v); Google Play Data safety, Health apps declaration, account deletion | Now (Play); external TestFlight review and launch (Apple) | In-app deletion; accurate declarations | **Partly** (A6, B1) |

---

## D. Clause-by-clause review (operator's side)

| Clause | Rating | Issue |
|---|---|---|
| 01 §1 Operator identity | YELLOW | No Hyderabad place of business stated, so the Hyderabad court choice has no anchor (R10) |
| 01 §2 What FitBud is and is not | GREEN (gap) | Strong; add intermediary positioning (R1) |
| 01 §3–5 Eligibility, accounts, visibility | GREEN | §5.1's list is narrower than "everything" in 03/04 — align wording |
| 01 §6.2 Licence to user content | YELLOW | Does not cover backups, service providers, legal compliance or claims (R7) |
| 01 §9 Privacy as a notice | YELLOW | 07 §4.1 and 03 §4.3 make privacy promises contractual — reconcile |
| 01 §12.1 Warranty disclaimer | GREEN | |
| 01 §12.2–12.4 Exclusions and cap | YELLOW (high) | Not subject to §12.5; no tort or negligence wording; cap is a placeholder; app-store fees not covered (R4) |
| 01 §12.5 Non-excludable liability | GREEN | Essential; keep |
| 01 §13 / 02 §8 Trainer indemnity | YELLOW | Two different versions; no carve-out for FitBud's own fault; no claims procedure (R6) |
| 01 §14.2 Suspension | YELLOW | Notice-and-cure overrides AUP §5.2 immediate action under the precedence order (R12) |
| 01 §14.3 Effect of termination | RED | No legal-claims retention (A3, R3); survival list wrong (R5) |
| 01 §15 Fees | YELLOW | "We will not charge clients" is permanent and conflicts with 03 §8.3; no GST or store billing (R16) |
| 01 §16 Changes | YELLOW | No faster path for legal or security changes (R11) |
| 01 §17 Law and disputes | GREEN / YELLOW | Sound; consumer-forum rights preserved; no arbitration is right. Depends on R10; add R13 |
| 01 §18.3 Assignment | YELLOW | Obligations cannot move without consent; add advance consent and release (R9) |
| 01 §18.7 Force majeure | YELLOW | Too thin (R17) |
| 01 §19 App stores | GREEN | 07 §8 wrongly says Apple's terms "apply to Google Play too" — fix 07 |
| 02 §1–3 Independence, warranties, coaching | GREEN | Coaching responsibility clearly the trainer's |
| 02 §4 Client data duties | GREEN / YELLOW | Strong; add a basic security duty (R14); data-role allocation open (section E) |
| 02 §10 Survival | YELLOW | Omits 4.2, 4.7, 4.10 (R15) |
| 03 Trainee Terms | GREEN | Plain and honest; §4.2 visibility is a strength. §7.3/§10 describe a WhatsApp opt-in that is switched off — say "if we add it, we will ask you first" |
| 05 Disclaimer | GREEN | Placement problem (A2); "[[AGE]]" — 45 is a reasonable figure |
| 06 Acceptable Use | GREEN (gap) | Add Rule 3(1)(b) list (B2) |
| 07 §5.2 Feedback | YELLOW | Licence lapses with the beta and is not transferable — move to 01 (R8) |
| 07 §7.1 Ending access | YELLOW | Removal "at any time" risks an unfair-term finding; add notice (R18) |
| 12 Acceptance mechanics | RED | Log not built; disclaimer outside the agreement box (A1, A2) |

### Redlines

**R1 · 01 new §2.7 — Must-have.** "For content that trainers and clients put into FitBud, we act as an intermediary under section 79 of the Information Technology Act, 2000. You must not host, display, upload or share any information prohibited by rule 3(1)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, as listed in Acceptable Use Policy §2.10." *Add that list to 06 §2.10.*

**R2 · 12 §2.1 and §2.2, agreement tick box — Must-have.** "I agree to the Terms of Service, the [Trainer/Trainee] Terms, the Beta Terms, the Acceptable Use Policy and the Health and Fitness Disclaimer." Keep the first-run acknowledgement screen as well.

**R3 · 01 §14.3, add — Must-have.** "We may keep a restricted copy of records that are needed to establish, exercise or defend a legal claim, or that the law requires us to keep, for only as long as that need lasts. Nobody can use that copy for coaching." *Mirror in 04 §9 and §12.*

**R4 · 01 §12 — Must-have.** 12.2: "**Subject to §12.5,** we are not responsible for:". 12.3: "…our total aggregate liability to you for all claims connected with FitBud, **whether in contract, tort (including negligence), breach of statutory duty or otherwise,** is limited to the greater of (a) the fees paid by you for FitBud, **directly or through an app store,** in the twelve months before the event giving rise to the claim and (b) ₹[[5,000 / 10,000]]." 12.4: prefix "**Subject to §12.5, and whether in contract, tort (including negligence) or otherwise,**".

**R5 · 01 §14.3 survival — Must-have.** "Clauses 6.2 (to the extent necessary), 7, 12, 13, 14.3, 17, 18 and 19 survive."

**R6 · 01 §13 and 02 §8 — Should-have.** 01 §13: "If you use FitBud as a trainer, you give the indemnity in Trainer Terms §8. Clients give no indemnity." 02 §8: "You will indemnify us against any third-party claim (including by your client or a regulator), and resulting loss, liability, cost or reasonable legal expense, to the extent permitted by law and to the extent it arises from your coaching or anything you prescribe, your breach of §2 or §4, or your breach of data-protection law — except to the extent caused by our own breach or negligence. We will tell you promptly about any such claim, let you take part in its defence at your cost, and not admit fault on your behalf without your consent."

**R7 · 01 §6.2 — Should-have.** "You grant us a non-exclusive, royalty-free licence, which we may sublicense to our service providers, to host, store, copy, transmit, back up and display your content in order to operate, secure and support FitBud for you and for the other party to your coaching relationship, to comply with the law, and to establish or defend legal claims — for as long as your account or that relationship record exists and, for backups and records kept under §14.3, until they are deleted. Each party to a coaching relationship may use the other's content only for that coaching." *Keep the existing "We do not use your content to advertise…" sentence.*

**R8 · move 07 §5.2 to 01 as §7.5 — Should-have.** "If you send us feedback, you grant us a perpetual, irrevocable, royalty-free, transferable licence to use it to improve FitBud. You keep any rights you have in it."

**R9 · 01 §18.3, add — Should-have.** "You agree in advance to such a transfer; from the date of transfer the proprietor is released from obligations arising afterwards."

**R10 · 01 §1, add after the address — Should-have.** "…and carries on that business from [[Hyderabad address]], Telangana". *Section 28 lets parties choose only among courts that already have jurisdiction (CPC s.20).*

**R11 · 01 §16, add — Should-have.** "A change required by law or a regulator, or needed to address a security risk, may take effect sooner, with as much notice as we reasonably can give."

**R12 · 01 §14.2 — Should-have.** "Except where it would be unlawful or unsafe to do so, **or where Acceptable Use Policy §5.2 or Trainer Terms §9 applies,** we will tell you why…"

**R13 · 01 §17.4, add — Should-have.** "This does not affect any limitation period or your right to seek urgent relief."

**R14 · 02 §4.1, add — Should-have.** "You will comply with data-protection law for any client data you hold outside FitBud, keep your devices locked and up to date, and let nobody else view client data through your account."

**R15 · 02 §10 — Should-have.** "Clauses 4.2, 4.3, 4.5, 4.6, 4.7, 4.10, 6.3 and 8, and anything that by its nature should continue, survive its end."

**R16 · 01 §15.2, last sentence — before charging.** "Fees, if introduced, are payable by trainers only, [[inclusive of / plus]] GST, under the billing, renewal and refund rules of the app store you pay through. These Terms provide for no fee payable by clients." *Align 03 §8.3.*

**R17 · 01 §18.7 — Nice-to-have.** "Neither of us is liable for a failure or delay caused by events outside our reasonable control, including failure of a cloud, app-store, telecom or notification provider, a cyber-attack that reasonable security practices would not have prevented, epidemic, natural disaster or government action."

**R18 · 07 §7.1 — Should-have.** "We may end the beta, change who is in it, or remove your access for a reason connected with running it, on [[7]] days' email notice unless Terms of Service §14.2 allows immediate action, and we will tell you how to get a copy of your data."

### Cross-document inconsistencies found

- Disclaimer timing: 05 says before acceptance, 12 after (A2).
- 01 §18.1 makes the disclaimer contractual, but no tick box names it (R2).
- Survival list in 01 §14.3 names §16 instead of §18 (R5).
- Trainer account closure deletes plans (01 §14.3, 04 §12), but clients keep a history that contains them (01 §5.5, 03 §9.3) — state that a client's history keeps the plan versions they were given.
- Client fees: 01 §15.2 "will not charge" vs 03 §8.3 "no plans to" (R16).
- Suspension: 01 §14.2 cure right outranks 06 §5.2 immediate action (R12).
- Privacy Policy status: notice in 01 §9 and §18.1; contractual in 07 §4.1 and 03 §4.3.
- 07 §8 says Apple's terms apply to Google Play; they do not.
- Indemnity worded differently in 01 §13 and 02 §8 (R6).
- Names: "Health and Fitness Disclaimer" vs "Health and Fitness notice" (12); "Trainee Terms" vs the 03 title "Terms for Clients (Trainees)"; "coach" in 12 vs "trainer" in the contracts.
- Beta-only wording sits in permanent terms (01 §4.3).
- 04 §16 still has a "[[BUSINESS ADDRESS]]" placeholder although §2 gives the address.

---

## E. Points the two reviews (and the drafter) see differently — for counsel to decide

1. **Trainers' data role.** The drafts make FitBud the *sole* Data Fiduciary, with trainers as authorised users (13 P2). The compliance review thinks trainers, who write their own forms, can require photos and keep exported copies, are more likely **independent fiduciaries** for their coaching decisions and exports, and recommends saying so with a short data-sharing clause in 02 §4. 13 P2 already has a fallback annex for this.
2. **Intermediary and fiduciary at once.** Both reviews recommend claiming s.79 intermediary status for user content (R1). Counsel should confirm this sits comfortably alongside FitBud's role as Data Fiduciary for the same data.
3. **Cap figure.** The drafts propose a ₹5,000 floor; the contract review suggests ₹10,000 as easier to defend for a health-data breach. A judgement call.

## F. Not independently verified

The reviews verified the DPDP commencement dates, the SPDI Rules text, the Intermediary Rules timelines, the CERT-In FAQs and Apple's account-deletion guidance against published sources. They did **not** re-check online the text of IT Act ss.10A, 43A ("body corporate") and 79, the Contract Act sections, the Bharatiya Sakshya Adhiniyam s.63 reference, or Google Play's account-deletion page. Confirm before relying on them.
