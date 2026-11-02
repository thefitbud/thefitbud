# 00 · Brief for counsel

**Status:** DRAFT for review · prepared 2 Nov 2026 · not legal advice
**Prepared by:** Claude Code, from the FitBud repository at `1578371` and the owner's product decisions of 14 Oct – 2 Nov 2026
**Instructing party:** M/s FitBud (partners: [[PARTNER 1 — LEGAL NAME]], [[PARTNER 2 — LEGAL NAME]]), tech@thefitbud.com

Read this document before the others. It states what FitBud is, what it actually does with personal data, every assumption the drafts rest on, and the questions only you can answer.

---

## 1. What FitBud is

FitBud is a coaching workspace for independent personal trainers in India. A trainer sets expectations for a client — workouts, meals, check-ins — and the client executes them on a phone. FitBud shows the trainer where reality diverged from the plan.

What it is **not**, by deliberate product design:

- **Not a marketplace.** There is no trainer discovery, directory, ranking or matching. A trainer and a trainee agree to work together entirely outside FitBud; the trainer then invites the client in.
- **Not a coaching provider.** FitBud generates no plans, no recommendations, no diagnoses, no risk scores and no automated coaching decisions. Every plan and every instruction in the app was authored by a human trainer. This is enforced in the product rules, not merely intended.
- **Not a payment service.** Trainers record what a client pays them (amount, mode: Cash/UPI/Bank, due date, paid or unpaid). FitBud collects nothing, settles nothing, issues no invoices and holds no money.
- **Not a messaging service.** There is no in-app chat, voice or video. Where WhatsApp appears, the app opens WhatsApp with a message pre-filled and the **person presses Send themselves**; message content is never stored.

> **COUNSEL:** these four negatives are the backbone of the liability position in drafts 01–03. Please confirm they are framed strongly enough, and tell us if any of them create a problem we have not seen (for example, whether recording a client's payment obligations touches any payment-system or bookkeeping requirement even where no money moves).

## 2. Launch shape

| Item | Decision |
|---|---|
| Stage | Closed beta: Apple TestFlight + Google Play closed testing, approximately 20 trainers and their clients |
| Market | India only |
| Operating location | Hyderabad, Telangana |
| Legal entity | **Unregistered partnership firm of two partners** — see §3 |
| Brand | "FitBud" trademark application pending; no registration |
| Governing law | Indian law |
| Fees charged by FitBud | None, during the beta |
| Minimum age | 18, strictly, for both roles |
| Support and legal contact | tech@thefitbud.com |

## 3. The contracting party — the first thing to resolve

No company or LLP has been incorporated. **Two individuals operate the business together**, which we understand makes them a partnership firm under the Indian Partnership Act, 1932 by operation of law, whether or not a deed exists. A partnership deed is being prepared; the firm is not yet registered with the Registrar of Firms.

The drafts therefore name the firm as the contracting party:

> **M/s FitBud**, a partnership firm constituted under the Indian Partnership Act, 1932, with its principal place of business at [[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]. Its partners are [[PARTNER 1 — LEGAL NAME]] and [[PARTNER 2 — LEGAL NAME]].

The partners are named **once**, here, and once more in the Privacy Policy's grievance block. Everywhere else the party is "FitBud". This is a deliberate choice by the founders, who do not want individual names recurring through user-facing documents. Clause 01 §18.3 carries an assignment-on-incorporation clause so the agreements transfer to a company without re-signature, and provides that a change in the firm's constitution does not disturb them.

The consequences we have assumed, and ask you to confirm:

1. **Both partners are liable, jointly and severally, and without limit** for everything in these documents, including for each other's acts in the firm's business. The limitation-of-liability clauses are drafted as tightly as we believe Indian law permits, but there is no corporate shield behind them.
2. **The firm is the Data Fiduciary** under the DPDP Act, with one named partner as the grievance contact.
3. **An unregistered firm cannot sue to enforce a contract** (s.69, Partnership Act), though it can be sued. This is tolerable for a free beta and stops being tolerable once fees are charged. We recommend registering the firm.
4. **App store accounts are already purchased in the partners' personal names**, with personal email addresses, and the founders are content with that for the closed beta. We have flagged in draft 11 that a public launch on an individual account publishes an individual's name and address on the store listing, and that neither store appears to support converting an individual account into an organisation account.
5. **No fees may be charged** by FitBud until the tax and registration position is settled (GST, professional tax, Shops and Establishments as applicable in Telangana).

> **COUNSEL:** please confirm (a) that two people operating this business together are indeed a partnership firm rather than anything else, (b) that naming the partners once, as above, sufficiently identifies the counterparty in a consumer contract, (c) whether the firm's unregistered status must be disclosed to users, and (d) whether the partnership route creates any problem for the DPDP grievance obligation or for the WhatsApp Business account, which will be applied for in the firm's name. The founders' plan is to run the closed beta as a firm and to incorporate before the public launch, which they expect in approximately four months.

## 4. The DPDP allocation — the second thing to resolve

This is the one structural judgment in the set with real consequences.

**What the drafts assume:** FitBud (the proprietor) is the **sole Data Fiduciary** for all personal data in the platform, including the coaching data trainers create about their clients. Trainers are **authorised users** who access that data under the Trainer Terms, bound to purpose limitation, confidentiality and the Acceptable Use rules. Trainers are **independently responsible** for their own coaching conduct, their professional obligations, and any personal data they take out of FitBud into their own records or WhatsApp.

**Why we chose it:**

- FitBud determines the means of processing completely: the schema, where data lives, how long it is kept, who can see what, and the security measures. A trainer cannot change any of it.
- The data principals' single point of contact has to be FitBud — the trainee reaches the trainer through WhatsApp, not through a legal channel, and twenty independent personal trainers will not operate a grievance process.
- The alternatives both fail in practice at this scale: making each trainer an independent fiduciary requires a signed data-sharing annex per trainer and a notice each trainer issues himself; making FitBud a processor to each trainer requires a full DPA signed by every trainer and puts the grievance obligation on individuals who cannot discharge it.

**The weakness you should test:** trainers *do* decide what personal data is collected from their clients. Onboarding and check-in forms are trainer-configurable (`intake_definitions.schema_json`, `checkin_form_templates`), so a trainer composes the questions a client answers. That is a determination of *purpose*, which is the classic indicator of a fiduciary. Our mitigation is contractual and in-product:

- Trainer Terms §4 restricts what a trainer may ask for to information necessary for coaching, and prohibits identity numbers, financial details and data about third parties.
- Acceptable Use §3 repeats the restriction and makes a breach grounds for immediate termination.
- The in-app notice set (draft 12) tells the trainee, before they submit, that their trainer composed these questions and will see the answers.

> **COUNSEL:** please rule on this. If you conclude trainers are independent fiduciaries for trainer-authored forms, we will need (a) a data-sharing annex in the Trainer Terms, (b) notice copy that names the trainer as a fiduciary, and (c) a decision on who answers a trainee's erasure request about trainer-authored content. We would rather know now than after twenty trainers have signed up.

## 5. Health and fitness information

FitBud holds, about trainees: date of birth, gender, body measurements (weight and other measurement types), progress photographs, workout and meal execution records, free-text check-in answers and trainer-authored notes about the client. Onboarding forms are likely, in practice, to ask about injuries, medical conditions and dietary restrictions, because that is what a trainer needs to program safely.

We have treated all of it as **sensitive**, and the drafts:

- rely on **explicit, purpose-limited consent** taken at invitation acceptance, not on any broader basis;
- state plainly that the trainee's trainer can see it, and that no one else can;
- require consent to be recorded with a timestamp, the consent text version and the channel, for both the privacy notice and the separate WhatsApp opt-in;
- prohibit use for anything but coaching and operating the service — no advertising, no profiling, no sale, no model training, no sharing with other trainers.

> **COUNSEL:** we have drafted against both the DPDP Act 2023 (and the Rules as notified) and the older SPDI Rules 2011 under s.43A of the IT Act, on the assumption the latter remain relevant to "sensitive personal data or information" including physical, physiological and mental health condition, until displaced. Please confirm which instrument governs, whether a separate SPDI-style policy is still required, and whether progress photographs raise anything beyond the health-data analysis.

## 6. Compliance check

Following the format of the compliance-check workflow, applied to the closed beta launch.

**Summary: proceed with conditions.** Nothing in the product design looks unlawful. The exposure is documentary and structural — no entity, no approved policies, no retention schedule, and a deletion path that is a manual email request.

### Applicable regulation and policy

| Instrument | Relevance | Key requirements for FitBud |
|---|---|---|
| **DPDP Act 2023 + DPDP Rules 2025** | Primary. Processing digital personal data of data principals in India | Itemised notice; free, specific, informed, unconditional and unambiguous consent; purpose limitation; data-principal rights (access, correction, erasure, grievance, nomination); a published Data Protection Officer or person to answer questions; grievance redressal; breach notification to the Board and affected principals; erasure when purpose is served or consent withdrawn |
| **IT Act 2000 s.43A + SPDI Rules 2011** | Health data is "sensitive personal data or information" | Published privacy policy; consent before collection; reasonable security practices; restrictions on disclosure and transfer |
| **IT Act s.79 + Intermediary Guidelines 2021** | Possibly, to the extent FitBud hosts trainer-authored content and trainee content | If FitBud is an intermediary: publish rules, appoint a grievance officer, act on complaints within the prescribed period. **Open — see §8** |
| **Consumer Protection Act 2019 + E-Commerce Rules 2020** | Possibly. FitBud charges nothing and sells nothing, but it is a platform connecting two parties | If in scope: disclosure of the operator's identity, grievance officer, no unfair trade practice. **Open — see §8** |
| **Apple App Store Review Guidelines** (notably §1.4 physical harm, §5.1 privacy, §5.1.3 health and fitness data) | Required for TestFlight distribution | Privacy policy URL; App Privacy ("nutrition label") answers; health data may not be used for advertising or sold; apps that could cause physical harm must be accurate |
| **Google Play Developer Policy** (User Data, Health apps, Data safety) | Required for closed testing | Privacy policy URL; Data safety declaration; prominent disclosure and consent for sensitive data |
| **Meta WhatsApp Business Messaging Policy** | Only when the WhatsApp flags are switched on | Recorded opt-in before any business-initiated message; utility templates only; approved templates |
| **Creative Commons BY-SA 3.0 / 4.0** | 919 exercise drawings and wger exercise text ship inside the app | Attribution, licence notice, link to the licence, and share-alike on any adaptation of those images |
| **GST / Income tax / Telangana shops and establishments** | Dormant while no fees are charged, live the moment they are | Registration thresholds and invoicing. Out of scope for these drafts |

### Requirements status

| # | Requirement | Status | Action |
|---|---|---|---|
| 1 | Published, accurate privacy notice at a stable URL | **Not met** | Draft 04 → counsel → BT3 |
| 2 | Published terms of service | **Not met** | Drafts 01–03 → counsel → BT3 |
| 3 | Consent captured and recorded at the right moment | **Partly met** — WhatsApp opt-in is specified (TR-05) and recorded; there is no recorded consent to the privacy notice itself | Draft 12 §2 specifies it; needs a product task |
| 4 | Data principal rights channel | **Partly met** — support email exists; no documented procedure, no timelines | Draft 10 |
| 5 | Erasure on request | **Partly met** — manual email request in the beta (D-B1); in-app deletion is post-beta (BP1) | Draft 10 §4; the manual route must be stated in the notice |
| 6 | Grievance officer / DPO named publicly | **Not met** | Draft 04 §12 placeholder; the founder must name a person |
| 7 | Retention schedule | **Not met** — explicitly open (`TW-30`: "the open retention policy") | Draft 09 §5 proposes one; needs sign-off, then code |
| 8 | Processor terms with each vendor | **Unknown** | Draft 09 §4 lists them; someone must check each vendor's DPA and the India transfer position |
| 9 | Security measures documented | **Partly met** — implemented but undocumented | Draft 09 §6 |
| 10 | Breach notification procedure | **Not met** | Draft 10 §6 |
| 11 | CC BY-SA attribution visible wherever the drawings appear | **Not met in the UI** — the data carries attribution; no screen shows it yet | Draft 08; the product gap is already recorded in `docs/spec/credits-and-licences.md` |
| 12 | Store privacy disclosures accurate | **Not met** | Draft 11 |
| 13 | Age gate at 18 | **Not met in product** | Draft 03 §2 states it; needs a product task (trainer warranty at invite + trainee confirmation at acceptance) |

### Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Unregistered firm: both partners personally liable without limit, no shield, and the firm cannot sue on a contract while unregistered | **High** | Partnership deed now, firm registration when convenient, novation clause in place; incorporate before the public launch or the first rupee of revenue. Consider professional indemnity and cyber cover, which responds to the claim rather than only shielding assets |
| A trainee is injured following a trainer's plan and sues FitBud as well as the trainer | **High** | Drafts 01 §12, 02 §3, 05 in full: no coaching by FitBud, trainer warranties, medical clearance acknowledgement, assumption of risk, liability cap |
| DPDP allocation challenged — trainers held to be fiduciaries | **Medium-high** | §4 above; counsel to rule before trainers sign up |
| Health data held with no approved notice and no retention limit | **Medium-high** | Drafts 04 and 09; the retention schedule needs to become code, not only a document |
| Data location outside India not documented | **Medium** | Draft 09 §7 — Cloudflare D1 and R2 regions must be established as fact and disclosed |
| No recorded consent to the privacy notice | **Medium** | Draft 12 §2 |
| Deletion only by email: a missed request is a DPDP failure | **Medium** | Draft 10 §4 gives a logged procedure with a named owner; BP1 removes the risk |
| Share-alike obligations breached by showing drawings with no credit | **Medium** | Draft 08; no screen may ship the drawings without the credit line |
| Trainer exports client data and mishandles it outside FitBud | **Medium** | Drafts 02 §4 and 06 §3; contractual only — FitBud cannot technically prevent it |
| Trademark unregistered while the brand is used publicly | **Low-medium** | Use "FitBud" without ® anywhere; progress the application |
| A trainer asks for an identity number or financial detail through a custom form | **Low-medium** | Draft 06 §3 prohibits it; consider a server-side block on such field types |

### Recommended actions, in order

1. Fill every `[[PLACEHOLDER]]` in drafts 01–05 with the firm name, the two partners' names and the one operating address (founders, one sitting). Nothing else blocks BT3.
2. Send drafts 00, 09, 01–06 to counsel with the two rulings asked for in §3 and §4.
3. Name one partner as the grievance contact, and publish a business address rather than a home address.
4. Sign off the retention schedule in draft 09 §5, then raise the product tasks it implies.
5. Establish the Cloudflare data-location facts and write them into draft 04 and draft 11.
6. Raise the three product gaps these drafts expose: consent capture at acceptance, the 18+ age gate, and the credit line on exercise drawings.
7. Publish `/privacy`, `/terms`, `/credits` (BT3) with the approved text before submitting any store build.

### Further review recommended

- Whether FitBud is an "intermediary" for the Intermediary Guidelines, and whether the E-Commerce Rules bite on a platform that charges nothing (§8 below).
- The partnership-versus-company decision, with tax input, and the terms of the partnership deed — in particular that the FitBud brand, the codebase and all other intellectual property vest in the firm rather than in either partner individually, so that they can be assigned cleanly to the company on incorporation.
- Professional-liability exposure for a platform that hosts fitness prescriptions it does not author, and whether insurance is available and worth buying at this stage.
- The DPDP allocation in §4.

## 7. Where the drafts came from

Every factual statement about what the system does was read out of the repository, not assumed. The inventory in draft 09 cites files and line numbers. Facts established, in summary:

- The system stores **no analytics or advertising data at all**. There is no analytics or attribution SDK in the tree, no advertising identifier, no location, no contacts, no device fingerprint, and raw IP addresses are never stored (only a SHA-256 hash, for login rate limiting).
- **Step counts are not collected today.** The feature is specified and flagged off (`steps_enabled` defaults false); the endpoint returns a disabled stub and the mobile card renders nothing. The drafts describe steps in a clearly marked "not yet active" section that must not be published as current until the flag is on.
- **Crash reporting (Sentry) is decided but not built** (task BT2, week 4, errors only, with PII scrubbing). Draft 04 covers it as planned, with a note that it must not be described as live until it ships.
- **WhatsApp business messaging is fully built and switched off** behind two server flags. Only person-sent `wa.me` pre-fills work today.
- One structured access log per request records a request id, method, redacted path, status, latency and the acting user's id — no bodies, cookies, tokens or signed URLs.

## 8. Open questions for counsel

| # | Question | Why it matters | Our provisional position |
|---|---|---|---|
| Q1 | Partnership firm now with novation, or incorporate first? | Blocks the identity block in every document | Firm now, registered with the Registrar of Firms; incorporate before the public launch, expected in about four months |
| Q2 | Is FitBud the sole Data Fiduciary, with trainers as authorised users? (§4) | Changes drafts 02, 04, 10 and the notice copy | Yes, sole fiduciary |
| Q3 | Do the SPDI Rules 2011 still require a separate policy alongside the DPDP notice? | May add a document | One combined notice |
| Q4 | Is FitBud an intermediary under s.79 / the 2021 Guidelines? | Adds a grievance officer with prescribed timelines and published rules | Probably yes in part; we name a grievance officer regardless |
| Q5 | Do the Consumer Protection (E-Commerce) Rules 2020 apply where FitBud takes no payment and lists no trainers? | Adds disclosure duties | Probably not, but the identity disclosures are cheap to make anyway |
| Q6 | Statutory timelines: grievance response, erasure, breach notification to the Board and to principals | The drafts leave these as `[[CONFIRM]]` | None asserted |
| Q7 | Is consent at invitation acceptance enough for the trainer's own custom questions, or does each custom form need its own notice? | Changes the onboarding flow | One consent at acceptance plus an in-form notice |
| Q8 | Is a liability cap of `[[CAP]]` enforceable for a free service in India, and is "no liability at all for a free beta" preferable? | Drafts 01 §12 | Cap at nil-to-nominal for the beta, with the carve-outs law requires |
| Q9 | Can the Trainer Terms require a trainer to indemnify FitBud for coaching claims, and is it worth anything against an individual? | Drafts 02 §8 | Included, acknowledged as of limited practical value |
| Q10 | Anything needed before a trainee's progress photographs are stored? | Drafts 04 §4, 09 §2 | Treated as sensitive; consent at upload |

## 9. What these drafts are not

They are not legal advice. They were written by an AI agent that read the codebase, not by a lawyer. They contain no legal opinion, and where the law prescribes a number we have left a marker rather than guessed. Nothing here is fit to publish until you have reviewed it.
