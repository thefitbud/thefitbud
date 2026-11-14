# Flow index

Tap coverage = every tappable on the flow's screens resolves to a screen, back, a state of the same screen, an external app, or a marked Later item. GAP = 0 everywhere.

| Flow | Role | Title | Steps | Screens | Taps (screen/state/back/ext/later/inert) | Result | Sheet |
|---|---|---|---|---|---|---|---|
| F01 | Trainee | First install: invite, intake, reminders, first Today | 5 | TR-02a, TR-03, TR-04, TR-05, TR-06a | 9/9/5/3/4/2 | PASS | `png/flows/F01.png` |
| F02 | Trainee | Sign in, wrong password, code, reset | 6 | TR-01a, TR-01e, TR-01b, TR-01c, TR-01d, TR-06a | 13/16/3/0/0/0 | PASS | `png/flows/F02.png` |
| F02b | Trainee | Auth errors: rate limit, expired code, invite expired | 5 | TR-01f, TR-01g, TR-01c, TR-02b, TR-01b | 8/11/3/1/0/0 | PASS | `png/flows/F02b.png` |
| F03 | Trainee | First workout: start, log, rest, PR, finish, summary | 12 | TR-06a, W-02, W-04, W-05a, W-05b, W-03, W-12, W-03b, W-16, W-17a, W-17b, W-01c | 61/81/11/0/0/31 | PASS | `png/flows/F03.png` |
| F04 | Trainee | Plan deviation: add set, add exercise, replace, skip, edit set, note | 10 | W-03, W-10, W-03b, W-21a, W-21b, W-09, W-22, W-08, W-13, W-09b | 69/68/12/0/0/32 | PASS | `png/flows/F04.png` |
| F05 | Trainee | Exercise detail and rest | 5 | W-03, W-27, W-26, W-05a, W-05b | 18/24/5/0/0/12 | PASS | `png/flows/F05.png` |
| F06 | Trainee | Interruptions: minimise, kill, pause, offline, discard | 7 | W-03, W-14, W-18, W-19, W-20, TR-19a, W-15 | 38/39/5/1/0/18 | PASS | `png/flows/F06.png` |
| F07 | Trainee | Diet day: as planned, changed portion, ate out | 6 | TR-07a, TR-07b, TR-08a, TR-08b, TR-08c, TR-07e | 21/38/2/0/0/5 | PASS | `png/flows/F07.png` |
| F08 | Trainee | Diet: log it myself (search, katori/roti units) | 6 | TR-08a, TR-26a, TR-26c, TR-26b, TR-07b, TR-26d | 25/23/4/0/1/7 | PASS | `png/flows/F08.png` |
| F09 | Trainee | Diet: edit, delete, planned meal, locked, late log | 7 | TR-07a, TR-07g, TR-07h, TR-07j, TR-07f, TR-06c, TR-08a | 41/45/2/0/0/9 | PASS | `png/flows/F09.png` |
| F10 | Trainee | Offline then sync | 5 | TR-06e, TR-07d, TR-19a, TR-19b, TR-07a | 26/27/1/2/0/3 | PASS | `png/flows/F10.png` |
| F11 | Trainee | Weekly check-in | 7 | TR-06a2, TR-14a, TR-14b, TR-14c, TR-14d, TR-14e, TR-14f | 17/10/5/0/0/0 | PASS | `png/flows/F11.png` |
| F12 | Trainee | Progress and weight | 6 | TR-13b, TR-13c, TR-13a, TR-13d, TR-14g, TR-13e | 14/27/3/0/1/4 | PASS | `png/flows/F12.png` |
| F13 | Trainee | Notifications and deep links (incl. nudge) | 7 | TR-15c, TR-06h, TR-15a, W-01d, TR-14g, TR-15b | 11/12/3/0/0/4 | PASS | `png/flows/F13.png` |
| F14 | Trainee | Ask Rahul (WhatsApp) | 4 | W-09, TR-18, TR-08a | 21/17/1/2/0/9 | PASS | `png/flows/F14.png` |
| F15 | Trainee | Settings, account, help, sign out | 11 | TR-20a, TR-20b, TR-16a, TR-16b, TR-25, TR-20c, TR-20g, TR-20e, TR-20f, TR-19a | 22/30/10/5/2/3 | PASS | `png/flows/F15.png` |
| F16 | Trainee | Session expiry, errors, ended coaching | 8 | TR-24, TR-01a, TR-21, TR-23, TR-07i, TR-22a, TR-22b, TR-06a | 15/22/2/0/1/0 | PASS | `png/flows/F16.png` |
| F17 | Dual role | Karan: role select, coach ↔ client switch | 8 | TM-08a, TM-01a, TM-07a, TM-08c, TR-06a, TM-08d, TM-08b | 29/29/1/3/0/0 | PASS | `png/flows/F17.png` |
| F20 | Coach | Morning triage and Nudge (push) | 8 | TM-13a, TM-01a, TM-04a, TM-04b, TM-04m, TM-04c, TM-04n, TM-04o | 25/20/10/0/0/1 | PASS | `png/flows/F20.png` |
| F21 | Coach | Mark reviewed, resolve, notes | 8 | TM-04a, TM-01c, TM-04e, TM-04d, TM-04f, TM-04j, TM-04k, TM-04g | 26/14/10/1/0/0 | PASS | `png/flows/F21.png` |
| F22 | Coach | Reply to a question | 4 | TM-13b, TM-01a, TM-10a, TM-10b | 16/18/2/1/0/0 | PASS | `png/flows/F22.png` |
| F23 | Coach | Review a check-in | 9 | TM-05a, TM-06a, TM-06f, TM-06b, TM-06c, TM-05b, TM-06d, TM-06g, TM-05e | 14/21/6/0/0/0 | PASS | `png/flows/F23.png` |
| F24 | Coach | Review a session and a diet day | 7 | TM-01a2, TM-11a, TM-04k, TM-11b, TM-04l, TM-12a, TM-12b | 28/8/7/3/0/0 | PASS | `png/flows/F24.png` |
| F25 | Coach | Clients, activity and client detail | 11 | TM-02a, TM-03a, TM-03j, TM-04b, TM-03i, TM-03f, TM-03b, TM-03c, TM-09a, TM-09d, TM-03g | 57/40/10/6/1/8 | PASS | `png/flows/F25.png` |
| F26 | Coach | Ended client and reactivation | 5 | TM-02c, TM-03d, TM-03e, TM-04i | 13/10/4/2/0/2 | PASS | `png/flows/F26.png` |
| F27 | Coach | Offline, loading, errors | 8 | TM-01e, TM-01f, TM-02f, TM-04h, TM-06e, TM-01g, TM-03h, TM-01d | 24/34/3/0/0/1 | PASS | `png/flows/F27.png` |
| F28 | Coach | Settings, in-person log, sign out | 10 | TM-07a, TM-07b, TM-07c, TM-07d, TR-20g, TM-03i, TM-15a, TM-15b, TM-07f, TR-01a | 27/27/10/4/0/0 | PASS | `png/flows/F28.png` |
