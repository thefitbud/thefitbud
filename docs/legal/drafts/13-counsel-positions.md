# 13 · Positions on the open questions, for counsel to confirm or overrule

> **DRAFT for counsel review — not legal advice.** Prepared 3 Nov 2026 by an AI agent, from the drafts, the repository and the founders' answers of 3 Nov 2026. No lawyer has reviewed any of it.
> The counsel brief (00 §8) asked ten open questions. This document answers each one with the position the drafts now take, so that review is a matter of confirming or overruling specific positions rather than starting from blank questions. It also adds six questions that the founders' answers raised.

**How to read each position.** *Position* is what the drafts now say. *Basis* is the reasoning. *If we are wrong* is the consequence and the fallback. *Confidence* is the drafter's honest estimate, not a legal opinion: **high** means the position follows directly from a statute or a platform rule; **medium** means it is the better reading but a court or regulator could take another; **low** means a judgment call that needs counsel.

---

## A. Facts that changed on 3 Nov 2026

| # | Fact | Effect on the drafts |
|---|---|---|
| F1 | The contracting party is **M/s Oryvate**, a partnership firm of the two founders, which operates FitBud as one of its products. The founders intend Oryvate to own and operate further products and services under separate brands over the next few years. | 00, 01 §1, 04 §2, 07 §1A, README renamed. "FitBud", where it acts, means Oryvate (01 §1) |
| F2 | **Both founders are employed as software developers** elsewhere, and build FitBud alongside that employment. | New risk, P11 |
| F3 | **Nothing is documented between the founders**: no partnership deed, no founders' agreement, no IP assignment, no agreed allocation of liability. Nothing is registered. | P1, P12 |
| F4 | **There is no trainee-private category of data.** Everything a trainee enters — health records, injuries, conditions, medications, dietary restrictions, measurements, workout and nutrition records, check-ins, progress and meal photos — is visible to their trainer. Only the trainer's private notes are asymmetric. | 03 §4.2, 04 §1 and §4.2, 12 §2.2 and §6 rewritten to say so plainly |
| F5 | **A trainer can require meal photos.** The code lets a trainer require a photo for selected meals or all meals; a required meal cannot be logged as eaten without one (it can still be marked skipped). A progress-photo setting exists but is not enforced, and there is no check-in photo requirement. Earlier drafts said "FitBud never requires a photo", which was wrong. FitBud also stores progress, check-in and profile photos. | 02 §4.5, 03 §4.5, 04 §4.2, 09 §2.2, 12 §7 corrected |
| F6 | **Which data-protection law binds today.** The DPDP Rules were published on 13 Nov 2025. Only the Board and definitions are in force; the operative obligations (notice, consent, rights, security, breach) commence on **13 May 2027**, and s.44(2), which omits s.43A of the IT Act, commences the same day. **Until then, s.43A and the SPDI Rules 2011 apply.** The closed beta (Nov 2026) and the expected public launch (about Mar 2027) both fall under SPDI; FitBud will be live under DPDP within two months of launch. | 04 §6.5 added; 04 §14 timeline; P3, P6 |

---

## B. Positions on the ten questions in the brief

### P1 · Partnership firm now, or incorporate first? (brief Q1)

**Position.** Operate the closed beta as M/s Oryvate, a partnership firm. Before the beta opens, the founders sign a **partnership deed** (see P11 and P12 for what it must contain). Register the firm with the Registrar of Firms (Telangana) before any fee is charged. Incorporate **Oryvate Private Limited** at the earliest of: first revenue, FitBud's public launch, or any outside money. On incorporation, Terms §18.3 transfers every user agreement to the company without re-signature, and the deed assigns the firm's IP to the company.

**Basis.** Two people carrying on a business together to share profits are a firm by operation of law (Partnership Act 1932, s.4); a deed records the terms but does not create the partnership. Registration is optional; the consequence of not registering is s.69 — the firm cannot sue to enforce a contract, though it can be sued. For a free beta that costs nothing. Incorporation is never compulsory, but a company is the right vehicle for a business that intends to hire, raise and own several brands, and it ends the partners' unlimited personal liability for future obligations.

**If we are wrong.** If counsel prefers incorporation before the beta, the identity block in 01 §1 and 04 §2 changes and §18.3 becomes unnecessary; nothing else in the drafts depends on the choice.

**Confidence.** High on the characterisation; the timing is a business judgment.

### P2 · Is FitBud (Oryvate) the sole Data Fiduciary? (brief Q2)

**Position.** Yes. Oryvate is the sole Data Fiduciary for all personal data inside FitBud. Trainers are **authorised users** who access client data under the Trainer Terms (02 §4), bound to purpose limitation, confidentiality, a prohibition on identity and financial data, photo rules, breach reporting within 24 hours, and referral of every data request to us. A trainer is independently responsible for any copy of client data they take outside FitBud (02 §4.6).

**Basis.** A Data Fiduciary is whoever "alone or in conjunction with other persons determines the purpose and means of processing" (DPDP Act s.2(i)). Oryvate determines the means completely — schema, storage, retention, access rules, security — and the purpose (coaching through FitBud) is fixed by the platform, not by the trainer. The trainer's choice of *which questions to ask* is a choice within that purpose. Treating twenty individual trainers as fiduciaries would leave clients with twenty grievance processes that cannot work.

**The weakness.** A trainer who composes the questions arguably co-determines what data is collected, which points to joint fiduciary status for trainer-authored forms. The mitigations are contractual (02 §4.4, 06 §3) and in-product (12 §5: every form says the trainer wrote it and sees the answers).

**If we are wrong.** If trainers are joint fiduciaries for their own forms, add to the Trainer Terms a one-page **data-handling annex**: (a) the trainer is a joint fiduciary for questions they author; (b) Oryvate handles all notices, consents, rights requests and grievances for both, and the trainer appoints Oryvate to do so; (c) the trainer's obligations in 02 §4 continue; (d) each indemnifies the other for its own breach. The Privacy Policy §2 then names trainers as joint fiduciaries for trainer-authored questions. The product does not change.

**Confidence.** Medium.

### P3 · Do the SPDI Rules still require a separate policy? (brief Q3)

**Position.** No separate document. **One Privacy Policy written to meet both regimes**, with a section (04 §6.5) that states which law applies when. Until 13 May 2027 the SPDI Rules govern and require: a published privacy policy describing the types of sensitive data collected, the purpose, disclosures and security practices (r.4); **written consent** before collecting sensitive data, which an unticked-by-default electronic tick box satisfies (r.5(1), read with IT Act s.10A); use only for the stated purpose (r.5(4)); and a **Grievance Officer whose name and contact details are published**, who must resolve grievances within one month (r.5(9)). Draft 04 meets each of these.

**Basis.** F6. The SPDI Rules apply to a "body corporate", which s.43A defines to include a firm or other association of individuals engaged in commercial or professional activities — see P15 on whether a free beta is "commercial".

**If we are wrong.** A separate SPDI policy would be a subset of 04; it can be cut from it in an hour.

**Confidence.** High on the requirements; medium on whether one combined document is enough (it is common practice).

### P4 · Is FitBud an intermediary under s.79 and the 2021 Rules? (brief Q4)

**Position.** **Assume yes, and comply**, because compliance costs little. FitBud stores and transmits content created by one user (a trainer's plans, a client's logs and photos) for another, which is close to the definition of an intermediary in IT Act s.2(1)(w). The drafts therefore: publish rules and a privacy policy (01, 04, 06); prohibit the content categories the 2021 Rules list (06); name a grievance officer (04 §14); acknowledge complaints within 24 hours and resolve within 15 days (04 §14 aims for 24 hours; the 15-day figure should be added if counsel confirms intermediary status); and remind users of the rules at least once a year (a yearly email — product task).

**Basis.** Intermediary status brings safe-harbour protection under s.79 for content FitBud did not author, which is valuable against the main liability risk (a trainer's harmful plan). Accepting the status therefore helps more than it costs.

**If we are wrong.** If FitBud is not an intermediary, the extra steps are harmless good practice.

**Confidence.** Medium on status; high that complying is the right default.

### P5 · Do the Consumer Protection (E-Commerce) Rules 2020 apply? (brief Q5)

**Position.** **Not during the free beta.** The Rules apply to an "e-commerce entity" operating a digital platform for the buying or selling of goods or services. FitBud sells nothing and facilitates no sale between trainer and client (payments are recorded, never transacted). **Once Oryvate charges trainers through the app**, Oryvate itself sells a digital service and the Rules may apply to that sale. The identity disclosures they require (legal name, address, grievance officer, contact) are already in 01 §1 and 04 §14, so nothing further is needed then except a refund and cancellation section in the Terms.

**Confidence.** Medium.

### P6 · Statutory timelines (brief Q6)

**Position.** The drafts adopt the strictest timeline that applies at each stage:

| Obligation | Today (SPDI, IT Act) | From 13 May 2027 (DPDP) | Drafts adopt |
|---|---|---|---|
| Grievance — resolution | 1 month (SPDI r.5(9)); 15 days if intermediary, with acknowledgement in 24 hours (2021 Rules r.3(2)) | Within a reasonable period not exceeding 90 days (DPDP Rules r.14(3)) | Acknowledge in 24 hours, resolve within one month (04 §14) — tighten to 15 days if P4 is confirmed |
| Personal data breach — to the regulator | Cyber incidents to **CERT-In within 6 hours** (P13) | To the Data Protection Board **without delay**, and a detailed report **within 72 hours** (DPDP Rules r.7) | Both, in draft 10 §6 |
| Personal data breach — to affected people | No fixed time | Without delay (r.7) | Without delay |
| Erasure on request | No fixed time | Without delay once the purpose is no longer served; no fixed number of days for this class of fiduciary | Within 30 days of request, confirmed by email (04 §12) |
| Account deletion web link | Required by Google Play now (draft 11, Play Data safety table) | Same | `/privacy#delete-account` (04 §12) |

**Confidence.** High for the DPDP and CERT-In figures (taken from the instruments); medium for the intermediary figures, which depend on P4.

### P7 · Consent: one consent at acceptance, or one per trainer form? And how to accept changed terms (brief Q7)

**Position.** One **separate** data-processing consent at invitation acceptance (12 §2.2), covering health information, photographs and the trainer seeing everything, plus an in-form notice on every trainer-authored form (12 §5). Not a fresh consent per form: each form serves the same purpose (coaching by that trainer) that the client already consented to. Terms acceptance and data consent are **separate tick boxes** (12 §2.1, §2.2), and the Terms say the Privacy Policy is a notice, not a contract term (01 §9, §18.1). Material changes to any document need a **fresh in-app acceptance** (01 §16, 12 §2.4), not "continued use".

**Basis.** DPDP s.6(1) requires consent that is free, specific, informed, unconditional and unambiguous, and limited to what is necessary for the specified purpose; SPDI r.5(1) requires written consent before sensitive data is collected. A consent folded into "I agree to the Terms" is neither specific nor unconditional. Consent is still a condition of using FitBud, because FitBud cannot function without processing coaching data; 04 §6.2 says so and states the consequence of withdrawal.

**Confidence.** High on separation; medium on one consent covering future trainer forms.

### P8 · Liability cap for a free service (brief Q8)

**Position.** Cap at the greater of fees paid in the preceding twelve months and **₹5,000** (01 §12.3), with exclusions of indirect loss (§12.4) and carve-outs for what cannot be excluded — death or personal injury caused by our negligence, and fraud (§12.5). A nominal floor rather than nil.

**Basis.** A nil cap for a free service is the likeliest to be struck down as an "unfair contract" term against a consumer under the Consumer Protection Act 2019 (s.2(46), s.49(2)). A nominal floor plus a fee-based cap that works automatically once fees begin is defensible and needs no redraft at launch. The real protection against injury claims is not the cap but the structure: FitBud authors no coaching (01 §2.2), the trainer warrants competence and bears coaching responsibility (02 §2–3), and the client acknowledges the health notice (05, 12 §4).

**Confidence.** Low on the figure (counsel's call); medium on the structure.

### P9 · Trainer indemnity (brief Q9)

**Position.** Indemnity from **trainers only**, limited to the risks they control: their coaching, claims by their clients about that coaching, their breach of the Terms, and misuse of client data (01 §13). **No indemnity from clients.**

**Basis.** A trainer uses FitBud in the course of their own business; an indemnity for their own coaching is a fair allocation. A client is a consumer, and an indemnity from a consumer is a likely unfair term. Against an individual trainer the indemnity is worth little in money, but it records the allocation of responsibility, which matters if a client sues both.

**Confidence.** Medium.

### P10 · Photographs (brief Q10)

**Position.** Treat every photograph — progress, meal, check-in, profile — as sensitive. Disclose before first upload that the trainer sees it and may require meal photos, and that the client can ask the trainer to switch a requirement off (12 §7). Trainers may require photos only where it helps them coach, must respect a client's refusal, and may not download, share or publish a photo without the client's specific written permission (02 §4.5). Progress photos can reveal physical condition and are treated as health data under SPDI r.3.

**The point to test.** Because a trainer can make a photo a condition of logging a meal as eaten, the photo is not entirely optional for a client whose trainer requires it (the client can still mark the meal skipped, which records something untrue). The drafts handle this by disclosure and by the trainer's obligation to switch the requirement off on request. If counsel considers that insufficient for free consent, the product fallback is to let the client log a required meal as eaten without a photo, marked "no photo" for the trainer.

**Confidence.** Medium.

---

## C. New questions raised by the founders' answers

### P11 · The founders' employment and ownership of FitBud — **highest priority**

**Position.** This is the largest legal risk in the business today, and it is not in any user-facing document. Before the closed beta opens, each founder should:

1. **Read their own employment agreement** for (a) an IP-assignment or inventions clause, (b) a moonlighting, outside-work or exclusivity clause, and (c) confidentiality. Note whether the assignment covers only work made in the course of employment, or anything made during employment, or anything "related to the employer's business".
2. If either agreement assigns work made **outside** working hours or with personal resources, or covers work "related to" an employer's business that could include fitness or mobile software, **obtain a written no-objection or carve-out** from that employer naming FitBud and Oryvate before going further.
3. Keep FitBud work strictly on personal devices, personal accounts and personal time, with no employer code, tools, licences or confidential information. (The developer accounts are already personal, which helps.)
4. Sign the **partnership deed with an IP clause** that vests in the firm everything either founder has made or will make for FitBud and other Oryvate products, with a present assignment of what already exists.

**Basis.** No Indian statute prohibits moonlighting; the restriction, if any, is contractual. An exclusivity clause creates an employment risk that depends on the employer choosing to act. An **IP-assignment clause** is different: if it reaches FitBud, the employer may already own part of the code, regardless of whether it ever acts — and that surfaces in any investor or acquirer's diligence, and potentially when Oryvate assigns its IP to a company. Out-of-hours work on personal equipment strengthens the founders' position but does not settle it; the wording of each clause does.

**What counsel is asked.** Review both employment agreements' IP and outside-work clauses (the founders to supply them), advise whether a no-objection is needed, and draft or review the deed's IP clause.

**Confidence.** High that this must be checked; the answer depends entirely on the two contracts.

### P12 · How liability is shared between the founders

**Position.** Toward users and everyone else, both partners are liable **jointly and severally and without limit** for the firm's acts (Partnership Act s.25), whatever they agree between themselves; the drafts cannot change that and do not try. **Between** the founders, the deed should record: capital and expense contributions; profit and loss shares (equal unless agreed otherwise); that each indemnifies the other for loss caused by their own breach of the deed, fraud or wilful misconduct; decision-making and a deadlock rule; **vesting** of each founder's share over time with a cliff, so a founder who leaves early does not keep half; what happens on exit, death or incapacity; that the firm's business covers FitBud and any other product the partners agree to run under Oryvate; and the IP clause in P11. The deed is also the document that moves into a shareholders' agreement on incorporation.

**What counsel is asked.** Draft the deed, or review a draft. Advise whether a founders' agreement is needed separately or whether the deed suffices until incorporation.

**Confidence.** High.

### P13 · CERT-In Directions (28 Apr 2022)

**Position.** **Assume they apply.** They bind service providers, intermediaries, data centres and **body corporate** — the same IT Act definition that brings a firm within SPDI. They require: (a) reporting the incident types in their Annexure I to CERT-In **within 6 hours** of noticing them; (b) a named point of contact for CERT-In; (c) system clocks synchronised to NTP; and (d) **ICT system logs kept for a rolling 180 days**, retrievable for CERT-In, with a copy available within India per CERT-In's FAQ.

**The conflict this creates.** The earlier draft of 09 §5.1 proposed deleting access logs after 30 days, and Cloudflare's Workers log retention is short. **180-day log retention is a floor under the Directions, not a cap**, so 30 days likely did not comply; 09 §5.1 now says 180 days. The access logs contain no coaching data (09 §2.4), so keeping them longer is low-risk for privacy. Product task: export Workers request logs to storage kept for 180 days (for example an R2 bucket via Logpush, with a location hint for India or the nearest available region), and name a CERT-In point of contact (the same person as the grievance officer).

**What counsel is asked.** Confirm applicability to a two-person unregistered firm running a free beta, and whether logs outside India with retrieval on demand suffice.

**Confidence.** Medium on applicability; high on what the Directions require if they apply.

### P14 · One firm, several products

**Position.** The firm is named Oryvate because Oryvate is intended to run further products. The user documents are written for FitBud only and say so (01 §1). When a second product launches under the same firm, it gets its own terms and privacy policy, and FitBud's documents need no change. Product data is never shared across Oryvate products without fresh notice and consent; 04 §6.4 already rules out use for any other purpose, which covers this.

**What counsel is asked.** Confirm that "Oryvate" as an unregistered firm name raises no conflict with an existing registered mark or company name (the founders have not yet searched MCA, IP India or domains), and that one firm operating unrelated consumer products creates no problem the drafts should address.

**Confidence.** High on the structure; the name search is a factual check.

### P15 · Is a free closed beta "commercial activity"?

**Position.** **Assume yes.** The SPDI Rules and CERT-In Directions reach a firm "engaged in commercial or professional activities". The beta is a pre-launch stage of a business that intends to charge, run by a firm formed to profit from it. Arguing that a free beta is non-commercial might succeed, but it would be a poor reason to skip obligations that the drafts already meet at little cost.

**Confidence.** Medium on the law; high that the cautious assumption is the right one.

### P16 · Naming the founders

**Position.** Name both partners in Terms §1 and Privacy Policy §2 (identification of the counterparty and of the Data Fiduciary), and one partner as Grievance Officer in Privacy Policy §14 (required by SPDI r.5(9), and by the 2021 Rules if P4 holds). Publish an operating address: SPDI and the 2021 Rules require name and contact details; a postal address is the safer reading, and a business or co-working address avoids publishing a home. The store listings already show at least one founder's name, because the developer accounts are personal.

**Confidence.** High that the grievance officer must be named; medium on whether an address is strictly required.

---

## D. What counsel is asked to do, in order

1. **P11** — review both employment agreements and advise; draft or review the partnership deed with the IP and liability clauses (P11, P12).
2. **P2** — rule on sole versus joint fiduciary.
3. **P7** — confirm the consent architecture.
4. **P4, P13, P15** — confirm intermediary status, CERT-In applicability and the "commercial activity" assumption; these set the grievance and log-retention timelines.
5. **P8, P9** — set the cap figure; confirm the trainer-only indemnity.
6. **P3, P5, P6, P10, P14, P16** — confirm.
7. Read drafts 01–07 and 12 for drafting quality and Indian-law fit, and check the Apple end-user terms in 01 §19.

## E. Not for counsel — for a CA or CS

GST registration and reverse charge on imported services (Cloudflare, Apple, Google) at nil revenue; Telangana Shops and Establishments registration; whether the firm must file an income-tax return at nil income; and what changes when fees are charged through the app stores. These do not affect the user-facing drafts.
