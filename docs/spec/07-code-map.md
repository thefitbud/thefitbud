# 07 · Code map (guide Appendix C)

Copied **verbatim** from guide Appendix C, lines 5033–5066. **Warning:** it was written against `feat/iteration-a-backend` @ `ae1cfa6` (11 Oct). Paths may have moved by `7f74108`; the screen files list the paths that actually exist.

<!-- BEGIN VERBATIM codemap -->
## C. Code map (where things live)

| Concern | Path |
|---|---|
| Trainer web routes | `apps/trainer-web/src/App.tsx` |
| Trainer web shell | `apps/trainer-web/src/layout/AppShell.tsx` |
| Trainer web pages | `apps/trainer-web/src/pages/*.tsx`, `pages/templates/*` |
| Trainer web components | `apps/trainer-web/src/components/` (`StatusBadge`, `MeasurementTrend`, `PlanConsistencyNotice`, `LinkedMedia`, `plan-composition/`) |
| Trainer web styles | `apps/trainer-web/src/styles.css`, `src/styles/{clients,home,plan,templates,workspace}.css` |
| WhatsApp helpers | `packages/core/src/whatsapp.ts`, `apps/trainer-web/src/lib/whatsapp.ts`, `apps/mobile/src/trainer/whatsapp.ts` (consolidate into core) |
| Mobile routing | `apps/mobile/src/navigation/AppRouter.tsx`, `resolveRoute.ts` (replace with a navigation library plus `linking.ts`) |
| Mobile trainee | `apps/mobile/src/trainee/*` |
| Mobile trainer | `apps/mobile/src/trainer/*` |
| Mobile shared screens | `apps/mobile/src/screens/*` |
| Mobile notifications | `apps/mobile/src/notifications/routing.ts`, `register.ts` |
| Mobile sync | `apps/mobile/src/sync/engine.ts`, `SyncProvider.tsx` |
| Mobile theme | `packages/ui-mobile/src/theme.ts` |
| Contracts | `packages/contracts/src/{notification,exception,adherence}.ts` |
| Reminder constants | `packages/core/src/reminder.ts` |
| API routes | `apps/api/src/routes/*.ts` (mounted in `apps/api/src/index.ts`) |
| API domain | `apps/api/src/domain/{reminders,adherence,exceptions,client-status,assignment-schedule,workspace,sync}.ts` |
| Jobs | `apps/api/src/jobs/{reminders,replenishment}.ts` |
| Push provider | `apps/api/src/lib/push-provider.ts` |
| Realtime | `apps/api/src/realtime/{emit,relationship-room}.ts` |
| OpenAPI | `apps/api/src/openapi/document.ts` |
| **New (17 Oct)**: auth | `apps/api/src/routes/auth.ts` (login, OTP, password), `apps/api/src/domain/otp.ts`, trainer-web `pages/auth/*`, mobile `src/screens/auth/*` |
| **New (v1.2)**: flags and config | `apps/api/src/config/flags.ts` (`wa_otp`, `wa_automation`, `steps_enabled`), `apps/api/src/routes/config.ts` (`GET /config`), `packages/core/src/config.ts` (client cache, 1 h) |
| **New (v1.2)**: system email | `apps/api/src/lib/email.ts` (provider adapter, `SYSTEM_EMAIL_FROM`, `SYSTEM_EMAIL_REPLY_TO`, `ADMIN_ALERT_EMAILS`), `apps/api/src/emails/*` (E-OTP, E-INV, E-PWD, E-ALERT) |
| **New (v1.2)**: template registry | `apps/api/src/domain/whatsapp-templates.ts` (registry, latest approved version), `apps/api/src/domain/whatsapp-templates.seed.ts` and `whatsapp-templates.lint.test.ts` (copy lint), migration for `whatsapp_templates` |
| **New**: WhatsApp Cloud API (built, flags off) | `apps/api/src/lib/whatsapp-cloud.ts` (send), `apps/api/src/routes/webhooks-whatsapp.ts` (statuses, STOP, auto-reply), `apps/api/src/domain/whatsapp-budget.ts` (ledger, modes, alerts) |
| **New**: notes visibility, reactivation, meal times, activity feed | `routes/notes.ts` (visibility), `routes/relationships.ts` (end, reactivate, confirm), `routes/me-meal-times.ts`, `routes/activity-feed.ts` |
| **New**: food logging | `routes/me-foods.ts` (search, recent, index), mobile `src/trainee/food/*`, `src/sync/foodIndex.ts`, `packages/core/src/macros.ts` |
| **New**: support link | `packages/core/src/support.ts` (`buildSupportMailto`) |
<!-- END VERBATIM codemap -->
