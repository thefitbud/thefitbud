# Fill sheet · every placeholder in the drafts

Generated 2 Nov 2026 from `docs/legal/drafts/`. Regenerate after any edit.

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
| `[[CAP]]` | 01 §12.3 | Liability cap. Counsel will advise; our suggestion is nil or nominal for a free beta |
| `[[NOTICE PERIOD]]` | 01 §15.2, §16 | 30 days is conventional |
| `[[AGE]]` | 05 §4 | Age above which medical clearance is specifically urged. 40 is common in PAR-Q style screening |
| Retention periods | 09 §5.1, 04 §9 | Each `[[30]]`, `[[24]]`, `[[90]]` etc. is a proposal to accept or change. **Do not publish a period the code does not enforce** |
| `[[DATA LOCATION]]` | 04 §8, 09 §7 | From the Cloudflare dashboard: the production D1 primary region and the R2 bucket location. Fact, not a guess |

## Needs counsel

| Placeholder | Where |
|---|---|
| `[[CONFIRM: ...]]` statutory timelines | 04 §12, §13, §14 · 10 §3, §6 |
| Apple third-party beneficiary wording | 07 §8 |
| Whether SPDI needs a separate policy | 00 §8 Q3 |

## Full index, by file


### `00-counsel-brief.md`

- line 5: `[[PARTNER 1 — LEGAL NAME]]`
- line 5: `[[PARTNER 2 — LEGAL NAME]]`
- line 44: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 147: `[[PLACEHOLDER]]`
- line 181: `[[CONFIRM]]`
- line 183: `[[CAP]]`

### `01-terms-of-service.md`

- line 3: `[[DOUBLE BRACKETS]]`
- line 5: `[[DATE]]`
- line 14: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 14: `[[PARTNER 1 — LEGAL NAME]]`
- line 14: `[[PARTNER 2 — LEGAL NAME]]`
- line 126: `[[CAP — see COUNSEL note]]`
- line 154: `[[NOTICE PERIOD — suggest 30 days]]`
- line 158: `[[NOTICE PERIOD]]`
- line 170: `[[30]]`

### `02-trainer-terms.md`

- line 5: `[[DATE]]`

### `03-trainee-terms.md`

- line 6: `[[DATE]]`
- line 42: `[[your trainer]]`

### `04-privacy-policy.md`

- line 7: `[[DATE]]`
- line 28: `[[BUSINESS ADDRESS, HYDERABAD, TELANGANA, PIN]]`
- line 28: `[[PARTNER 1 — LEGAL NAME]]`
- line 28: `[[PARTNER 2 — LEGAL NAME]]`
- line 149: `[[DATA LOCATION — to be completed from the Cloudflare configuration before publication: the primary region of the production database and the location of the media bucket.]]`
- line 155: `[[RETENTION — insert the approved schedule from draft 09 §5, in plain language.]]`
- line 158: `[[30]]`
- line 160: `[[PERIOD]]`
- line 161: `[[CONFIRM]]`
- line 194: `[[CONFIRM: statutory period under the DPDP Rules]]`
- line 202: `[[CONFIRM: statutory timing and content requirements]]`
- line 208: `[[GRIEVANCE OFFICER NAME — one of the two partners]]`
- line 213: `[[CONFIRM: statutory period]]`
- line 223: `[[BUSINESS ADDRESS]]`

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

- line 112: `[[30]]`
- line 115: `[[24]]`
- line 117: `[[7]]`
- line 119: `[[180]]`
- line 120: `[[90]]`
- line 122: `[[12]]`
- line 125: `[[CONFIRM: the Time Travel window on the plan FitBud is on]]`

### `10-rights-and-grievance-procedure.md`

- line 12: `[[PARTNER 1 — NAME]]`
- line 13: `[[PARTNER 2 — NAME]]`
- line 40: `[[CONFIRM: statutory period under the DPDP Rules]]`
- line 41: `[[CONFIRM]]`
- line 46: `[[CONFIRM: statutory timing]]`
- line 77: `[[SCRIPT: a documented deletion runbook or script must exist; doing this by hand against production invites a half-deleted account.]]`
- line 96: `[[There is no field for this in the product today — it must be stored in the request log until one exists. Raise as a product task.]]`
- line 125: `[[CONFIRM: timing and content]]`
- line 126: `[[CONFIRM: timing]]`
- line 135: `[[If in doubt, take advice before responding — the cost of a wrongful disclosure of health data is much higher than the cost of a delay.]]`
- line 154: `[[DATE]]`
- line 154: `[[REFERENCE]]`
- line 156: `[[access / correct / delete / withdraw consent]]`
- line 156: `[[reply from the email address on your FitBud account / use the link we have sent to your registered email]]`
- line 160: `[[NAME]]`
- line 168: `[[PERIOD]]`
- line 176: `[[plain description, with the date]]`
- line 177: `[[the categories, specifically — name this honestly, including health data if it applies]]`
- line 178: `[[realistic consequences]]`
- line 179: `[[containment and fix, with dates]]`
- line 180: `[[concrete steps, or "nothing you need to do"]]`

### `11-store-privacy-disclosures.md`

- line 55: `[[Play's deletion-request requirement is being tightened over time; confirm whether a web deletion-request form is now mandatory rather than an email route. If it is, that is a small build and must happen before BT1.]]`
- line 62: `[[Confirm which declaration form applies and whether a non-medical-fitness categorisation is available, given FitBud makes no medical claim.]]`
- line 84: `[[DECIDE — see §3.2]]`
- line 109: `[[Prepare a reviewer demo trainer account and a pre-invited client account, and note that this is a requirement, not a nicety.]]`
- line 119: `[[VERIFY both of these in the current console documentation before the public launch; they change.]]`

### `12-in-app-notices.md`

- line 39: `[[Trainer name]]`
- line 51: `[[Coach name]]`
- line 55: `[[product task]]`

## How to check you are done

```bash
grep -rn '\[\[' docs/legal/drafts/ | wc -l
```

Counsel's approved text, with no placeholders left, is then committed as `docs/legal/privacy.md`, `terms.md` and `credits.md` — which is the only text BT3 may publish.
