# 06 · Acceptable Use Policy

> **DRAFT for counsel review — not for publication.** Prepared 2 Nov 2026.

**Effective date:** [[DATE]] · **Version:** 1.0-draft

This policy forms part of the FitBud Terms of Service and applies to everyone. Breaking it can get your account suspended or closed, and in serious cases reported to the authorities.

---

## 1. The principle

FitBud exists so that one trainer can coach one client well. Use it for that. Do not use it to harm, deceive, exploit or intrude on anyone — above all not on a client who has trusted you with information about their body.

## 2. Nobody may

**2.1 Harm or harass.** Threaten, abuse, harass, stalk, bully, demean or intimidate anyone. Send anyone sexual content, or content that is hateful or degrading on the basis of religion, caste, sex, gender, sexual orientation, disability, origin or any similar ground.

**2.2 Deceive.** Impersonate anyone, including a trainer, a client or FitBud. Claim a qualification, certification or affiliation you do not hold. Claim that FitBud has verified, approved or endorsed you, your plans or your results.

**2.3 Break the law.** Use FitBud for anything unlawful, including promoting or supplying a banned substance, a prescription medicine without authority, or an unapproved weight-loss product.

**2.4 Give dangerous instructions.** Prescribe or encourage anything likely to cause serious harm — including extreme caloric restriction, dangerous dehydration, performance-enhancing or prohibited substances, or training through an injury against medical advice. Do not use FitBud to support or encourage disordered eating.

**2.5 Practise outside your competence.** Diagnose a medical condition, treat one, interpret a medical test, or tell someone to stop or change a prescribed medication or treatment. That is medical practice, and unless you are qualified and registered to do it, it is not yours to do.

**2.6 Misuse other people's accounts or data.** Access an account that is not yours. Ask for someone's password. Record logs or answers in a client's account as if you were them. Try to reach data about a client who is not yours, or a trainer who is not you.

**2.7 Interfere with the service.** Probe, scan, overload, disrupt or circumvent FitBud's security or limits; scrape it; automate access in a way that imposes an unreasonable load; reverse-engineer or copy the software. Reporting a security flaw to tech@thefitbud.com is welcome and is not a breach.

**2.8 Upload anything harmful.** Malware, or content that infringes someone's copyright, trade mark or other rights.

**2.9 Use it as something it is not.** FitBud is not a medical record system, not an emergency service, not a payment service and not a general messaging app. Do not rely on it as any of those.

## 3. Additional rules for trainers

These exist because trainers hold other people's health information.

**3.1 Ask only for what coaching needs.** You compose your own onboarding and check-in questions. Ask for what you genuinely need to coach that client safely, and no more. Curiosity is not a purpose.

**3.2 Never ask, through FitBud, for:**

- an identity number of any kind — Aadhaar, PAN, passport, driving licence, voter ID, or any other;
- a bank account number, card number, UPI identifier, or any payment credential or password;
- personal data about anyone who is not your client — a spouse, a child, a relative, a friend;
- a medical record, diagnosis or test result that the coaching does not genuinely require.

Do not use a free-text question to get around this. We may remove a question or a form that breaks this rule and may suspend the account that created it.

**3.3 Use client information only to coach that client.** Not for marketing, not for a mailing list, not for research, not for a case study, not to build a product, and not for anything else. Do not share it with another trainer, a gym, a supplement seller or anyone else.

**3.4 Progress photographs.** You may view a client's photographs to coach them. You may not download, copy, forward, publish, post, print or show them to anyone without that client's specific written permission for that specific use. Permission to coach is not permission to publish. This applies to social media, advertising, testimonials, "before and after" posts and WhatsApp groups.

**3.5 Keep it confidential.** Do not discuss a client's health, body, measurements, eating or coaching with anyone else without their permission, unless the law requires it. That includes other clients and other trainers.

**3.6 Keep your own copies safe.** Anything you copy out of FitBud is yours to protect and yours to delete when it is no longer needed.

**3.7 Messages you send.** When FitBud opens WhatsApp with text prepared for you, what you send is yours. Do not use it to market to people who have not asked to hear from you, to contact someone who has told you to stop, or to send anything this policy prohibits.

**3.8 Only invite people who agreed to it.** Do not invite someone who has not agreed to be coached by you and to use FitBud. Do not invite anyone under 18.

**3.9 Do not pretend FitBud coaches.** Do not tell a client that a plan came from FitBud, that FitBud approved it, or that FitBud is monitoring their health. None of that is true.

## 4. Additional rules for clients

**4.1 Be honest about your health.** Your trainer's plans rest on what you tell them. Withholding or misstating something about your health puts you at risk, not us.

**4.2 Your account is yours.** Do not share it, and do not let your trainer log in as you.

**4.3 Do not upload other people's information.** A photograph should be of you. Do not upload documents about anyone else.

## 5. How we enforce this

**5.1** We can investigate a suspected breach and, depending on what we find, warn you, remove content, remove a form or a question, restrict a feature, suspend your account or close it.

**5.2** We act immediately, without warning, where someone's safety or someone's personal data is at risk — in particular a breach of §2.4, §2.6, §3.2, §3.4 or §3.8.

**5.3** Where we can, we tell you what we found and why we acted, and where the breach can be put right we give you the chance to put it right.

**5.4** We report to the authorities where the law requires it, or where we believe someone is in danger.

## 6. Telling us about a problem

Email **tech@thefitbud.com**. Tell us what happened, who was involved and when. If you are a client reporting your own trainer, say so — we will not pass your report to them, and we will not tell them it was you without asking you first.

If someone is in immediate danger, call **112** before you email us.

---

### Document notes (delete before publication)

- §3.2 is the contractual counterpart to a technical gap: onboarding and check-in forms are trainer-configurable (`intake_definitions.schema_json`, `checkin_form_templates`, `onboarding_form_templates`), so a trainer can compose any question they like. A server-side restriction on field names and types would make this enforceable rather than only promised. Recommended as a product task.
- §3.4 has no technical enforcement either: a trainer viewing a photograph can screenshot it. The rule is worth stating regardless, and the Privacy Policy tells clients to report a trainer who breaks it.
- §6's commitment not to identify a reporting client to their trainer needs an operational procedure behind it (draft 10).
