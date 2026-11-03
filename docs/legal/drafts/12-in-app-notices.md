# 12 · In-app notices and consent strings

> **DRAFT for founder and counsel review.** Prepared 2 Nov 2026.
> The published policies are necessary but they are not where consent happens. Consent happens on a screen, at a moment, in words a person actually reads. This document specifies those words, where each one goes, and what the server must record.
> Copy is en-IN source text, subject to the copy catalogue and `docs/spec/banned-strings.json`. Hinglish variants are indicative, not final translations.

---

## 1. What is missing today

| Gap | Evidence | Fixes |
|---|---|---|
| No recorded consent to the privacy notice | Nothing in the schema records acceptance of the privacy policy or terms | §2 |
| No 18+ confirmation anywhere | No age gate in the invitation or acceptance flow | §3, §4 |
| No acknowledgement of the health disclaimer | Not shown, not recorded | §4 |
| No "what your coach can see" screen built | Specified in TR-20 as a Privacy row; not yet built | §6 |
| No per-form notice on trainer-composed questions | Clients answer trainer-written questions with no statement of who wrote them or who sees them | §5 |
| Photograph upload has no notice | §7 |
| WhatsApp opt-in **is** specified with a recorded consent (TR-05) | Already correct — §8 records the requirement so it is not lost |

Each row below is a product task as well as a legal one. **A policy published without §2 and §4 in the app is a policy nobody consented to.**

## 2. Consent at the point of acceptance

### 2.1 Trainer registration

Three tick boxes above the primary action, none pre-ticked; the action stays disabled until all three are ticked:

> ☐ I am 18 or over, and I hold the qualifications, registrations and insurance my coaching requires. I understand FitBud does not check these.
> ☐ I agree to the **Terms of Service**, the **Trainer Terms**, the **Beta Terms** and the **Acceptable Use Policy**.
> ☐ I consent to FitBud handling my personal information as the **Privacy Policy** describes, so that I can use FitBud to coach my clients.
>
> **[ Create account ]**

Each document name is a link that opens without signing in. The first box is the warranty in Trainer Terms §2.2. The third box is the trainer's own consent: trainers are data principals too, and the Privacy Policy (§6.1) relies on consent for their data, so "I have read the Privacy Policy" is not enough. Remove "the **Beta Terms**" from the second box when the beta ends.

### 2.2 Client invitation acceptance

This is the one that matters: it is where a person consents to a trainer seeing their health information.

> **[[Trainer name]] has invited you to be coached on FitBud.**
>
> If you accept, [[Trainer name]] will be able to see **everything you enter in FitBud** — including your health information, your measurements, your workout and meal records, your check-ins and every photo you add. There's no private section. No other trainer can see any of it.
>
> [[Trainer name]] coaches you. FitBud does not — every plan and instruction you see here is written by your coach, not by us. **Please read the Health and Fitness notice before you start.**
>
> ☐ I am 18 or over.
> ☐ I agree to the **Terms of Service**, the **Trainee Terms**, the **Beta Terms** and the **Acceptable Use Policy**.
> ☐ I consent to FitBud handling my personal information — **including my health information and photos** — as the **Privacy Policy** describes, and to [[Trainer name]] seeing everything I enter, so that [[Trainer name]] can coach me.
>
> **[ Accept invitation ]**

The Health and Fitness notice is acknowledged on its own screen straight after acceptance (§4), not as a fourth box here. Agreeing to the Terms and consenting to data processing are **separate boxes on purpose**: the DPDP Act requires consent that is free, specific and unconditional, and the SPDI Rules require consent in writing before sensitive data (health information) is collected. A consent folded into "I agree to the Terms" meets neither. The data-processing consent is still required to accept — FitBud cannot coach-enable an account without processing coaching data — so the Privacy Policy (§6.2) must say plainly what withdrawing it means.

Hinglish, indicative: "[[Coach name]] ne aapko FitBud par coaching ke liye invite kiya hai." · "Aapka coach aapko coach karta hai, FitBud nahi."

### 2.3 What the server must record

For every acceptance, in a new table ([[product task]]):

| Field | Why |
|---|---|
| `user_id` | Who consented |
| `document_key` | `terms`, `trainer_terms`, `trainee_terms`, `beta_terms`, `aup`, `privacy_consent`, `health_disclaimer` — one row per document per acceptance |
| `document_version` | **The version, not a boolean.** A consent to v1.0 is not a consent to v1.1 |
| `accepted_at` | UTC |
| `surface` | `mobile_ios`, `mobile_android`, `web` |
| `consent_text_hash` | Hash of the exact text shown, so we can prove what they saw |
| `age_confirmed` | The 18+ confirmation |

This mirrors what the product already does well for the WhatsApp opt-in (TR-05: timestamp, source, text version) and for the invitation's pinned form version. Apply the same discipline here.

### 2.4 When a document changes

A material change to any document in §2.3 needs a fresh acceptance, not "continued use" (Terms of Service §16). On the user's next sign-in after the change takes effect, show a single screen before anything else:

> **We've updated our [[document name]]**
>
> [[One or two sentences, in plain words, on what changed and why.]] [ Read the updated [[document name]] ]
>
> ☐ I agree to the updated [[document name]].   *(for a privacy change: "I consent to FitBud handling my information as the updated Privacy Policy describes.")*
>
> **[ Continue ]**   [ Not now — sign out ]

Record it as a new row with the new `document_version`. A non-material change (a typo, a new contact address) needs no acceptance; under Terms §16 it takes effect when published. Who decides "material" is a founder decision, recorded in the document's change note.

> **COUNSEL:** the drafts now take positions on both earlier questions: separate tick boxes for the Terms and for data-processing consent, and fresh acceptance on material change. Please confirm or overrule (counsel positions, draft 13, P7).

## 3. The 18+ gate at invitation

Trainer-side, in the add-client flow, above the send action:

> FitBud is for adults only. By sending this invitation you confirm your client is 18 or over.

Client-side, the first tick box in §2.2. If a person does not tick it, do not accept the invitation, and show:

> FitBud is only for people aged 18 and over. Please tell [[Trainer name]].

## 4. Health and Fitness notice, on first run

Shown once, after acceptance, before the first plan is shown; reachable afterwards from Settings. Short screen, scroll to the end, one acknowledgement.

> **Before you start**
>
> Your coach decides your training and your food. FitBud shows you what they planned and records what you did — it does not give fitness, nutrition or medical advice, and it does not check whether a plan is safe for you.
>
> **Get clearance from a doctor before you start**, especially if you have a heart, lung, joint, metabolic or mental-health condition, if you are pregnant or recently gave birth, if you are recovering from surgery or an injury, or if you have been inactive for a long time.
>
> **Stop and get medical help** if you feel chest pain, severe breathlessness, dizziness, faintness or sudden pain. Nothing here obliges you to finish a set or a session. If an exercise hurts, don't do it — tell your coach.
>
> Tell your coach about any injury, condition or medication that affects your training, and tell them when something changes.
>
> In an emergency, call **112**.
>
> **[ I understand ]**

Record the acknowledgement with the document version (§2.3).

## 5. Notice on trainer-composed forms

At the top of any onboarding or check-in form, above the first question:

> These questions were written by [[Trainer name]] to coach you. Your answers go to [[Trainer name]] and to nobody else.
>
> Answer what you're comfortable with. Some answers help your coach keep your training safe. FitBud should never ask you for an Aadhaar, PAN, bank or UPI detail — if a question does, don't answer it and tell us at tech@thefitbud.com.

The last sentence is the client-side counterpart to Trainer Terms §4.4 and Acceptable Use §3.2. It is cheap, and it makes a trainer who breaks the rule visible to the only person who can report it.

## 6. "What your coach can see"

TR-20 already specifies a Privacy row in the trainee's More tab. Its content:

> **What [[Trainer name]] can see**
>
> **Everything you enter in FitBud.** There's no private section. While they are coaching you, that includes:
> - your health information — injuries, conditions, medications, allergies and dietary restrictions
> - your measurements, including height and weight
> - the workouts and meals you logged, and when you logged them — including when you logged something late
> - your check-in answers and what you told them when you joined, in your own words
> - every photo you add — progress, meal and check-in photos, and your profile picture
> - your date of birth, gender and units
> - your meal times, reminder settings and quiet hours
> - whether you've been responding to reminders
>
> They can also write notes about you, and choose to show you a note or keep it to themselves.
>
> **What nobody else can see:** all of the above. No other coach on FitBud can see anything about you. We don't advertise, we don't sell your information, and we don't read your WhatsApp messages.
>
> **When coaching ends:** the record becomes read-only. Your coach keeps a read-only view of the coaching they gave you. If you start with a different coach, they begin with nothing — none of this is passed on.
>
> **Your choices:** see your information, correct it, or delete your account — email **tech@thefitbud.com**. [ Privacy Policy ]

The line about private notes is uncomfortable and must stay: it is true (D20), and a client discovering it elsewhere is worse.

> **FOUNDER:** this screen must list exactly what the schema exposes to the trainer. When a new trainer-visible field is added, this copy and Trainee Terms §4.2 both change. Worth a checklist item in the PR template for any trainer-visible field.

## 7. Photograph upload

First time a client adds any photograph (progress, meal, check-in or profile), inline, above the picker:

> [[Trainer name]] will see every photo you add, to coach you. If [[Trainer name]] has made meal photos required, you'll be asked for one before you can log that meal as eaten — if you'd rather not, tell them and they can switch it off. They are not allowed to download, post or show it to anyone else without asking you. If that happens, tell us at tech@thefitbud.com.
>
> ☐ Don't show this again

## 8. WhatsApp opt-in — already specified, keep it

TR-05 and D11 already require an explicit opt-in with a recorded timestamp, source and text version. Keep that, and keep the copy honest while FitBud-sent WhatsApp is switched off:

> **Reminders on WhatsApp**
>
> FitBud can send your reminders on WhatsApp as well as in the app. This is off unless you turn it on, and you can turn it off whenever you like.
>
> *(While `wa_automation` is off, show the row disabled with "Coming soon" — do not collect an opt-in for something that cannot happen.)*

When a trainer or client sends a WhatsApp message from FitBud, keep the existing behaviour and make it visible:

> This opens WhatsApp with a message ready. You send it — FitBud doesn't send anything for you.

## 9. Account deletion, during the beta

In Settings, a real row rather than a hidden email address:

> **Delete my account**
>
> We're still building this into the app. For now, email **tech@thefitbud.com** and we'll delete your account and your information, and confirm when it's done.
>
> Your coach will lose the record of your coaching. If they've copied anything into their own notes, those copies are theirs — ask them directly.
>
> **[ Email us to delete my account ]** *(opens a prefilled mail to tech@thefitbud.com, subject "Delete my FitBud account")*
>
> [ What gets deleted ] *(opens `https://app.thefitbud.com/privacy#delete-account`)*

> **FOUNDER:** a hidden deletion path is a compliance risk and a store risk (draft 11 §3.3). A visible row with a prefilled email is a few hours of work and closes most of the gap until BP1 ships.

## 10. Sign-in and footer links

- Trainer web sign-in footer: Privacy · Terms · Credits and licences (BT3).
- Mobile More tab: Privacy · Terms · Credits and licences · Health and Fitness notice (BT3b).
- Every legal document must be reachable **without signing in**, on both web and mobile. A person who cannot get into their account must still be able to read what we do with their data.

## 11. Copy rules these notices must follow

From `docs/spec/01-product-rules.md` and `banned-strings.json`:

- No percentages, no scores, no streaks — none of this copy introduces any.
- Dates read like "Wed 21 Oct". No ISO dates, no raw enum values.
- Never say "verified", and never imply FitBud checked a trainer or a plan.
- No invented service promise. "We'll get back to you within a day" is the approved support line (D33) and is the only commitment of its kind.
- Touch targets at least 44 pt; web keyboard-accessible; never convey state by colour alone. These screens are consent screens — an inaccessible consent screen is not consent.

**Note on the banned-strings scan.** Running `banned-strings.json` over this document reports `snake-case`, `screen-id` and `streak` hits. Every one of them is in this document's own engineering prose — schema field names in §2.3, screen IDs such as TR-20, and the sentence in this section that forbids streaks. **None is in a copy block.** The copy blocks above are the strings to implement; the surrounding prose is not. Re-run the scan against the built screens, not against this file.
