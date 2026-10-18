# TW-B evidence

Branch: `cursor/tw-b-entry-roster-invites-582d`  
Base: `cursor/tw-a-trainer-web-shell-home-6807` (merged, including FitText)  
Stack: `pnpm db:reset` → API `:8787` + trainer-web `:5173` · Node 22.23.3  
Proof commands: `pnpm typecheck` (**17/17 green**), `pnpm test`, Playwright `e2e/tw-b-flows.spec.ts` + `e2e/banned-strings.spec.ts` (**17 passed**, 1 skipped Expo report-only).

Screenshots: `docs/spec/evidence/TW-B/` at 1440×900 unless noted. Sign-in side-by-side vs mockup: `TW-01-side-by-side.png`.

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-01 | 20 | 1 | 21 |
| TW-02 | 9 | 2 | 11 |
| TW-06 | 14 | 1 | 15 |
| TW-07 | 12 | 1 | 13 |
| TW-08 | 9 | 1 | 10 |
| **Total** | **64** | **6** | **70** |

## Mockup differences (honest)

Compared to `mockups/png/01-trainer-web-signin.png` (see `TW-01-side-by-side.png`):

1. **Icons:** Lock on password, Info on trainer-only note, Users on “For trainers”; email still uses Mail (mockup phone+mail composite not pixel-matched).
2. **Glimpse:** Matches mockup day suffixes (`Breakfast not logged (Sat)`, `Check-in submitted - Fri`).
3. **DEV hints:** Test-identity block + demo email prefill only when `import.meta.env.DEV && VITE_SHOW_DEV_HINTS=1` (hidden in default local/e2e).
4. **Indigo:** Primary uses `#4527C6` (mockup swatch).

Other TW-B screens have no approved PNG; they reuse TW-A shell + `tokens.css`.

---

## TW-01 · Sign in

| ID | Result | Proof |
|---|---|---|
| TW-01.1 | PASS | Playwright password + OTP email login |
| TW-01.2 | PASS | `TW-01--code.png` + e2e: WhatsApp disabled + “Coming soon”; OTP via `/dev/mail` |
| TW-01.3 | PASS | `wa_otp` off by flag → Coming soon disabled is decision-10 behaviour; e2e asserts chip + note |
| TW-01.4 | PASS | `TW-01--code.png` — “No SMS.”; no SMS control |
| TW-01.5 | PASS | Same as .3 when `wa_otp` off (email-only path is the shipped behaviour) |
| TW-01.6 | PASS | Wrong-password e2e generic copy; OTP start “If an account exists…” |
| TW-01.7 | PASS | e2e abort `/me` → ErrorState; `TW-01--api-down.png` |
| TW-01.8 | PASS | e2e `?next=` round-trip to `/clients?q=rohan`; `TW-01--next.png` |
| TW-01.9 | PASS | `TW-01--trainee-gate.png` + e2e for sneha.review |
| TW-01.10 | PASS | DEV hints gated by `VITE_SHOW_DEV_HINTS=1`; e2e asserts hidden by default |
| TW-01.11 | PASS | `TW-01.png`, `TW-01-390.png` |
| TW-01.12 | PASS | `TW-01.png` — Welcome back, identifier, password + show/hide, Sign in |
| TW-01.13 | PASS | `TW-01.png` — Forgot / code links, trainer-only note, Need help? |
| TW-01.14 | PASS | e2e + `TW-01--error.png` |
| TW-01.15 | PASS | `TW-01--code.png` — Email selected, WhatsApp Coming soon |
| TW-01.16 | PASS | e2e OTP send/verify |
| TW-01.17 | PASS | e2e forgot: code → new password → signed in to `/clients` |
| TW-01.18 | PASS | e2e + `TW-01--trainee-gate.png` |
| TW-01.19 | PASS | same as TW-01.18 |
| TW-01.20 | PASS | banned-strings hard-fail on auth routes |
| TW-01.21 | FAIL | Offline + error + API-down captured; loading/partial not each evidenced |

## TW-02 · Trainer first-run onboarding

| ID | Result | Proof |
|---|---|---|
| TW-02.1 | PASS | Seeded `nova.coach` empty profile; e2e natural `/welcome`; `TW-02--first-run.png` |
| TW-02.2 | PASS | e2e welcome saves +91 WhatsApp and continues past step 1 |
| TW-02.3 | FAIL | Timezone → renewal coupling not proven end-to-end |
| TW-02.4 | PASS | `TW-02.png` — wizard + progressbar |
| TW-02.5 | PASS | `TW-02.png` / first-run — display name, +91, timezone |
| TW-02.6 | PASS | `TW-02--step2.png` |
| TW-02.7 | PASS | `TW-02--step3.png` + e2e Skip for now |
| TW-02.8 | PASS | `TW-02--finish.png` + e2e Go to home |
| TW-02.9 | PASS | e2e invalid WhatsApp inline alert on `/welcome?capture=welcome` |
| TW-02.10 | PASS | banned-strings hard-fail on `/welcome` |
| TW-02.11 | FAIL | Loading/error/offline/partial not each evidenced |

## TW-06 · Client roster

| ID | Result | Proof |
|---|---|---|
| TW-06.1 | PASS | e2e FilterBar pill-group Y-spread ≤8px at 1440; CSS `nowrap` + `overflow-x: auto` |
| TW-06.2 | PASS | e2e URL updates for `q=` and Ended segment |
| TW-06.3 | PASS | `TW-06.png` — muted “—” |
| TW-06.4 | PASS | `TW-06.png` — one action per row |
| TW-06.5 | PASS | `TW-06-390.png` — stacked cards |
| TW-06.6 | PASS | e2e + `TW-06--ended.png` |
| TW-06.7 | PASS | `TW-06.png` — Clients + count + Add client |
| TW-06.8 | PASS | Same one-row FilterBar proof as TW-06.1 |
| TW-06.9 | PASS | Current/Ended e2e + screenshot |
| TW-06.10 | PASS | `TW-06.png` columns + chips |
| TW-06.11 | PASS | Row CTAs / invited → invitation |
| TW-06.12 | PASS | banned-strings — no % bars / Flagged / Bulk / Export |
| TW-06.13 | PASS | `TW-06--empty-filter.png` + mobile |
| TW-06.14 | PASS | banned-strings hard-fail on `/clients` |
| TW-06.15 | FAIL | Skeleton/error/offline/empty-no-clients not each evidenced |

## TW-07 · Add client

| ID | Result | Proof |
|---|---|---|
| TW-07.1 | PASS | e2e Create invite → share card + WhatsApp |
| TW-07.2 | PASS | e2e Copy → Copied + QR img; `TW-07--share.png` |
| TW-07.3 | PASS | e2e Anita duplicate pending path |
| TW-07.4 | PASS | `TW-07.png` — form select + Preview |
| TW-07.5 | PASS | `TW-07.png` — name, email, +91, form |
| TW-07.6 | PASS | `TW-07.png` — What happens next |
| TW-07.7 | PASS | e2e “Invite ready for …” |
| TW-07.8 | PASS | e2e WhatsApp `wa.me` href |
| TW-07.9 | PASS | Share card 14-day / once note + Invite another |
| TW-07.10 | PASS | `TW-07--duplicate.png`, `TW-07--reactivate.png` + e2e |
| TW-07.11 | PASS | No WhatsApp OTP/automation promise |
| TW-07.12 | PASS | banned-strings hard-fail on `/clients/add` |
| TW-07.13 | FAIL | Offline state not evidenced (duplicate/reactivate are) |

## TW-08 · Pending invitation detail

| ID | Result | Proof |
|---|---|---|
| TW-08.1 | PASS | `TW-08.png` — Default onboarding · v1 |
| TW-08.2 | PASS | e2e reissue → new invitation id; old demo token preview status `revoked` |
| TW-08.3 | PASS | e2e accept invite → `/clients/:relationshipId` |
| TW-08.4 | PASS | `TW-08.png` meta + Invited chip |
| TW-08.5 | PASS | e2e Remind `wa.me` + screenshot |
| TW-08.6 | PASS | `TW-08--reissue-confirm.png` + e2e “old link will stop working” |
| TW-08.7 | PASS | `TW-08--revoke-confirm.png` + e2e “Revoked on …” |
| TW-08.8 | PASS | No workspace tabs / fake client header |
| TW-08.9 | PASS | banned-strings hard-fail on invitation route |
| TW-08.10 | FAIL | Loading/error/offline not each evidenced (revoked is) |
