# Fill sheet · every placeholder in the drafts

Generated 2 Nov 2026, index regenerated 3 Nov 2026 from `docs/legal/drafts/`. Regenerate after any edit.

Fill the **blocking set** first — it is five values, and it is all that stands between the drafts and a counsel review. Everything else can be answered during or after that review.

## Blocking set (fill these today)

| Value | What to put |
|---|---|
| `[[PARTNER 1 — LEGAL NAME]]` | Partner's full legal name as it appears on PAN |
| `[[PARTNER 2 — LEGAL NAME]]` | Second partner's full legal name |
| `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]` | The one operating address. Use a business address, not a home address — it is published in the Privacy Policy and may be published on a store listing |
| `[[GRIEVANCE OFFICER NAME — one of the two partners]]` | Whichever partner will actually read and answer the email |
| `[[DATE]]` | Effective date. Use the date the pages go live, not today |

A single search and replace across `docs/legal/drafts/` handles all five.

## Needs a decision from the founders

| Placeholder | Where | Note |
|---|---|---|
| `[[5,000]]` | 01 §12.3 | Nominal floor of the liability cap (draft 13 P8). Counsel to confirm the figure |
| `[[NOTICE PERIOD]]` | 01 §15.2, §16 | 30 days is conventional |
| `[[AGE]]` | 05 §4 | Age above which medical clearance is specifically urged. 40 is common in PAR-Q style screening |
| Retention periods | 09 §5.1, 04 §9 | Each `[[30]]`, `[[24]]`, `[[90]]` etc. is a proposal to accept or change. **Do not publish a period the code does not enforce** |
| `[[DATA LOCATION]]` | 04 §8, 09 §7 | From the Cloudflare dashboard: the production D1 primary region and the R2 bucket location. Fact, not a guess |

## Needs counsel

| Placeholder | Where |
|---|---|
| `[[CONFIRM: ...]]` statutory periods not fixed by any instrument | 04 §12 · 10 §3 |
| Apple minimum end-user terms | 01 §19 (moved from 07 §8) |
| Every position in draft 13 (P1–P16) | 13 |

## Full index, by file


### `00-counsel-brief.md`

- line 5: `[[PARTNER 1 — LEGAL NAME]]`
- line 5: `[[PARTNER 2 — LEGAL NAME]]`
- line 44: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 44: `[[PARTNER 1 — LEGAL NAME]]`
- line 44: `[[PARTNER 2 — LEGAL NAME]]`
- line 152: `[[PLACEHOLDER]]`
- line 188: `[[CONFIRM]]`
- line 190: `[[CAP]]`

### `01-terms-of-service.md`

- line 3: `[[DOUBLE BRACKETS]]`
- line 5: `[[DATE]]`
- line 14: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 14: `[[PARTNER 1 — LEGAL NAME]]`
- line 14: `[[PARTNER 2 — LEGAL NAME]]`
- line 126: `[[5,000]]`
- line 156: `[[NOTICE PERIOD — suggest 30 days]]`
- line 160: `[[30]]`
- line 172: `[[30]]`

### `02-trainer-terms.md`

- line 5: `[[DATE]]`

### `03-trainee-terms.md`

- line 6: `[[DATE]]`

### `04-privacy-policy.md`

- line 7: `[[DATE]]`
- line 7: `[[DATE]]`
- line 28: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 28: `[[PARTNER 1 — LEGAL NAME]]`
- line 28: `[[PARTNER 2 — LEGAL NAME]]`
- line 161: `[[DATA LOCATION — to be completed from the Cloudflare configuration before publication: the primary region of the production database and the location of the media bucket.]]`
- line 167: `[[RETENTION — insert the approved schedule from draft 09 §5, in plain language.]]`
- line 170: `[[30]]`
- line 172: `[[PERIOD]]`
- line 173: `[[CONFIRM]]`
- line 206: `[[CONFIRM: statutory period under the DPDP Rules]]`
- line 215: `[[CONFIRM]]`
- line 215: `[[30]]`
- line 231: `[[GRIEVANCE OFFICER NAME — one of the two partners]]`
- line 233: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 236: `[[24 hours]]`
- line 248: `[[BUSINESS ADDRESS]]`

### `05-health-disclaimer.md`

- line 6: `[[DATE]]`
- line 43: `[[AGE]]`

### `06-acceptable-use.md`

- line 5: `[[DATE]]`

### `07-beta-terms.md`

- line 5: `[[DATE]]`

### `08-credits-and-licences.md`

- line 7: `[[DATE]]`
- line 59: `[[TO BE COMPLETED: the open-source licences of the fonts (including Noto Sans Devanagari), icon set (Lucide), and any other third-party component whose licence requires a notice. Generate this from the dependency manifests rather than by hand.]]`

### `09-data-inventory-and-retention.md`

- line 116: `[[30]]`
- line 117: `[[30]]`
- line 119: `[[24]]`
- line 120: `[[30]]`
- line 121: `[[7]]`
- line 122: `[[24]]`
- line 123: `[[180]]`
- line 124: `[[90]]`
- line 126: `[[12]]`
- line 129: `[[CONFIRM: the Time Travel window on the plan FitBud is on]]`

### `10-rights-and-grievance-procedure.md`

- line 12: `[[GRIEVANCE OFFICER NAME — one of the two partners]]`
- line 13: `[[the other partner]]`
- line 40: `[[CONFIRM: statutory period under the DPDP Rules]]`
- line 41: `[[CONFIRM]]`
- line 42: `[[CONFIRM]]`
- line 44: `[[CONFIRM]]`
- line 50: `[[CONFIRM]]`
- line 78: `[[SCRIPT: a documented deletion runbook or script must exist; doing this by hand against production invites a half-deleted account.]]`
- line 97: `[[There is no field for this in the product today — it must be stored in the request log until one exists. Raise as a product task.]]`
- line 126: `[[GRIEVANCE OFFICER NAME — one of the two partners]]`
- line 137: `[[If in doubt, take advice before responding — the cost of a wrongful disclosure of health data is much higher than the cost of a delay.]]`
- line 156: `[[DATE]]`
- line 156: `[[REFERENCE]]`
- line 158: `[[access / correct / delete / withdraw consent]]`
- line 158: `[[and, from 13 May 2027, the Digital Personal Data Protection Act, 2023]]`
- line 158: `[[reply from the email address on your FitBud account / use the link we have sent to your registered email]]`
- line 160: `[[DATE]]`
- line 162: `[[NAME]]`
- line 166: `[[DATE]]`
- line 170: `[[PERIOD]]`
- line 172: `[[NAME]]`
- line 178: `[[plain description, with the date]]`
- line 179: `[[the categories, specifically — name this honestly, including health data if it applies]]`
- line 180: `[[realistic consequences]]`
- line 181: `[[containment and fix, with dates]]`
- line 182: `[[concrete steps, or "nothing you need to do"]]`
- line 184: `[[CERT-In / the Data Protection Board of India — whichever applies on the date]]`
- line 186: `[[NAME]]`

### `11-store-privacy-disclosures.md`

- line 62: `[[Confirm which declaration form applies and whether a non-medical-fitness categorisation is available, given FitBud makes no medical claim.]]`
- line 84: `[[DECIDE — see §3.2]]`
- line 109: `[[Prepare a reviewer demo trainer account and a pre-invited client account, and note that this is a requirement, not a nicety.]]`
- line 119: `[[VERIFY both of these in the current console documentation before the public launch; they change.]]`

### `12-in-app-notices.md`

- line 41: `[[Trainer name]]`
- line 43: `[[Trainer name]]`
- line 45: `[[Trainer name]]`
- line 49: `[[Trainer name]]`
- line 49: `[[Trainer name]]`
- line 55: `[[Coach name]]`
- line 59: `[[product task]]`
- line 77: `[[document name]]`
- line 79: `[[One or two sentences, in plain words, on what changed and why.]]`
- line 79: `[[document name]]`
- line 81: `[[document name]]`
- line 97: `[[Trainer name]]`
- line 123: `[[Trainer name]]`
- line 123: `[[Trainer name]]`
- line 133: `[[Trainer name]]`
- line 161: `[[Trainer name]]`
- line 161: `[[Trainer name]]`
