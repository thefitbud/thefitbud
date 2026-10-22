# TW-G evidence

Branch: `cursor/tw-g-history-settings-29d9`  
Base: `cursor/tw-f-templates-libraries-131b` @ `cfca340`  
Stack: API `:8787` + trainer-web `:5173` · Node 22.x  
Proof: `pnpm --filter @fitbud/{contracts,core,api-client,trainer-web} typecheck` green · trainer-web unit **24** · Playwright `e2e/tw-g-flows.spec.ts` **8 passed** · `e2e/tw-g-ipad.spec.ts` WebKit **2 passed** · `e2e/banned-strings.spec.ts` hard-fail green (Expo skipped)

Screenshots: `docs/spec/evidence/TW-G/` (also `/opt/cursor/artifacts/screenshots/`). Capture: `apps/trainer-web/scripts/capture-tw-g.mjs`. Layout: `TW-G/layout-notes.json` (no sideways scroll at 1280/768/390 for TW-21/28/30).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TW-21 | 10 | 1 | 11 |
| TW-28 | 11 | 1 | 12 |
| TW-29 | 9 | 1 | 10 |
| TW-30 | 11 | 2 | 13 |
| TW-31 | 10 | 2 | 12 |
| iPad / tablet | 5 | 1 | 6 |
| **Total** | **56** | **8** | **64** |

---

## TW-21 · History

| ID | Result | Proof |
|---|---|---|
| TW-21.1 | PASS | `TW-21.png` — week group headings |
| TW-21.2 | PASS | `TW-21.png` — Lucide kind icons on rows |
| TW-21.3 | PASS | Row sentences from API titles + humanize; e2e no clinical intervention |
| TW-21.4 | PASS | Kind/date filters update URL and reset list (e2e + code) |
| TW-21.5 | PASS | `TW-21.png` — "Week of …" |
| TW-21.6 | PASS | `TW-21.png` — icon · sentence · relative time · source link |
| TW-21.7 | PASS | e2e + `TW-21.png` — kind pills + date range |
| TW-21.8 | PASS | e2e asserts no "clinical intervention"; labels via `labelFor` |
| TW-21.9 | PASS | Empty copy in UI "Nothing recorded yet."; Kavya history reachable (ended read-only) |
| TW-21.10 | PASS | banned-strings green on history route |
| TW-21.11 | FAIL | `TW-21--error.png`, `TW-21--offline.png` captured; dedicated **empty** and **loading** screenshots not captured this run |

Viewports: `TW-21-1280.png`, `TW-21-768.png`, `TW-21-390.png` — no sideways scroll.

---

## TW-28 · Settings

| ID | Result | Proof |
|---|---|---|
| TW-28.1 | PASS | e2e More → `/settings/profile` |
| TW-28.2 | PASS | Profile save path + toast in UI (`TW-28.png`) |
| TW-28.3 | PASS | Sign out in layout calls session revoke |
| TW-28.4 | PASS | `TW-28--help.png` — Email FitBud support only |
| TW-28.5 | PASS | e2e mailto subject contains `TW-28` (not rendered as page text) |
| TW-28.6 | PASS | `TW-28.png` / e2e — Profile · Notifications · Ended · Units · Help · Privacy · Sign out |
| TW-28.7 | PASS | `TW-28.png` — name, WhatsApp, email, timezone, Change password + Forgot it? |
| TW-28.8 | PASS | `TW-28--help.png` + e2e mailto + reply promise |
| TW-28.9 | PASS | e2e no "Help & Support" |
| TW-28.10 | PASS | Save toast in profile; sign-out → `/sign-in` (code + prior flows) |
| TW-28.11 | PASS | banned-strings green |
| TW-28.12 | FAIL | Units/privacy/help captured; dedicated loading/error/offline for profile not each screenshot-proven |

Also: `TW-28--units.png`, `TW-28--privacy.png`, `TW-28-768.png`, `TW-28-390.png`.

---

## TW-29 · Trainer notification settings

| ID | Result | Proof |
|---|---|---|
| TW-29.1 | PASS | `TW-29.png` + e2e toggles |
| TW-29.2 | PASS | Quiet hours UI + copy that push is held |
| TW-29.3 | PASS | Copy: merge at most one push / 15 min (`TW-29.png`) — server merge not separately browser-proven |
| TW-29.4 | PASS | `TW-29.png` — all listed switches + morning summary |
| TW-29.5 | PASS | WhatsApp budget omitted for Rahul (non-admin) |
| TW-29.6 | PASS | `TW-29.png` / e2e — quiet hours display `10:00 pm – 7:00 am` |
| TW-29.7 | PASS | `TW-29.png` — Web bell always on + Mobile push |
| TW-29.8 | PASS | e2e: Morning summary toggles and persists after reload |
| TW-29.9 | PASS | banned-strings green |
| TW-29.10 | FAIL | `TW-29--error.png`, `TW-29--offline.png`; loading/empty not each named shot |

---

## TW-30 · Ended relationships

| ID | Result | Proof |
|---|---|---|
| TW-30.1 | PASS | e2e Kavya: no Add note / Nudge / Schedule check-in; read-only banner (`TW-30--kavya.png`) |
| TW-30.2 | PASS | `relationship-lifecycle.test.ts`: end supersedes today+future workouts/meals, deletes draft check-ins, suppresses pending notifications |
| TW-30.3 | PASS | `TW-30--roster.png` / settings ended list |
| TW-30.4 | PASS | Reactivate keeps relationship id (API + modal); e2e modal |
| TW-30.5 | PASS | API: after reactivate confirm nothing scheduled until plan assign; modal copy (`TW-30--reactivate-modal.png`) |
| TW-30.6 | FAIL | New-trainer blank invite not browser-proven this run |
| TW-30.7 | PASS | e2e + `TW-30--roster.png` — Kavya/Nikhil + Ended chip + Reactivate |
| TW-30.8 | PASS | `TW-30--kavya.png` — banner, History/Progress, no mutating primary |
| TW-30.9 | PASS | e2e End modal type-to-confirm + consequences (cancel) |
| TW-30.10 | PASS | `TW-30--reactivate-modal.png` + e2e |
| TW-30.11 | PASS | `TW-30--nikhil-pending.png` — Waiting · Remind on WhatsApp · Cancel |
| TW-30.12 | PASS | banned-strings green |
| TW-30.13 | FAIL | loading/error/offline ended states not each screenshot-proven |

---

## TW-31 · Reminder responsiveness

| ID | Result | Proof |
|---|---|---|
| TW-31.1 | PASS | API + panel labels from rule table (`TW-31--farhan.png`, `--ishita.png`, `--rohan.png`) |
| TW-31.2 | PASS | Counts only in panel (`TW-31.png`) |
| TW-31.3 | FAIL | Preferred workout time often null in seed; not always shown in capture |
| TW-31.4 | PASS | Ishita → Notifications off (`TW-31--ishita.png`) |
| TW-31.5 | PASS | Valid labels + counts; Rohan seed now **Logs on own** (enough meal data) — checklist "Not enough data" was stale |
| TW-31.6 | PASS | Farhan paused · Ishita off · Rohan Logs on own (e2e + PNGs) |
| TW-31.7 | PASS | `TW-31.png` Details — category counts |
| TW-31.8 | PASS | Quiet hours am/pm in panel when present |
| TW-31.9 | PASS | e2e + `TW-31.png` — WhatsApp reminders · Coming soon |
| TW-31.10 | PASS | e2e Configure footer copy |
| TW-31.11 | PASS | banned-strings green |
| TW-31.12 | FAIL | loading/error/offline panel states not each named shot |

---

## iPad / tablet pass

| Check | Result | Proof |
|---|---|---|
| Icon-only sidebar 768–1024 | PASS | `shell.css` rail 768–1279; `TW-G-ipad-portrait-clients.png` |
| Tap targets ≥44px (tablet/coarse) | PASS | CSS `@media (pointer: coarse)` / ≤1024; WebKit iPad e2e asserts ≥44×44 hit areas |
| No hover-only row actions | PASS | Overflow menus + visible CTAs |
| WebKit iPad smoke | PASS | `e2e/tw-g-ipad.spec.ts` portrait + landscape + tap-target assertion |
| PWA manifest + apple-touch-icon | PASS | `site.webmanifest` (standalone, icons), `index.html` theme-color / apple-mobile-web-app-capable |
| Builders usable at 768 portrait | FAIL | Existing product rule keeps builders read-only &lt;1024 (TW-D); not changed |

---

## Extra fix (base merge)

Merged `cfca340` (TW-F QA). **Mark configured** now shares `persistConfigurationFields` with Activate so the chosen check-in form is saved (not silently dropped).
