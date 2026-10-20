# MB evidence (mockups-v2)

Branch: `cursor/mb-qa-live-captures-c688`  
Visual target: `docs/spec/mockups-v2/png` @ **393×852**  
Captures: `/opt/cursor/artifacts/screenshots/*-393.png` and `docs/spec/evidence/MB/*.png`  
Rule: nothing marked MATCH/fixed without a capture compared to mockups-v2.

## Capture verdict (this pass)

| Screen | Verdict | Capture | vs mockup |
|---|---|---|---|
| TR-02 Invite | **MATCH** | `tr02-invite-393.png` | Name, mobile, locked email, Create a password, Join Rahul; no Sign out (mockup 20) |
| TR-03 Intake | **MATCH** | `tr03-intake-393.png` | Back + Saved; activity radios; day pills; sleep stepper; Yes/No (mockup 21) |
| TR-06 Today (reviewed) | **CLOSE** | `tr06-today-393.png` | Acknowledged + reply + Next check-in Fri 23 Oct (below fold until scrolled) |
| TR-10 Overview | **MATCH** | `tr10-overview-393.png` | Lower body B · 6 exercises · 18 sets · Start workout (Sat 17 Oct) |
| TR-10b Day detail | **MATCH** | `tr10b-day-393.png` | Multi-exercise list, coach note, 6/18/~28, sticky Start workout |
| TR-12 Summary | **MATCH** | `tr12-summary-393.png` | Changed from the plan, week dots, purple Done |
| TR-13 Progress | **CLOSE** | `tr13-progress-393.png` | Waist row + Front/Side/Back tiles; duplicate Progress title chrome |
| TR-15 Inbox | **CLOSE** | `tr15-inbox-393.png` | Coach note “54 min ago” (01:08 IST → Today, not Yesterday); workout + check-in + meals |
| TR-18 Ask coach | **MATCH** | `tr18-ask-393.png` | Overlay over Diet |
| TR-20 More | **MATCH** | `tr20-more-393.png` | Meal times **4 meals** |

## Behaviour (code + tests; capture where relevant)

| Item | Result |
|---|---|
| Check-in VERSION_CONFLICT / banner on step save | Serialized draft saves + conflict retry; `checkinDraftEtag.test.ts` |
| Today after review still “Waiting…” | Root cause: `status=submitted` with review payload + Sunday awaiting review. Fixed UI + seed; capture shows Acknowledged + reply + Next check-in |
| Notif “Yesterday” at 01:08 IST | `localDateInTimezone` day compare; `dates.ist.test.ts`; capture shows Today relative |
| TR-10 seed Lower body B 6/18 | Seed + startable Sat; capture proves |
| Pluralise 1 exercise / 1 set | Code path; plural forms visible on TR-10 |

## Tests

- mobile vitest: **79** passed
- api demo-seed — green  
- Re-run full suites before merge
