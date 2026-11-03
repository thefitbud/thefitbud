# 11 · App store privacy disclosures

> **DRAFT for founder review.** Prepared 2 Nov 2026. Internal working document; the answers get typed into the store consoles by Firoz.
> Both stores require these before a testing track accepts a build, and **both treat an inaccurate declaration as a policy violation** — a wrong answer here is worse than a missing feature.

Every answer below is traced to draft 09, which is traced to the code. Where the answer depends on something not yet decided or not yet shipped, it says so.

---

## 1. Rule for both stores

**Declare what the app does today, not what it will do.** Three features exist in the code but are inert: step collection (`steps_enabled` false), FitBud-sent WhatsApp (both flags off) and crash reporting (not yet added). None of them may be declared as active. **Each must be added to the declaration in the same release that switches it on** — before, not after.

## 2. Google Play — Data safety

### 2.1 Data collected and shared

| Category | Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | Required | App functionality |
| Personal info | Email address | Yes | No | Required | App functionality; account management |
| Personal info | Phone number | Yes | No | Required | App functionality; account management |
| Personal info | User IDs | Yes | No | Required | App functionality |
| Personal info | Other info (date of birth, gender) | Yes | No | Required | App functionality |
| Health and fitness | Health info | **Yes** | No | Required | App functionality |
| Health and fitness | Fitness info | **Yes** | No | Required | App functionality |
| Photos and videos | Photos | Yes | No | **Optional** | App functionality — progress, meal, check-in and profile photos. Note: a trainer can require meal photos for their client (draft 13 F5). We still answer *Optional*, because the app is usable without photos and the client can ask the trainer to switch the requirement off; revisit if Play review disagrees |
| App activity | Other user-generated content (logs, check-in answers, notes) | Yes | No | Required | App functionality |
| App info and performance | Crash logs | **No — until BT2 ships** | No | — | — |
| App info and performance | Diagnostics | No | No | — | — |
| Device or other IDs | Device or other IDs | **Yes** — a push-notification installation identifier derived from the push token | No | Required | App functionality (notifications) |
| Location | — | No | No | — | — |
| Financial info | — | **No** | No | — | — |
| Messages | — | **No** | No | — | — |
| Contacts | — | No | No | — | — |
| Calendar | — | No | No | — | — |
| App activity | App interactions / search history | **No** | No | — | — |
| Audio | — | No | No | — | — |
| Files and docs | — | No | No | — | — |

Notes on the judgment calls:

- **"Shared" is No throughout.** Play defines sharing as transfer to a third party; a service provider processing data on the developer's behalf under contract is not sharing. Cloudflare, Google Identity, Expo, Apple/Google push and ZeptoMail are all processors (draft 09 §4). **The trainer seeing their client's data is not third-party sharing either** — it is the app's core function between two users of the app, disclosed in the app and in the policy.
- **Financial info is No** even though a trainer records what a client owes: no payment method, card, bank or UPI detail is collected, and no payment is processed (draft 09 §2.3).
- **Messages is No**: FitBud stores no message content, only a marker that a client asked about an item.
- **Health info: Yes.** Onboarding forms are trainer-composed and in practice will carry injury and condition information; measurements and check-in answers are health data. Declaring this as fitness-only would be wrong.

> **DECISION NEEDED:** whether date of birth and gender are "required" or "optional". They are collected through `PUT /me/trainee-profile` and the product does not block on them. If a client can genuinely use FitBud without providing them, declare optional. Check before answering.

### 2.2 Security practices

| Question | Answer |
|---|---|
| Is data encrypted in transit? | **Yes** — HTTPS/TLS throughout |
| Can users request data deletion? | **Yes.** Account deletion URL for the Play Console field: `https://app.thefitbud.com/privacy#delete-account` (Privacy Policy, "Deleting your FitBud account"). Resolved 3 Nov 2026: Play requires apps that allow account creation to give a **web link** where users can request account and data deletion; the request route may be an email address or a form, and an existing privacy policy qualifies if the deletion section is prominent (an anchor link) and names the app. Play's Data safety form appears to apply to closed testing tracks as well; treat the URL as required and live before BT1. No new build needed — only the anchored section in draft 04 §12, published by BT3 |
| Committed to the Play Families policy? | Not applicable — 18+ |
| Independent security review? | **No.** Do not claim one |

### 2.3 Other Play items

- **Privacy policy URL:** `https://app.thefitbud.com/privacy` — must be live before submission (BT3).
- **Health apps declaration:** FitBud will likely be caught by Play's health-app requirements. [[Confirm which declaration form applies and whether a non-medical-fitness categorisation is available, given FitBud makes no medical claim.]]
- **Content rating questionnaire:** answer honestly on health and fitness content; there is no violence, sexual content or gambling.
- **Target audience:** adults only, 18+. Do not select any child or family audience.
- **Ads:** declare **no ads**. There is no advertising code in the app.
- **Health Connect:** do **not** declare or request any Health Connect permission while `steps_enabled` is false. The app declares none today, which matches.

## 3. Apple — App Privacy ("nutrition label")

### 3.1 Data types

For each, Apple asks whether it is collected, and whether it is linked to the user, used for tracking, or used for advertising. **Tracking: No, everywhere. Advertising: No, everywhere.** There is no tracking or advertising code in FitBud, so the app should not require App Tracking Transparency at all.

| Apple data type | Collected | Linked to user | Tracking | Purposes |
|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality |
| Email Address | Yes | Yes | No | App Functionality |
| Phone Number | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Health | **Yes** | Yes | No | App Functionality |
| Fitness | **Yes** | Yes | No | App Functionality |
| Photos or Videos | Yes | Yes | No | App Functionality |
| Other User Content | Yes | Yes | No | App Functionality |
| Sensitive Info | [[DECIDE — see §3.2]] | Yes | No | App Functionality |
| Device ID | Yes | Yes | No | App Functionality (push notifications) |
| Precise/Coarse Location | No | — | — | — |
| Payment Info | **No** | — | — | — |
| Financial Info | **No** | — | — | — |
| Contacts | No | — | — | — |
| Search History, Browsing History, Product Interaction, Advertising Data, Usage Data | **No** | — | — | — |
| Crash Data, Performance Data | **No — until BT2 ships** | — | — | — |
| Other Diagnostic Data | No | — | — | — |

### 3.2 The "Sensitive Info" question

Apple's "Sensitive Info" includes data about health conditions and, in some readings, information revealing other protected characteristics. FitBud collects gender, and trainer-composed onboarding forms may ask about conditions, medication and dietary restriction (which can reveal religion, in the Indian context particularly — vegetarian and halal preferences are a routine coaching question).

**Recommendation: declare Sensitive Info as collected.** The cost of over-declaring is nil; the cost of under-declaring on health data is a rejection or a policy action.

> **COUNSEL / FOUNDER:** confirm this call. It is the only genuinely debatable answer in this document.

### 3.3 Apple review notes

Prepare these for the reviewer, because a coaching app that shows prescribed exercise invites scrutiny under Guideline 1.4.1 (physical harm) and 5.1.3 (health data):

- FitBud generates **no** plans, recommendations or advice. Every plan is authored by a human trainer the user chose outside the app. Point to the Health and Fitness Disclaimer.
- Health data is used **only** to deliver coaching between a client and their own trainer. It is **not** used for advertising or marketing, **not** shared with third parties for their own purposes, and **not** sold. (Guideline 5.1.3 prohibits exactly these.)
- The app requests **no** HealthKit permission. Step reading is built but switched off server-side.
- The app has no account-creation path for the general public: clients join by invitation. Provide a demo account for review — the reviewer cannot otherwise get past the invitation gate. [[Prepare a reviewer demo trainer account and a pre-invited client account, and note that this is a requirement, not a nicety.]]
- Account deletion: Apple requires apps that support account creation to support account **deletion** in-app. **During the beta, deletion is by email request only.** This is a known risk for App Store review (it is accepted for TestFlight, but it will block a public release). BP1 closes it.

> **FOUNDER — this is the one store item that could stop a release.** Apple's requirement for in-app account deletion applies to apps that let users create an account. FitBud's clients do create accounts, by accepting an invitation. Treat BP1 (in-app deletion) as a public-launch blocker, and be ready to explain the email route if a TestFlight review asks.

## 3.4 Account identity — a four-month decision, not a submission blocker

Both developer accounts are already purchased in the partners' personal names, with personal email addresses, and the founders accept that for the closed beta. Two consequences to hold consciously:

- **Google Play publishes a verified developer name and address on public store listings.** For an individual account that is a person's name and address. A closed test is not publicly browsable, so exposure during the beta is limited to invited testers. At public launch it is not.
- **Neither store appears to support converting an individual account into an organisation account.** The route is a new account plus an app transfer — workable, but not something to attempt during a launch week. [[VERIFY both of these in the current console documentation before the public launch; they change.]]

The public launch is expected in about four months, and the partners intend to incorporate before it. **If that holds, create the organisation accounts at incorporation and transfer the app once, calmly.** If the public launch happens on the personal accounts instead, use a registered business address rather than a home address, because it will be published.

## 4. Both stores — listing text

- Do not use "FitBud®". The trade mark is applied for, not registered. ™ is acceptable.
- Do not claim or imply medical benefit, diagnosis, treatment, cure or health monitoring.
- Do not claim trainers are verified, certified or vetted by FitBud. They are not, by decision.
- Do not state or imply an adherence score, percentage or risk rating, because the product deliberately has none — the listing must match the product.
- Be accurate that FitBud requires a trainer's invitation: the store listing should set that expectation so a consumer does not download it expecting self-service coaching.

## 5. Before submission — checklist

- [ ] `https://app.thefitbud.com/privacy` live and reachable without sign-in (BT3)
- [ ] `https://app.thefitbud.com/terms` live (BT3)
- [ ] `https://app.thefitbud.com/credits` live, and the in-app credit line present wherever exercise drawings appear (draft 08 §B.1)
- [ ] Privacy policy §8 completed with the real data locations (draft 09 §7)
- [ ] Retention periods in the published policy are ones we actually honour (draft 09 §5.3 fixed)
- [ ] Grievance contact named in the published policy (draft 04 §14)
- [ ] Play Data safety completed per §2 and matching the published policy word for word on categories
- [ ] Apple App Privacy completed per §3
- [ ] Reviewer demo accounts prepared, with a pre-invited client
- [ ] Age rating set to adults; no family or child audience selected
- [ ] "No ads" declared on both stores
- [ ] No HealthKit or Health Connect permission declared while steps are off
