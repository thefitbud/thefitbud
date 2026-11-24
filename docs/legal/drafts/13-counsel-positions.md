# 13 · Positions on the open questions, for counsel to confirm or overrule

> **DRAFT for counsel review — not legal advice.** Prepared 3 Nov 2026, revised 24 Nov 2026 by an AI agent, from the drafts, the repository and the owner's answers of 3 and 24 Nov 2026. No lawyer has reviewed any of it.
> The counsel brief (00 §8) asked ten open questions. This document answers each one with the position the drafts now take, so that review is a matter of confirming or overruling specific positions rather than starting from blank questions. It also adds further questions that the owner's answers raised.

**How to read each position.** *Position* is what the drafts now say. *Basis* is the reasoning. *If we are wrong* is the consequence and the fallback. *Confidence* is the drafter's honest estimate, not a legal opinion: **high** means the position follows directly from a statute or a platform rule; **medium** means it is the better reading but a court or regulator could take another; **low** means a judgment call that needs counsel.

---

## A. Facts that changed on 3 and 24 Nov 2026

| # | Fact | Effect on the drafts |
|---|---|---|
| F1 | **24 Nov 2026: FitBud is a sole proprietorship of Shaik Firoz Basha.** The earlier plan (a two-person partnership firm, Oryvate, owning several products) is set aside. | 00 §3, 01 §1 and §18.3, 04 §2 and §14, 07 §1A, 10 §1, 11 §3.4 rewritten |
| F2 | **Employment facts.** The proprietor left his previous employer on 14 Aug 2026 and began FitBud afterwards (repository created 26 Sep 2026). He joined a new employer on 5 Nov 2026 and has signed no IP or NDA there; the offer letter does not mention IP. | P11 |
| F3 | **Lokesh**, earlier a co-founder, is bound by an IP and NDA agreement with his own employer. He has confirmed he has no ownership in FitBud; the proprietor states all of his early commits have been replaced. The proprietor owns every FitBud account. No trade mark application has been filed. | P11, P12 |
| F4 | **There is no trainee-private category of data.** Everything a trainee enters — health records, injuries, conditions, medications, dietary restrictions, measurements, workout and nutrition records, check-ins, progress and meal photos — is visible to their trainer. Only the trainer's private notes are asymmetric. | 03 §4.2, 04 §1 and §4.2, 12 §2.2 and §6 rewritten to say so plainly |
| F5 | **A trainer can require meal photos.** The code lets a trainer require a photo for selected meals or all meals; a required meal cannot be logged as eaten without one (it can still be marked skipped). A progress-photo setting exists but is not enforced, and there is no check-in photo requirement. Earlier drafts said "FitBud never requires a photo", which was wrong. FitBud also stores progress, check-in and profile photos. | 02 §4.5, 03 §4.5, 04 §4.2, 09 §2.2, 12 §7 corrected |
| F6 | **Which data-protection law binds today.** The DPDP Rules were published on 13 Nov 2025. Only the Board and definitions are in force; the operative obligations (notice, consent, rights, security, breach) commence on **13 May 2027**, and s.44(2), which omits s.43A of the IT Act, commences the same day. **Until then, s.43A and the SPDI Rules 2011 apply.** The closed beta (Nov 2026) and the expected public launch (about Mar 2027) both fall under SPDI; FitBud will be live under DPDP within two months of launch. | 04 §6.5 added; 04 §14 timeline; P3, P6 |

---

## B. Positions on the ten questions in the brief

### P1 · Sole proprietorship now, or incorporate first? (brief Q1)

**Position.** Operate the closed beta as a sole proprietorship of Shaik Firoz Basha, trading as FitBud. No registration is needed for the proprietorship to exist; the proprietor's PAN is the business's PAN, and FitBud's income is reported on his own income-tax return. Incorporate a private limited company at the earliest of: first revenue, FitBud's public launch, or any outside money. On incorporation, Terms §18.3 transfers every user agreement to the company without re-signature, and the proprietor assigns the codebase, brand, domain and accounts to it by a written assignment.

**Basis.** One person carrying on business alone, without incorporating, is a sole proprietor; there is no separate legal entity. That is the simplest lawful structure for a free beta. Its cost is unlimited personal liability, which is why incorporation should follow the first real trigger.

**If we are wrong.** If counsel prefers incorporation before the beta, the identity blocks in 01 §1 and 04 §2 change and §18.3 becomes unnecessary; nothing else in the drafts depends on the choice.

**Confidence.** High on the characterisation; the timing is a business judgment.

### P2 · Is FitBud's proprietor the sole Data Fiduciary? (brief Q2)

**Position.** Yes. The proprietor is the sole Data Fiduciary for all personal data inside FitBud. Trainers are **authorised users** who access client data under the Trainer Terms (02 §4), bound to purpose limitation, confidentiality, a prohibition on identity and financial data, photo rules, breach reporting within 24 hours, and referral of every data request to us. A trainer is independently responsible for any copy of client data they take outside FitBud (02 §4.6).

**Basis.** A Data Fiduciary is whoever "alone or in conjunction with other persons determines the purpose and means of processing" (DPDP Act s.2(i)). The proprietor determines the means completely — schema, storage, retention, access rules, security — and the purpose (coaching through FitBud) is fixed by the platform, not by the trainer. The trainer's choice of *which questions to ask* is a choice within that purpose. Treating twenty individual trainers as fiduciaries would leave clients with twenty grievance processes that cannot work.

**The weakness.** A trainer who composes the questions arguably co-determines what data is collected, which points to joint fiduciary status for trainer-authored forms. The mitigations are contractual (02 §4.4, 06 §3) and in-product (12 §5: every form says the trainer wrote it and sees the answers).

**If we are wrong.** If trainers are joint fiduciaries for their own forms, add to the Trainer Terms a one-page **data-handling annex**: (a) the trainer is a joint fiduciary for questions they author; (b) the proprietor handles all notices, consents, rights requests and grievances for both, and the trainer appoints the proprietor to do so; (c) the trainer's obligations in 02 §4 continue; (d) each indemnifies the other for its own breach. The Privacy Policy §2 then names trainers as joint fiduciaries for trainer-authored questions. The product does not change.

**Confidence.** Medium.

### P3 · Do the SPDI Rules still require a separate policy? (brief Q3)

**Position.** No separate document. **One Privacy Policy written to meet both regimes**, with a section (04 §6.5) that states which law applies when. Until 13 May 2027 the SPDI Rules govern and require: a published privacy policy describing the types of sensitive data collected, the purpose, disclosures and security practices (r.4); **written consent** before collecting sensitive data, which an unticked-by-default electronic tick box satisfies (r.5(1), read with IT Act s.10A); use only for the stated purpose (r.5(4)); and a **Grievance Officer whose name and contact details are published**, who must resolve grievances within one month (r.5(9)). Draft 04 meets each of these.

**Basis.** F6. The SPDI Rules apply to a "body corporate", which s.43A defines to include "a firm, sole proprietorship or other association of individuals engaged in commercial or professional activities" — see P15 on whether a free beta is "commercial".

**If we are wrong.** A separate SPDI policy would be a subset of 04; it can be cut from it in an hour.

**Confidence.** High on the requirements; medium on whether one combined document is enough (it is common practice).

### P4 · Is FitBud an intermediary under s.79 and the 2021 Rules? (brief Q4)

**Position.** **Assume yes, and comply**, because compliance costs little. FitBud stores and transmits content created by one user (a trainer's plans, a client's logs and photos) for another, which is close to the definition of an intermediary in IT Act s.2(1)(w). The drafts therefore: publish rules and a privacy policy (01, 04, 06); prohibit the content categories the 2021 Rules list (06); name a grievance officer (04 §14); acknowledge complaints within 24 hours and resolve within 15 days (04 §14 aims for 24 hours; the 15-day figure should be added if counsel confirms intermediary status); and remind users of the rules at least once a year (a yearly email — product task).

**Basis.** Intermediary status brings safe-harbour protection under s.79 for content FitBud did not author, which is valuable against the main liability risk (a trainer's harmful plan). Accepting the status therefore helps more than it costs.

**If we are wrong.** If FitBud is not an intermediary, the extra steps are harmless good practice.

**Confidence.** Medium on status; high that complying is the right default.

### P5 · Do the Consumer Protection (E-Commerce) Rules 2020 apply? (brief Q5)

**Position.** **Not during the free beta.** The Rules apply to an "e-commerce entity" operating a digital platform for the buying or selling of goods or services. FitBud sells nothing and facilitates no sale between trainer and client (payments are recorded, never transacted). **Once FitBud charges trainers through the app**, the proprietor himself sells a digital service and the Rules may apply to that sale. The identity disclosures they require (legal name, address, grievance officer, contact) are already in 01 §1 and 04 §14, so nothing further is needed then except a refund and cancellation section in the Terms.

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

## C. Further questions raised by the owner's answers

### P11 · Ownership of FitBud: employers and the former co-founder

**Position.** On the facts confirmed on 24 Nov 2026 (F2, F3), the proprietor owns FitBud outright and no employer has a credible claim. Three steps keep it that way, all at no cost:

1. **Lokesh's confirmation in writing.** A one-page assignment and waiver, signed by Lokesh, stating that he holds no ownership, share or claim in FitBud, assigning to the proprietor any rights he may have in anything he contributed, and confirming his contributions have been removed. It does not depend on his employer, because it covers only what he personally may hold; and it answers a diligence question an investor or acquirer will ask about the early commits.
2. **Current employer.** If the new employer later presents an IP, inventions or confidentiality agreement, list FitBud as **excluded prior work** in it before signing (most such agreements have a schedule for this). Until then, keep FitBud entirely off employer devices, accounts, networks and working hours, and use none of the employer's code or confidential information. Under Copyright Act s.17(c), an employer owns only work made in the course of employment under a contract of service.
3. **Previous employer.** No action needed: FitBud began after 14 Aug 2026, and the repository history supports that. Keep the repository history intact as evidence.

**Basis.** No Indian statute prohibits outside work; any restriction is contractual. Post-employment non-competes are void under Contract Act s.27, but IP assignment clauses can survive termination for work conceived during employment, which is why the start date matters.

**What counsel is asked.** Confirm the three steps; draft or review Lokesh's one-page assignment and waiver.

**Confidence.** High.

### P12 · Personal liability of the proprietor

**Position.** As a sole proprietor, Shaik Firoz Basha is personally liable, without limit, for every obligation in these documents; his personal assets stand behind them. The drafts reduce exposure by structure (FitBud authors no coaching; trainers warrant competence and indemnify; the cap and exclusions in 01 §12), but cannot create a shield. The mitigations are insurance (professional indemnity and cyber) before public launch, and incorporation at the first trigger in P1.

**Confidence.** High.

### P13 · CERT-In Directions (28 Apr 2022)

**Position.** **Assume they apply.** They bind service providers, intermediaries, data centres and **body corporate** — the same IT Act definition that brings a sole proprietorship within SPDI. They require: (a) reporting the incident types in their Annexure I to CERT-In **within 6 hours** of noticing them; (b) a named point of contact for CERT-In; (c) system clocks synchronised to NTP; and (d) **ICT system logs kept for a rolling 180 days**, retrievable for CERT-In, with a copy available within India per CERT-In's FAQ.

**The conflict this creates.** The earlier draft of 09 §5.1 proposed deleting access logs after 30 days, and Cloudflare's Workers log retention is short. **180-day log retention is a floor under the Directions, not a cap**, so 30 days likely did not comply; 09 §5.1 now says 180 days. The access logs contain no coaching data (09 §2.4), so keeping them longer is low-risk for privacy. Product task: export Workers request logs to storage kept for 180 days (for example an R2 bucket via Logpush, with a location hint for India or the nearest available region), and name a CERT-In point of contact (the same person as the grievance officer).

**What counsel is asked.** Confirm applicability to a sole proprietor running a free beta, and whether logs outside India with retrieval on demand suffice.

**Confidence.** Medium on applicability; high on what the Directions require if they apply.

### P14 · Trade mark

**Position.** "FitBud" is used as an unregistered trade mark, and no application has been filed. The documents use no ® symbol (08 §B.4, 11 §4). Before the public launch, run a phonetic search on the IP India register and file in the proprietor's name in class 9 (software), class 42 (software as a service) and any other class counsel advises; an individual applicant pays the lower official fee. The application is assigned to the company on incorporation.

**What counsel is asked.** Advise on classes and on the clearance search, since "FitBud" is a common-sounding name in the fitness field.

**Confidence.** High on the process; the clearance result is a factual check.

### P15 · Is a free closed beta "commercial activity"?

**Position.** **Assume yes.** The SPDI Rules and CERT-In Directions reach a sole proprietorship "engaged in commercial or professional activities". The beta is a pre-launch stage of a business that intends to charge. Arguing that a free beta is non-commercial might succeed, but it would be a poor reason to skip obligations that the drafts already meet at little cost.

**Confidence.** Medium on the law; high that the cautious assumption is the right one.

### P16 · Naming the proprietor

**Position.** Name the proprietor in Terms §1 and Privacy Policy §2 (identification of the counterparty and of the Data Fiduciary), and as Grievance Officer in Privacy Policy §14 (required by SPDI r.5(9), and by the 2021 Rules if P4 holds), with his address. The drafts publish his home address in Chilakaluripet, Andhra Pradesh, as given. A co-working or virtual office address would avoid publishing a home address, here and on the Google Play listing (11 §3.4); that is the proprietor's choice.

**Confidence.** High that the grievance officer must be named with contact details; medium on whether a postal address is strictly required.

---

## D. What counsel is asked to do, in order

1. **P11** — confirm the ownership steps and draft or review Lokesh's assignment and waiver.
2. **P2** — rule on sole versus joint fiduciary.
3. **P7** — confirm the consent architecture.
4. **P4, P13, P15** — confirm intermediary status, CERT-In applicability and the "commercial activity" assumption; these set the grievance and log-retention timelines.
5. **P8, P9** — set the cap figure; confirm the trainer-only indemnity.
6. **P3, P5, P6, P10, P14, P16** — confirm.
7. Read drafts 01–07 and 12 for drafting quality and Indian-law fit, and check the Apple end-user terms in 01 §19.

## E. Not for counsel — for a CA or CS

GST registration and reverse charge on imported services (Cloudflare, Apple, Google) at nil revenue; Shops and Establishments registration (Telangana, where the business is carried on, or Andhra Pradesh, where the proprietor's address is); how FitBud's expenses and any income are reported on the proprietor's own income-tax return; and what changes when fees are charged through the app stores. These do not affect the user-facing drafts.
