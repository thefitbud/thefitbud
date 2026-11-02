# 10 · Internal procedure: data principal requests, grievances and breaches

> **DRAFT for founder review.** Prepared 2 Nov 2026. Internal — not published.
> A privacy policy that promises rights without a procedure behind it is a liability. This is the procedure. It is written for a one-person operation, because that is what FitBud is today.

---

## 1. Who does this

| Role | Who | Responsibility |
|---|---|---|
| Data Protection / Grievance contact | [[PARTNER 1 — NAME]] | Receives, decides and answers everything in this document. Named publicly in the Privacy Policy |
| Deputy, for absence | [[PARTNER 2 — NAME]] | Acts when the contact is unreachable for more than two working days |

**1.1** Two partners means the deputy slot can be filled properly, which removes the worst operational risk here: a statutory clock runs whether or not anyone is reading email. Both partners have access to `tech@thefitbud.com`, it is checked every working day, and anything in this document is flagged the day it arrives rather than the week it arrives. Agree between you which partner holds this and write it into the partnership deed, so it is not renegotiated during an incident.

## 2. The request log

Every request, grievance and incident gets a row. One file, kept outside the product database.

| Field | Note |
|---|---|
| Reference | `DSR-2026-001`, `GRV-2026-001`, `INC-2026-001` |
| Received | Date and time |
| Channel | Email, in-app, via trainer, other |
| Requester | Name, account email, role |
| Type | Access · Correction · Erasure · Consent withdrawal · Nomination · Grievance · Breach |
| Identity verified | How, and when |
| Due | See §3 |
| Action taken | What was done, by whom, with dates |
| Closed | Date, and what the requester was told |
| Evidence | Where the proof is kept |

**Keep this log.** If a regulator ever asks whether FitBud honours data principal rights, the log is the answer. No log, no answer.

## 3. Timelines

| Request | Acknowledge | Complete |
|---|---|---|
| Access | Within 3 working days | [[CONFIRM: statutory period under the DPDP Rules]] |
| Correction | Within 3 working days | [[CONFIRM]] |
| Erasure / account deletion | Within 3 working days | [[CONFIRM]], and in any event within 30 days |
| Consent withdrawal | Same working day where possible | Effective immediately; confirm in writing |
| Nomination | Within 3 working days | [[CONFIRM]] |
| Grievance | Within 3 working days | [[CONFIRM]] |
| Breach notification to the Data Protection Board | — | [[CONFIRM: statutory timing]] |
| Breach notification to affected people | — | [[CONFIRM]] |

> **COUNSEL:** please fill every `[[CONFIRM]]` from the DPDP Rules as notified. The internal acknowledgement targets are our own, set tighter than any statutory period on purpose.

## 4. Handling each request type

### 4.1 Verify identity first, proportionately

Accept a request sent from the email address on the account as sufficient for most purposes. For erasure, or where the request comes from another address, send a confirmation link or code to the account's registered email or mobile and require the reply. **Do not demand identity documents.** Asking for an Aadhaar or a PAN to prove identity would collect more sensitive data than the request itself concerns.

If you cannot verify, say so, say what would satisfy you, and keep the request open.

### 4.2 Access

Give the person what we hold about them, in a form they can read. Draft 09 §2 is the map of where it is. Include: identity and account data, coaching content, device and notification records, consent records, and who it has been disclosed to (their trainer, and the processors in draft 09 §4).

Do not include another person's personal data. A trainer's private notes about a client **are the client's personal data** and in our view must be disclosed to the client on an access request, even though the product deliberately keeps them hidden in the UI.

> **COUNSEL:** please confirm the position on private trainer notes. It is the one place where the product's design and a data principal's access right pull in opposite directions, and trainers will be surprised by the answer.

### 4.3 Correction

Correct account and profile fields directly. For coaching records, the general rule is that **a historical observation is not corrected, it is supplemented** — published plan versions are immutable by design and a coaching record is a record of what happened. If a client says a record is wrong, note the correction against it rather than rewriting history, and tell the client that is what you have done and why.

### 4.4 Erasure and account deletion

In-app deletion does not exist during the beta (D-B1; it is post-beta task BP1), so this is manual. Steps:

1. Verify identity (§4.1).
2. Tell the requester what will happen, including that their trainer loses the coaching history and that any copy their trainer keeps outside FitBud is beyond our reach.
3. Delete, in this order: media objects from R2, then the D1 records that reference them, then coaching records, then the relationship, then identity and account rows. [[SCRIPT: a documented deletion runbook or script must exist; doing this by hand against production invites a half-deleted account.]]
4. Revoke sessions and device tokens; remove the person from any pending reminder or job.
5. Check the places that are easy to miss: `idempotency_records` and `sync_mutations` (which hold full response bodies — see draft 09 §5.3), the WhatsApp ledger, notification records, and any export you produced for an earlier access request.
6. Note that backups still contain the data until the backup window passes, and tell the requester that, honestly, with the window.
7. Confirm completion in writing. Log it.

**Do not delete the other party's data.** Deleting a client's account must not remove the trainer's own account or another client's records.

### 4.5 Consent withdrawal

| Withdrawn | Effect |
|---|---|
| WhatsApp opt-in | Stop all FitBud-sent WhatsApp immediately; record the opt-out; reminders fall back to push and email |
| Push notifications | Device-level, handled by the OS; also set the preference server-side |
| Health/steps permission (when active) | Device-level; stop reading, and stop showing the trainer a stale figure |
| Consent to processing generally | This cannot be partially honoured — it ends the account. Explain that plainly, offer deletion, and do not let an ambiguous "stop using my data" sit unanswered |

### 4.6 Nomination

Record the nominee's name and contact against the account. [[There is no field for this in the product today — it must be stored in the request log until one exists. Raise as a product task.]]

## 5. Grievances

1. Acknowledge within 3 working days, by email, with a reference.
2. Investigate: what happened, what the records show, what the product actually does.
3. Answer in writing: the finding, the reason, what you will do, and the person's right to complain to the **Data Protection Board of India** if they are not satisfied.
4. Log it, and log what you changed as a result.

**If a grievance is about a trainer** — a trainer published a client's photograph, or asked for an Aadhaar number, or shared information:

- Do not tell the trainer who complained without asking the complainant first (Acceptable Use §6).
- Investigate against the Trainer Terms §4 and the Acceptable Use Policy §3.
- Act: remove the offending form or question, suspend or close the account, and tell the complainant what you did.
- Consider whether it is itself a reportable personal data breach (§6).

## 6. Personal data breach

**6.1 What counts.** Any loss, unauthorised access, unauthorised disclosure or destruction of personal data: a trainer's account taken over, an authorisation defect exposing one client's data to another trainer, a leaked credential, a lost laptop with exported client data, a processor's own breach.

**6.2 In the first 24 hours**

1. **Contain.** Revoke the sessions and tokens involved; rotate the secret; disable the route or feature if needed.
2. **Record.** Open an `INC-` row: what you know, when you learned it, how.
3. **Assess.** Whose data, which categories (health data materially raises severity), how many people, what the likely harm is, whether it is still ongoing.
4. **Preserve evidence.** Logs, the diff, the request ids. Do not clean up before you have captured what happened.

**6.3 Notify**

- **Data Protection Board of India:** [[CONFIRM: timing and content]]. Do not wait for a complete picture if the clock is short — report what is known and supplement it.
- **The people affected:** [[CONFIRM: timing]]. Plain language: what happened, what data, what it means for them, what we have done, what they should do.
- **A processor's breach** is still ours to report to the people affected.
- Tell the affected **trainers** where their clients are involved, so they are not blindsided by their own clients.

**6.4 Afterwards.** Write down the root cause and the fix, in the repository where the defect was. For an authorisation or data defect, add the mutation-checked test that would have caught it — this is already the project's standard for auth, data and security changes.

## 7. Lawful requests from authorities

1. Do not disclose anything on an informal request. Require it in writing, identifying the authority, the officer, the legal power relied on and the data sought.
2. Verify it is genuine. [[If in doubt, take advice before responding — the cost of a wrongful disclosure of health data is much higher than the cost of a delay.]]
3. Disclose the minimum the request actually compels.
4. Log it, and tell the person affected unless the law forbids it.

## 8. What to review, and when

| Review | Frequency | Looking for |
|---|---|---|
| Request log | Monthly | Anything open past its due date |
| Draft 09 inventory against the schema | Every release that changes the schema | New personal data not in the inventory or the notice |
| Retention: are the periods actually enforced in code? | Quarterly | The gap between the policy and reality (draft 09 §5.3) |
| Processor list | Quarterly, and whenever a provider is added | A live processor with no agreement; a planned one that went live without the notice being updated |
| Consent records | Quarterly | Consents recorded against a superseded text version |
| Published policy against practice | Quarterly | Anything in the notice that is no longer true |

## 9. Templates

### 9.1 Acknowledgement

> Thank you for your message of [[DATE]]. We have recorded your request as [[REFERENCE]].
>
> We treat this as a request to [[access / correct / delete / withdraw consent]] under the Digital Personal Data Protection Act, 2023. To confirm it came from you, please [[reply from the email address on your FitBud account / use the link we have sent to your registered email]].
>
> We expect to complete this by [[DATE]]. If it will take longer, we will tell you before then and explain why.
>
> [[NAME]], FitBud · tech@thefitbud.com

### 9.2 Deletion completed

> Your FitBud account and the personal data we held about you have been deleted, on [[DATE]], as you asked.
>
> This included your account details, your coaching records, your check-in answers, your measurements and any photographs you had uploaded. Your trainer no longer has access to any of it in FitBud.
>
> Two things you should know. Our backups still contain copies for up to [[PERIOD]], after which they are overwritten; we cannot reach into a backup to remove a single account, and nothing in a backup is used except to restore the service after a failure. And if your trainer copied any of your information into their own notes or phone, those copies are theirs — they are required to keep them confidential and use them only for coaching, but you may want to ask them directly.
>
> [[NAME]], FitBud · tech@thefitbud.com

### 9.3 Breach notice to an affected person

> We are writing to tell you about a problem affecting your personal data in FitBud.
>
> **What happened:** [[plain description, with the date]]
> **What was involved:** [[the categories, specifically — name this honestly, including health data if it applies]]
> **What it means for you:** [[realistic consequences]]
> **What we have done:** [[containment and fix, with dates]]
> **What we suggest you do:** [[concrete steps, or "nothing you need to do"]]
>
> We have reported this to the Data Protection Board of India. If you have questions, write to tech@thefitbud.com. We are sorry.
>
> [[NAME]], FitBud

---

### Document notes

- §4.4 reflects D-B1 (deletion by email during the beta) and names the two tables that are easy to miss (draft 09 §5.3).
- §4.2's position on private trainer notes (D20) is flagged for counsel because it cuts against the product design.
- §4.6 records a genuine product gap: the DPDP nomination right has no field anywhere in the schema.
- §6.4 aligns with the project's existing rule that fixes to auth, data and security defects get mutation-checked tests.
