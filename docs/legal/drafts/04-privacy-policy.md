# 04 · FitBud Privacy Policy

> **DRAFT for counsel review — not for publication.** Prepared 2 Nov 2026.
> Facts are drawn from draft 09 (`09-data-inventory-and-retention.md`), which cites the code. **Read 09 before approving this.**
> On approval this becomes `docs/legal/privacy.md`, which BT3 publishes at `https://app.thefitbud.com/privacy`. Both app stores require that URL to be live before a build is accepted.

**Effective date:** [[DATE]] · **Version:** 1.0-draft · **Last updated:** [[DATE]]

---

## 1. In short

FitBud is a tool your personal trainer uses to coach you, or that you use to coach your clients. To do that we hold information about your coaching — including information about your body and your health.

The short version:

- **Your trainer sees your coaching information. Nobody else does.** No other trainer on FitBud can see anything about you.
- **We do not advertise, and we do not sell or share your information** with anyone except the service providers who run the software for us. They are all listed in §7.
- **We run no analytics and no trackers.** FitBud contains no advertising identifier, no tracking SDK and no analytics code. We do not record your location.
- **We do not read your messages.** When FitBud opens WhatsApp for you, you press Send. We never see the conversation.
- **Nothing is decided about you automatically.** FitBud has no scores, no percentages, no streaks and no risk ratings, and it never makes a coaching decision. Your trainer does that.
- **You can see, correct and delete your information.** Email tech@thefitbud.com.

This summary is for orientation only; the sections below govern.

## 2. Who we are

FitBud is operated by **M/s FitBud**, a partnership firm constituted under the Indian Partnership Act, 1932, with its principal place of business at [[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]. Its partners are [[PARTNER 1 — LEGAL NAME]] and [[PARTNER 2 — LEGAL NAME]].

For the purposes of the **Digital Personal Data Protection Act, 2023**, we are the **Data Fiduciary** for the personal data described here. Your trainer accesses your information as an authorised user of FitBud, bound by our Trainer Terms, and is separately responsible for any copy they keep outside FitBud.

**Contact for anything in this policy:** tech@thefitbud.com

> **COUNSEL:** this allocation is question Q2 in the brief. If trainers are independent fiduciaries, this section and §6 change.

## 3. Who this policy covers

Everyone who uses FitBud: trainers and their clients. Where something applies to only one of the two, we say so. FitBud is offered only in India and only to people aged **18 or over**; we do not knowingly hold the personal data of anyone younger, and if we discover that we have, we delete it.

## 4. What we collect

### 4.1 Information you or your trainer gives us

| What | Why we have it | Where it comes from |
|---|---|---|
| Your name | To identify you in the app to you and to your trainer | A trainer enters their own; a trainer enters their client's when inviting them |
| Your email address | Sign-in, passcodes, invitations, password resets, service notices | As above. Required |
| Your mobile number | Sign-in, and so your trainer can reach you on WhatsApp | A trainer enters their client's |
| Your password | To secure your account | You. Stored only as a one-way cryptographic hash, never in a form anyone can read |
| Date of birth, gender, preferred units | Your trainer needs them to program for you | You |
| Your meal times, reminder settings and quiet hours | To send reminders when they are useful and not when they are not | You |

### 4.2 Your coaching information — including health information

If you are a client, we hold what your coaching consists of. **Your trainer can see all of it.**

- Workouts prescribed to you and what you recorded doing, set by set, including when you recorded it and whether you recorded it late.
- Meals prescribed to you, what you recorded eating, any deviation you noted, and foods you added yourself.
- Your answers to check-ins, including anything you write in your own words.
- Body measurements you or your trainer record, with the date observed.
- **Progress photographs** you choose to upload. Uploading is always your choice and FitBud never requires it.
- The information you gave when you joined, in answer to questions **your trainer composed**. Depending on what your trainer asks, this may include injuries, medical conditions, medication, allergies or dietary restrictions.
- Notes your trainer writes about you. Your trainer can mark a note visible to you; a note they do not mark stays private to them.
- Records of what FitBud worked out from the above — for example that a required workout was missed on a particular day, and the reason it says so.
- A marker that you asked your trainer about a particular item. **Not the message**: FitBud records only that you asked, so your trainer knows to answer.

We treat all of §4.2 as **sensitive** and handle it accordingly. We do not use it for anything other than your coaching and operating FitBud for you.

### 4.3 Information we collect automatically

We have kept this list as short as the software allows, and it is short.

| What | Why | Note |
|---|---|---|
| Your time zone | Your whole day in FitBud runs on your local time — reminders, "today", logging windows | Read from your device when you sign in or accept an invitation. You can change it in settings |
| Device push token, platform and an installation identifier | To deliver push notifications to the right device | Only once you allow notifications. The installation identifier is derived from the push token; nothing is stored on your device for this |
| Whether a notification was delivered, and whether you acted on a reminder | To stop sending reminders that do not work and to avoid sending the same one twice. **Your trainer can see how you respond to reminders**, so that they can tell "didn't do it" from "didn't see it" | |
| Session records: when you signed in, when your session was last used, when it expires | Security | |
| A one-way hash of your IP address at sign-in | To block repeated sign-in attempts. **We do not store your IP address itself** | Discarded after hashing |
| Service logs: a request identifier, the method, a redacted path, the status, how long it took, and which account made the request | To run the service and investigate faults | No request bodies, no cookies, no tokens, no coaching detail |

### 4.4 What we do **not** collect

- No analytics, usage statistics, product telemetry or attribution data. There is no analytics or advertising code in FitBud.
- No advertising identifier, and no advertising or marketing profile. We do not advertise in FitBud.
- No location data, of any precision.
- No access to your contacts, calendar, photo library (other than a photograph you deliberately upload), microphone or camera feed.
- No message content, from WhatsApp or anywhere else.
- No identity numbers (Aadhaar, PAN or any other), bank details, card details or UPI identifiers. Our Trainer Terms forbid a trainer from asking you for them through FitBud. **If a trainer asks you for any of these inside FitBud, tell us at tech@thefitbud.com.**
- No biometric data.
- No step counts, activity data or anything else from Apple Health or Health Connect. See §5.

### 4.5 Payment information

Your trainer may record in FitBud what you have agreed to pay them, how often, when it is due, whether it has been paid, and whether it was cash, UPI or a bank transfer. **No money passes through FitBud.** We hold no card details, no bank details and no UPI identifier, we take no payment from anyone, and we are not part of your payment arrangement with your trainer.

## 5. Features that are built but not switched on

We would rather tell you about these now than quietly switch them on later. **None of them is active today**, and we will update this policy and tell you before any of them becomes active.

- **Step counts.** FitBud has a step-count feature, built to read your daily step count from Apple Health or Health Connect, and designed to be visible to your trainer. It is **switched off**: FitBud asks for no health permission, reads nothing, and the app shows no step count. When we switch it on, we will ask for your permission on your device first, and you can refuse.
- **FitBud-sent WhatsApp messages.** FitBud can send reminders and sign-in codes over WhatsApp. It is **switched off**, and no WhatsApp message has ever been sent by FitBud. When we switch it on, we will ask for your explicit opt-in, record it, and you can withdraw it. Today, WhatsApp works only when **you** press Send.
- **Crash reporting.** We intend to add crash and error reporting (Sentry), configured to report errors only and to strip personal information before sending. It is **not yet in the app**.

> **COUNSEL:** we have deliberately disclosed these as "built, not active" rather than describing them as current, and rather than omitting them. Please confirm this is the right approach, and confirm the wording commits us to a fresh notice and consent before activation.

## 6. Why we are allowed to hold this, and what we use it for

**6.1 Consent.** We rely on your **consent**, given when you accept an invitation to be coached or when you register as a trainer, and separately for anything we have asked you about specifically (such as a WhatsApp opt-in, or device permission for notifications). Your consent is limited to the purposes in §6.3. We ask for nothing beyond what those purposes need.

**6.2 Withdrawing it.** You can withdraw your consent at any time, by emailing tech@thefitbud.com or by changing the relevant setting in the app where one exists. Withdrawing consent for something we need in order to run your account means we can no longer coach-enable that account, and we will tell you plainly what the consequence is before it takes effect. Withdrawal does not undo what was lawfully done beforehand.

**6.3 What we use your information for, and nothing else.**

| Purpose | What it involves |
|---|---|
| Making coaching work between you and your trainer | Showing your trainer what you recorded; showing you what your trainer expects |
| Running your account | Sign-in, passcodes, password reset, keeping the account secure |
| Reminders and service notifications | Push notifications about items you have not logged; emails such as invitations and password resets |
| Working out and showing coaching state | Deriving missed, overdue and logged-late from your plan and your records, and showing the reason |
| Keeping FitBud working and secure | Diagnosing faults, preventing abuse, rate-limiting sign-in attempts, keeping backups |
| Meeting our legal obligations | Responding to lawful requests, keeping records we are required to keep |

**6.4 What we never use it for.** Advertising of any kind. Selling or renting it. Sharing it with other trainers, or with anyone not listed in §7. Training machine-learning models. Building a profile of you. Scoring, ranking or rating you. Making an automated decision about you.

## 7. Who else sees your information

**7.1 Your trainer.** For as long as your coaching relationship is active, everything in §4.2. When the relationship ends, their access becomes read-only and limited to the coaching they delivered. If you later start with a different trainer, that trainer gets **nothing** from the earlier relationship.

**7.2 Service providers who process it for us.** These companies process personal data on our instructions so that FitBud can work. They may not use it for their own purposes.

| Provider | What it does | What it handles |
|---|---|---|
| Cloudflare, Inc. | Runs the application, the database and the media storage | All of it |
| Google LLC (Firebase / Google Identity Platform) | Verifies sign-in | Email address, a federated account identifier, sign-in events |
| Expo (650 Industries, Inc.) | Delivers push notifications | Push token, and a notification payload containing only identifiers and a type — never coaching detail |
| Apple Inc. (APNs) and Google LLC (FCM) | Carry push notifications to your device | As above |
| Zoho Corporation (ZeptoMail) | Sends transactional email | Email address, name, the content of that email |
| Apple Inc. (TestFlight) and Google LLC (Play) | Distribute the beta app | Your tester email address, and the install and crash data the store itself collects |

Two providers are **configured but not in use**: Sentry (crash reporting, not yet added) and Meta Platforms (WhatsApp Cloud API, switched off). See §5.

**7.3 Nobody else.** We do not disclose your information to anyone else, except where the law requires it — a valid order, a lawful request from an authority with the power to make it, or to establish or defend a legal claim. If we are permitted to tell you about such a request, we will.

**7.4 If the business changes hands.** If FitBud is incorporated, sold or transferred, your information may transfer with it. The new operator will be bound by this policy or one no less protective, and we will tell you.

## 8. Where your information is

FitBud runs on Cloudflare's infrastructure. [[DATA LOCATION — to be completed from the Cloudflare configuration before publication: the primary region of the production database and the location of the media bucket.]] Some of our service providers are outside India, which means your information may be processed outside India.

> **ACTION before publication:** complete §8 from fact, not from assumption. See draft 09 §7. Do not publish a vague sentence here; it is exactly the kind of statement a regulator reads closely.

## 9. How long we keep it

[[RETENTION — insert the approved schedule from draft 09 §5, in plain language.]] In outline:

- We keep your account and coaching information for as long as your account is open.
- When you ask us to delete your account, we delete your personal data within [[30]] days, except anything we are required to keep by law.
- Security records such as expired sessions and sign-in passcodes are kept briefly and then deleted.
- Records of an ended coaching relationship are kept for [[PERIOD]], so that coaching with the same trainer can be resumed with its history intact.
- Backups are kept for [[CONFIRM]] days, so a deletion finishes working through our backups within that period.

> **COUNSEL:** the retention schedule is a draft proposal in 09 §5 and has not been implemented in the software yet. We recommend not publishing a period we are not yet able to honour. Two defects are identified in 09 §5.3 that would contradict this section if published today.

## 10. How we protect it

- Everything travels over an encrypted connection, and is encrypted at rest by our infrastructure provider.
- Passwords are stored only as salted, one-way hashes (PBKDF2-SHA256). Nobody at FitBud can read your password.
- Sign-in passcodes, session tokens and WhatsApp numbers used for sending are stored as hashes, not in readable form.
- Who you are and what you are allowed to see is checked **on our server** for every single request. The app cannot claim to be someone else.
- A trainer can reach only their own clients. A client can reach only their own records.
- Photographs are not accessible just by knowing where they are stored; every access is checked against who owns the record.
- Our logs are written so that they cannot contain your coaching information, your passwords, your tokens or your photographs.
- Published plan versions cannot be altered, so a historical coaching record cannot be rewritten after the fact.
- We keep backups and have rehearsed restoring from them.

No system is perfectly secure, and we do not claim to hold any security certification. If something goes wrong, see §13.

## 11. Nothing is decided about you automatically

FitBud contains no scoring, no percentages, no streaks, no adherence grade and no risk rating, by design. It works out factual states — a required workout was missed, a meal was logged late — from your plan and your own records, and it shows the reason it says so. It never resolves anything by itself: only your trainer can close an item. Every coaching judgment in FitBud is made by your trainer, a human being, not by software.

## 12. Your rights

Under the Digital Personal Data Protection Act, 2023 you have the right to:

- **know and access** what personal data we hold about you and who we have shared it with;
- **correct** it where it is inaccurate, and **complete or update** it;
- **have it erased**, where we no longer need it for the purpose you gave it for and the law does not require us to keep it;
- **withdraw your consent** at any time;
- **nominate** another person to exercise these rights on your behalf if you die or become incapacitated;
- **complain** to us, and then to the **Data Protection Board of India** if we do not resolve it.

**How to exercise them.** Email **tech@thefitbud.com**, from the address on your account where you can, telling us what you want. We may need to confirm who you are first, and we will ask for no more than we need for that. We aim to respond within [[CONFIRM: statutory period under the DPDP Rules]] and will tell you if we need longer and why.

**Account deletion during the beta.** FitBud is in closed beta, and in-app account deletion is not built yet. **To delete your account and your data, email tech@thefitbud.com** and we will do it manually and confirm when it is done. We are building this into the app.

**If your trainer has a copy.** Deleting your data from FitBud does not delete anything your trainer has copied into their own notes, spreadsheets or phone. Our Trainer Terms require them to use it only for coaching you and to keep it secure, but you may also want to ask them directly.

## 13. If something goes wrong

If personal data in our care is lost, exposed or accessed by someone who should not have it, we will investigate, do what we can to limit the harm, notify the Data Protection Board of India as required, and tell the people affected [[CONFIRM: statutory timing and content requirements]], explaining what happened, what it means for them and what we are doing.

## 14. Grievances

If you are unhappy with how we have handled your personal data, write to:

**[[GRIEVANCE OFFICER NAME — one of the two partners]]**
Partner, M/s FitBud
[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]
**tech@thefitbud.com**

We will acknowledge your grievance and respond within [[CONFIRM: statutory period]]. If we do not resolve it to your satisfaction, you may complain to the **Data Protection Board of India**.

> **ACTION (founder):** a named person must be published here. "The team" is not sufficient.

## 15. Changes to this policy

We will update this policy when what we do changes. If a change is material — a new purpose, a new category of information, a new recipient, or switching on one of the features in §5 — we will tell you by email and in the app **before** it takes effect, and where the law requires it we will ask for your consent again. The version and date at the top always tell you which policy is in force.

## 16. Contact

**tech@thefitbud.com** · [[BUSINESS ADDRESS]]

---

### Document notes (delete before publication)

- §4.3 is a complete list as of commit `1578371`. Verified absences: no analytics SDK, no advertising identifier, no location, no raw IP, no user-agent storage (draft 09 §3).
- §4.2's inclusion of private trainer notes is deliberate (D20). Saying "your trainer may keep private notes about you" is uncomfortable but true, and omitting it would make the policy inaccurate.
- §5 covers three features that exist in code but are inert: `steps_enabled` false, `wa_automation`/`wa_otp` off, Sentry not yet added (BT2).
- §9 and §12 cannot be finalised until the retention schedule (09 §5) is signed off and the two retention defects (09 §5.3) are fixed.
- §8 must be completed from the Cloudflare dashboard, not guessed.
- §12's beta deletion route reflects D-B1 (account deletion by email request during the beta; in-app deletion is post-beta task BP1).
- This policy must be re-checked against draft 09 every time the schema changes.
