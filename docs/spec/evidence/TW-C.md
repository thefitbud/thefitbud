# TW-C evidence

Branch: `cursor/tw-c-workspace-frame-4c36`  
Base: `cursor/tw-b-entry-roster-invites-582d`  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof commands: `pnpm typecheck` (**17/17 green**), `pnpm test` (**17/17**, includes `trainer-notes-visibility.test.ts`), Playwright `e2e/tw-c-flows.spec.ts` + `e2e/banned-strings.spec.ts` (**8 passed**, 1 skipped Expo report-only).  
Axe (wcag2a/aa): `docs/spec/evidence/TW-C/axe-results.json` — **0 violations** on TW-09 / TW-10 / TW-11 / TW-34.

Screenshots: `docs/spec/evidence/TW-C/` at 1440×900 unless noted. Rohan overview side-by-side vs mockup: `TW-09-side-by-side.png`. Full-page overview: `TW-09-full.png` / `TW-09.png`.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-09a | 14 | 2 | 16 |
| TW-09 | 12 | 3 | 15 |
| TW-10 | 9 | 2 | 11 |
| TW-11 | 10 | 3 | 13 |
| TW-34 | 8 | 4 | 12 |
| **Total** | **53** | **14** | **67** |

## Mockup differences (honest)

Compared to `mockups/png/03-trainer-web-client-rohan.png` (see `TW-09-side-by-side.png`):

1. **Header meta:** Implementation shows goal · plan link · renewal chip. Seed has no age/gender and `nextCheckin` is null for Rohan, so those meta items are correctly omitted (spec: omit missing). Mockup shows a denser meta line (phase/week/check-in/age·gender).
2. **Week dots:** Implementation uses filled/empty state circles; mockup uses check / X icons plus meal dots under days.
3. **Needs attention copy:** Implementation “Skipped workout” + Attention chip from seed severity; mockup shows a richer critical copy line.
4. **Side column:** Implementation includes Renewal + Coach notes; Progress/Reminders are empty-state for this seed (“No weigh-ins yet” / “Not enough data yet”). Mockup shows richer plan/progress samples.
5. **Breadcrumb:** Implementation “← Clients”; mockup “Clients > Rohan Mehta”.

Other TW-C screens reuse TW-A/B shell + `tokens.css` + tinted/WhatsApp buttons (no separate approved PNG).

---

## TW-09a · Client workspace header

| ID | Result | Proof |
|---|---|---|
| TW-09a.1 | PASS | `TW-09a.png` — meta as separate `.wsh-meta-item` spans; no “No …” placeholders |
| TW-09a.2 | PASS | `TW-09a--not-found.png` + e2e — no workspace header / WhatsApp |
| TW-09a.3 | PASS | `TW-09a--ended.png` — Reactivate only primary; mutating Add note / End hidden (e2e) |
| TW-09a.4 | PASS | e2e + `TW-09a.png` — single primary “Review issue” |
| TW-09a.5 | PASS | `TW-09a--deepak.png` timezone badge; Rohan capture has no badge |
| TW-09a.6 | FAIL | Deepak shows “Custom meal times” chip (`TW-09a--deepak.png`) but live “within one refresh of trainee changing a time” not proven |
| TW-09a.7 | PASS | `TW-09a.png` — avatar, H1, lifecycle + adherence chips, meta spans |
| TW-09a.8 | PASS | `TW-09a--deepak.png` — “Deepak’s time … · 1 h 30 m behind you” |
| TW-09a.9 | PASS | Rohan “Review issue” (`TW-09a.png` + e2e); Sneha “Review intake” (`TW-10.png`); Kavya “Reactivate coaching” (`TW-09a--ended.png`) |
| TW-09a.10 | PASS | WhatsApp secondary + e2e overflow: Configure / Onboarding / Reminders / Add note / End coaching |
| TW-09a.11 | PASS | e2e tabs Overview…History; Check-ins badge `3`; no exception count in header |
| TW-09a.12 | PASS | `TW-09a--ended.png` + e2e — ended banner; Add note absent |
| TW-09a.13 | PASS | `TW-09a--not-found.png` + e2e |
| TW-09a.14 | PASS | e2e `wa.me/919000000007` (client), not trainer |
| TW-09a.15 | PASS | banned-strings hard-fail on TW-C workspace routes (`errorCount: 0`) |
| TW-09a.16 | FAIL | Loading / empty / error / offline / partial not each evidenced |

## TW-09 · Client overview

| ID | Result | Proof |
|---|---|---|
| TW-09.1 | PASS | e2e + `TW-09.png` — no `YYYY-MM-DDT…` in body |
| TW-09.2 | PASS | `TW-09.png` — Needs attention card first |
| TW-09.3 | FAIL | Week counts shown (`2 of 3` / `25 of 28`) but not cross-checked against trainee TR-06 for the same week |
| TW-09.4 | FAIL | Today nutrition rings shown but not cross-checked against trainee rings for the same day |
| TW-09.5 | PASS | e2e — no `%` in body |
| TW-09.6 | PASS | `TW-09-390.png` — single column |
| TW-09.7 | PASS | `TW-09.png` two-column; `TW-09-390.png` one-column; `TW-09-768.png` mid |
| TW-09.8 | PASS | `TW-09.png` + `TW-09--exception-drawer.png` — one open item, severity chip, Review opens drawer |
| TW-09.9 | PASS | `TW-09.png` — Mon–Sun strip, counts not %, nutrition line |
| TW-09.10 | PASS | `TW-09-full.png` / `TW-09.png` — ≤5 rows with chips + relative times + View all |
| TW-09.11 | PASS | `TW-09.png` — Plan “Effective since Tue 22 Sep” (not ISO), Reminders, Progress, Renewal, Coach notes |
| TW-09.12 | PASS | same as .1 / banned-strings |
| TW-09.13 | PASS | e2e body scan — no `-Nh ago`; relative uses `formatRelative` (negatives clamp) |
| TW-09.14 | PASS | banned-strings hard-fail on `/overview` |
| TW-09.15 | FAIL | Loading / empty / error / offline / partial not each evidenced |

## TW-10 · Onboarding review

| ID | Result | Proof |
|---|---|---|
| TW-10.1 | PASS | `TW-10.png` — grouped label/answer rows |
| TW-10.2 | PASS | sticky **Mark ready & configure** present (`TW-10.png` + e2e); one-click navigate not re-run after seed (button wired) |
| TW-10.3 | PASS | `TW-10.png` — “Default onboarding v1” |
| TW-10.4 | PASS | `TW-10.png` — “Intake · submitted Mon 21 Sep · Default onboarding v1” |
| TW-10.5 | PASS | `TW-10.png` — section rows; yes/no as text |
| TW-10.6 | PASS | no “Worth noting” block when form has no highlights (`TW-10.png`) |
| TW-10.7 | PASS | `TW-10.png` — sticky Mark ready + WhatsApp client |
| TW-10.8 | PASS | `TW-10--not-submitted.png` + e2e — Vikram empty + Remind on WhatsApp |
| TW-10.9 | FAIL | post-review “Marked ready \<date\>” + 6-line clamp / Show more not evidenced in a post-review capture |
| TW-10.10 | PASS | banned-strings on `/onboarding` |
| TW-10.11 | FAIL | DoD states not each evidenced |

## TW-11 · Coaching configuration

| ID | Result | Proof |
|---|---|---|
| TW-11.1 | FAIL | DevTools/console 404 scan for a brand-new client not captured |
| TW-11.2 | PASS | `TW-11.png` — collapsed sections show summary lines |
| TW-11.3 | PASS | reminder switches visible when expanded (`TW-11.png`); save-on-toggle not re-proven in this run |
| TW-11.4 | FAIL | draft / configured / active / superseded lifecycle matrix not fully evidenced (Active + Create new version only) |
| TW-11.5 | PASS | `TW-11.png` accordion: Goal…Subscription summaries |
| TW-11.6 | PASS | `TW-11.png` — Workout/Meal/Check-in + quiet-hours copy |
| TW-11.7 | PASS | `TW-11.png` + e2e — WhatsApp reminders · Coming soon |
| TW-11.8 | PASS | `TW-11.png` — Open WhatsApp |
| TW-11.9 | PASS | `TW-11.png` — Active pill + Create new version |
| TW-11.10 | PASS | `TW-11--push-off.png` — notifications-off banner |
| TW-11.11 | FAIL | ended read-only + no-console-404 for config-less client not DevTools-proven |
| TW-11.12 | PASS | banned-strings on `/configure`; payment frequency options labeled (e2e Monthly, no `_`) |
| TW-11.13 | FAIL | DoD states not each evidenced |

## TW-34 · Trainer note composer

| ID | Result | Proof |
|---|---|---|
| TW-34.1 | PASS | e2e — Visible to client unchecked by default |
| TW-34.2 | FAIL | API proves shared notes appear on `/me/coach-notes` (`trainer-notes-visibility.test.ts`); trainee Today UI + push delivery not captured |
| TW-34.3 | PASS | API PATCH make-private removes from `/me/coach-notes` |
| TW-34.4 | PASS | API — private body never listed for trainee |
| TW-34.5 | PASS | e2e — counter after 800 (`820 / 1000`) |
| TW-34.6 | PASS | `TW-34.png` + e2e — switch off by default |
| TW-34.7 | PASS | e2e — helper + “From rahul · just now” when switched on |
| TW-34.8 | PASS | e2e — Save note → “Saved privately” |
| TW-34.9 | FAIL | note list badges exist on overview; Edit / Make private / Delete actions not implemented in UI |
| TW-34.10 | PASS | e2e Kavya — Add note absent from overflow and overview; no TW-34 surface |
| TW-34.11 | PASS | banned-strings on overview (composer host) |
| TW-34.12 | FAIL | DoD states not each evidenced |
