# QA-BT5 · Beta dress-rehearsal checklist

**Status:** checklist only. Nobody has run it.

**When:** undated. **Run in W13**, after W12 has merged and the planner has refreshed this file for the v3 screens (D-W13-3). Thu 12 Nov is struck (W4.md D-W4-13, PLAN-v2 D-P2-1 and D-P2-5). This copy is the pre-redesign checklist the W4 spec asked for. Do not treat a date in `docs/specs/BT5.md` as current; the batch file wins.

**Who runs it:** Firoz, on staging, with two phones. This document does not run the rehearsal, deploy production, or submit to a store. Those steps are W13 (D-W4-13). I6b (production deploy) starts only after this checklist passes, and only in W13.

**Where:** staging only. Staging app variant (`com.thefitbud.mobile.staging`) on 1 iPhone and 1 Android phone, installed from EAS internal distribution. Trainer web at `https://app-staging.thefitbud.com`. API at `https://api-staging.thefitbud.com`. Beta store builds use the production variant; this rehearsal does not.

Fill every **Pass/fail** cell (`pass` or `fail`) and every **Evidence** cell (photo, Sentry event link, ZeptoMail report link, or `wrangler tail` excerpt with secrets removed). A fail is a beta blocker: add a row to the blocker table. Do not continue to I6b while any required step is `fail`. Step 8 is conditional.

## Preconditions

Tick these before step 1. A missing precondition is a blocker, not a skipped step.

| # | Precondition | Pass/fail | Evidence |
|---|---|---|---|
| P1 | I6 (first staging deploy) is done. `https://app-staging.thefitbud.com` and `https://api-staging.thefitbud.com` answer. | | |
| P2 | W3 is merged and that staging deploy includes it (legal pages, push path, and the rest of W3 that staging serves). | | |
| P3 | Both phones are on the latest **staging** EAS build (internal distribution), one iOS and one Android. Note the build number on each. | | |
| P4 | Trainer account, D-W4-11. Sign in as the existing seeded staging trainer on Firoz's own Gmail address (kept out of this repo; the address is in the FitBud UI bot's rehearsal notes). Display name Rahul Verma. Two clients with Jun–Nov history. Password or email-code sign-in. The seed is maintained by the FitBud UI bot on its own computer, is not in this repo, and is not reset by QT2. Fallback, only if that account cannot sign in: `qa+trainer@thefitbud.com`. Never write a password or a code in this file or in the evidence. | | |
| P5 | Trainee accounts are placeholders Firoz creates for this run. No real person's name, phone, email, or health data. Record only a label such as "trainee A (iOS)" in the evidence. | | |

## Steps

Each step lists the action, the expected result, and where to look. Look in every place the row names before marking pass.

### 1. Trainer email code, and the signed-in smoke check

v14 step 1 is a trainer email-code sign-up (ZeptoMail arrives). PR #138 left the signed-in smoke check undone (`docs/runbooks/d1-restore.md`: "Sign-in check not done (no staging trainer account yet)"). Do both parts.

| | |
|---|---|
| **Action** | **1a.** On `https://app-staging.thefitbud.com`, sign in as the D-W4-11 trainer (password or email code). Open the client list. **1b.** With a placeholder trainer address you choose at run time (do not write it here if it is a real personal mailbox; a plus-address on a mailbox you control is enough), request an email code and complete sign-up. |
| **Expected** | **1a.** Sign-in succeeds. Home or the client list shows both seeded clients (Rahul Verma, Jun–Nov history). **1b.** The code email arrives and the new account reaches the signed-in trainer shell. The code itself is never copied into this file. |
| **Where to look** | Web. ZeptoMail report for 1b (delivery, not the code). `wrangler tail` on the staging Worker for the sign-in request (no tokens, codes, or addresses in what you paste back). |
| **Pass/fail** | |
| **Evidence** | |

### 2. Invite, install, accept, intake

| | |
|---|---|
| **Action** | From the D-W4-11 trainer (or the placeholder trainer from 1b if 1a failed and you are on the fallback), invite one placeholder trainee. On the phone that matches that trainee, install the staging build if it is not already the build from P3, open the invite, accept, and complete intake. |
| **Expected** | The trainee relationship is accepted and intake is submitted against the form version the invitation pinned. The trainer can open that submission. |
| **Where to look** | App (trainee). Web (trainer invite and review entry). |
| **Pass/fail** | |
| **Evidence** | |

### 3. Trainer reviews and publishes a plan

| | |
|---|---|
| **Action** | On the web, review the intake and publish a plan for that trainee. |
| **Expected** | A published plan version exists. The trainee app shows that plan. Editing the published version in place is not the expected path; an adjustment is a new version. |
| **Where to look** | Web. App (trainee plan). |
| **Pass/fail** | |
| **Evidence** | |

### 4. Trainee logs a meal and a workout

| | |
|---|---|
| **Action** | On the trainee phone, log one meal and one workout against the published plan. |
| **Expected** | Both logs are stored. The trainer web shows the same coaching state for that client (the same logs, not a different summary). |
| **Where to look** | App. Web (that client's log). |
| **Pass/fail** | |
| **Evidence** | |

### 5. Reminder push opens the right screen

| | |
|---|---|
| **Action** | Use a reminder that staging will actually send for this trainee (authoritative schedule, not a hand-pushed coaching payload). When the notification arrives, tap it. |
| **Expected** | One reminder push arrives on the phone. It opens the screen for that reminder. The push body is routing only: no coaching detail you would not put in a notification. |
| **Where to look** | App. `wrangler tail` for the send. Expo push acceptance is separate from the trainee having completed the item. |
| **Pass/fail** | |
| **Evidence** | |

### 6. Trainer sees the exception on Home

| | |
|---|---|
| **Action** | Leave one expected item undone so it becomes missed or overdue, then open trainer Home on the web. Do not resolve it from the app. If you later resolve it, do that only as the trainer. |
| **Expected** | Home shows that exception and keeps its source signal. A late log stays "logged late". Nothing auto-resolves and nothing auto-sends. WhatsApp, if shown, is a wa.me prefill the trainer sends. |
| **Where to look** | Web (Home). App only to confirm the trainee did not clear it. |
| **Pass/fail** | |
| **Evidence** | |

### 7. Crash test event in Sentry

| | |
|---|---|
| **Action** | After BT2 and BT2b are on this staging build, trigger one test error from the staging Worker and one test crash from the staging app. |
| **Expected** | Both events appear in Sentry (`fitbud-api` and `fitbud-mobile`, staging environment) with no name, email, note, or health data in the event. |
| **Where to look** | Sentry. App and Worker only as the trigger. `wrangler tail` must not show a DSN or an auth token. |
| **Pass/fail** | |
| **Evidence** | |

### 8. Live Activity / Android ongoing notification

**Only if Live Activity made the cut-line.** D-B7: if LA1 does not work on Firoz's iPhone by the cut-line, the beta ships without Live Activity and this step is `n/a`, not a beta blocker. The cut-line date Thu 12 Nov is struck. PLAN-v2 Q-P2-4 still recommends "before the W13 rehearsal" and is pending Firoz. LA never blocks the store-build task (BT1). If the cut-line was missed, write `n/a` and the cut-line note in Evidence, and leave it off the blocker list.

| | |
|---|---|
| **Action** | Start a workout on the iPhone and on the Android phone. From the Live Activity (iOS) or the ongoing notification (Android), log a set. |
| **Expected** | The lock-screen / ongoing notification appears. The set logged from it syncs into the workout. |
| **Where to look** | App (both phones). Web, to confirm the set is on the trainer's view of that workout. |
| **Pass/fail** | |
| **Evidence** | |

## Blockers

Any required step marked `fail` gets a row. Leave the task id blank until a task exists. Step 8 is a blocker only when Live Activity made the cut-line.

| Step | Symptom | New task ID |
|---|---|---|
| | | |

## Sign-off

Firoz, after the W13 run:

- Date (civil date, trainer timezone):
- Result: pass / fail
- I6b: start only if every required step is pass and step 8 is pass or `n/a`
- Name:
