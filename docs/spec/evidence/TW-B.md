# TW-B evidence

Branch: `cursor/tw-b-entry-roster-invites-582d`  
Base: `cursor/tw-a-trainer-web-shell-home-6807`  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof commands: `pnpm typecheck` (**17/17 green**), `pnpm test` (api **211**, trainer-web **22**, full monorepo **17** packages), Playwright `e2e/tw-b-flows.spec.ts` + `e2e/banned-strings.spec.ts` (**9 passed**: wrong password, OTP send/verify, trainee gate, rate-limit copy, roster search/Ended, add-client share card, pending invite wa.me, axe AA on TW-B routes, banned-strings hard-fail on TW-B routes).

Screenshots: `docs/spec/evidence/TW-B/` at 1440×900 unless noted. Sign-in side-by-side vs mockup: `TW-01-side-by-side.png`.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-01 | 14 | 7 | 21 |
| TW-02 | 4 | 7 | 11 |
| TW-06 | 12 | 3 | 15 |
| TW-07 | 8 | 5 | 13 |
| TW-08 | 5 | 5 | 10 |
| **Total** | **43** | **27** | **70** |

## Mockup differences (honest)

Compared to `mockups/png/01-trainer-web-signin.png` (see `TW-01-side-by-side.png`):

1. **Icons:** Implemented email field uses a mail icon; mockup uses a phone+mail composite. Password field lacks the mockup’s left lock icon. “For trainers” pill and “Trainer accounts only” row omit the mockup’s small icons.
2. **Needs attention glimpse:** Mockup rows include day suffixes (`(Sat)`, `- Fri`); implemented glimpse uses shorter issue text.
3. **DEV-only block:** Implemented shows **Development test identity** under the form in local DEV; absent from mockup (hidden when `import.meta.env.DEV` is false).
4. **Demo identifier:** Implemented prefills `rahul.coach@demo.fitbud.test`; mockup shows `rahul.verma@gmail.com`.
5. **Primary purple** is slightly less saturated than the mockup swatch.

Other TW-B screens have no approved PNG; they reuse TW-A shell + `tokens.css` (tinted primary, chips, Satoshi, navy rail).

---

## TW-01 · Sign in

| ID | Result | Proof |
|---|---|---|
| TW-01.1 | PASS | Playwright OTP + password login with email; mobile-digit path uses `normalizeWhatsappE164` in `SignInPage` |
| TW-01.2 | PASS | `TW-01--code.png` + e2e: WhatsApp disabled + “Coming soon”; OTP emailed (`/dev/mail`) |
| TW-01.3 | FAIL | `wa_otp` on / dual-channel not exercised in this environment |
| TW-01.4 | PASS | `TW-01--code.png` — “No SMS.”; no SMS control in UI |
| TW-01.5 | FAIL | WhatsApp budget-cap email-only path not evidenced |
| TW-01.6 | PASS | Wrong-password e2e uses generic copy; OTP start always shows “If an account exists…” |
| TW-01.7 | FAIL | API-down-while-signed-in → ErrorState not screenshotted this batch |
| TW-01.8 | FAIL | `?next=` round-trip not covered by Playwright in this pack |
| TW-01.9 | PASS | `TW-01--trainee-gate.png` + e2e `trainee-only-gate` for sneha.review |
| TW-01.10 | PASS | Test-identity UI gated by `import.meta.env.DEV` in `SignInPage` |
| TW-01.11 | PASS | `TW-01.png`, `TW-01-390.png` — split ≥1024; single column at 390 |
| TW-01.12 | PASS | `TW-01.png` — “Welcome back, coach”, identifier, password + show/hide, Sign in |
| TW-01.13 | PASS | `TW-01.png` — Forgot / code links, trainer-only note, Need help? mailto |
| TW-01.14 | PASS | e2e wrong password + `TW-01--error.png` |
| TW-01.15 | PASS | `TW-01--code.png` — Email selected, WhatsApp Coming soon + note |
| TW-01.16 | PASS | e2e OTP send/verify; masked send + 6-box input in `CodeSignInPage` |
| TW-01.17 | FAIL | `TW-01--forgot.png` shows form only; full code→new-password→signed-in not e2e’d |
| TW-01.18 | PASS | e2e + `TW-01--trainee-gate.png` |
| TW-01.19 | PASS | same as TW-01.18 |
| TW-01.20 | PASS | banned-strings hard-fail `[]` on `/sign-in`, `/sign-in/code`, `/forgot-password` |
| TW-01.21 | FAIL | Offline + error captured; loading/partial not each evidenced |

## TW-02 · Trainer first-run onboarding

| ID | Result | Proof |
|---|---|---|
| TW-02.1 | FAIL | Natural empty-profile first run not seeded; only `/welcome?capture=welcome` (`TW-02.png`) |
| TW-02.2 | FAIL | WhatsApp normalize/save not proven with a live PUT assertion this pack |
| TW-02.3 | FAIL | Timezone → renewal coupling not proven end-to-end |
| TW-02.4 | PASS | `TW-02.png` — wizard + progress bar (`role="progressbar"`) |
| TW-02.5 | PASS | `TW-02.png` — display name, +91 WhatsApp, timezone |
| TW-02.6 | PASS | `TW-02--step2.png` — bases read-only + Continue note |
| TW-02.7 | FAIL | Step 3 invite + Skip not screenshotted |
| TW-02.8 | FAIL | Finish copy / Home land not screenshotted |
| TW-02.9 | FAIL | Invalid WhatsApp inline error not e2e’d |
| TW-02.10 | PASS | banned-strings hard-fail on `/welcome` |
| TW-02.11 | FAIL | Loading/error/offline/partial not each evidenced |

## TW-06 · Client roster

| ID | Result | Proof |
|---|---|---|
| TW-06.1 | FAIL | `TW-06.png` — FilterBar wraps to multiple labelled rows at 1440 (not one row at 1280) |
| TW-06.2 | PASS | e2e URL updates for `q=rohan` and `status=ended`/`segment=ended` |
| TW-06.3 | PASS | `TW-06.png` — muted “—” for empty next check-in / renewal |
| TW-06.4 | PASS | `TW-06.png` — one action control per row |
| TW-06.5 | PASS | `TW-06-390.png` — stacked cards |
| TW-06.6 | PASS | e2e + `TW-06--ended.png` — Kavya/Nikhil only under Ended |
| TW-06.7 | PASS | `TW-06.png` — “Clients” + “N active” + Add client |
| TW-06.8 | FAIL | Same wrap as TW-06.1; pills + Clear present but not one row |
| TW-06.9 | PASS | `TW-06--ended.png` + e2e Current/Ended |
| TW-06.10 | PASS | `TW-06.png` column set + chips + plan title |
| TW-06.11 | PASS | `TW-06.png` — Review intake / Open; invited → invitation via Resend invite |
| TW-06.12 | PASS | `TW-06.png` + banned-strings — no % bars / Flagged / Bulk / Export |
| TW-06.13 | PASS | `TW-06--empty-filter.png` + `TW-06-390.png` |
| TW-06.14 | PASS | banned-strings hard-fail on `/clients` |
| TW-06.15 | FAIL | Skeleton/error/offline/empty-no-clients not each evidenced |

## TW-07 · Add client

| ID | Result | Proof |
|---|---|---|
| TW-07.1 | PASS | e2e Create invite → `invite-share-card` + Send on WhatsApp |
| TW-07.2 | FAIL | Copy link / QR not separately asserted in Playwright |
| TW-07.3 | FAIL | Duplicate pending-email path not e2e’d this pack |
| TW-07.4 | PASS | `TW-07.png` — onboarding form select + Preview |
| TW-07.5 | PASS | `TW-07.png` — name, email, +91 WhatsApp helper, form select |
| TW-07.6 | PASS | `TW-07.png` — “What happens next” stepper |
| TW-07.7 | PASS | e2e success panel “Invite ready for …” |
| TW-07.8 | PASS | e2e primary WhatsApp link visible |
| TW-07.9 | PASS | `InviteShareCard` copy includes 14-day / once note + Invite another |
| TW-07.10 | FAIL | Anita duplicate + Kavya Reactivate states not screenshotted |
| TW-07.11 | PASS | `TW-07.png` helper has no WhatsApp OTP/automation promise |
| TW-07.12 | PASS | banned-strings hard-fail on `/clients/add` |
| TW-07.13 | FAIL | Offline/duplicate/reactivate states not each evidenced |

## TW-08 · Pending invitation detail

| ID | Result | Proof |
|---|---|---|
| TW-08.1 | PASS | `TW-08.png` — “Default onboarding · v1” |
| TW-08.2 | FAIL | Re-issue invalidates old token — not proven with a dead-link check |
| TW-08.3 | FAIL | Accepted → workspace redirect not evidenced |
| TW-08.4 | PASS | `TW-08.png` — name, email, WhatsApp, Invited date, form, Invited chip |
| TW-08.5 | PASS | e2e Remind `href` matches `wa.me/919876501111`; `TW-08.png` |
| TW-08.6 | FAIL | Copy-new-link confirm (“old link will stop working”) not screenshotted |
| TW-08.7 | FAIL | Revoke overflow + “Revoked on …” not screenshotted |
| TW-08.8 | PASS | `TW-08.png` — no workspace tabs / fake client header |
| TW-08.9 | PASS | banned-strings hard-fail on Anita invitation route |
| TW-08.10 | FAIL | Loading/error/offline/revoked states not each evidenced |
