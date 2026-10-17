# Trainer web — API / contract gaps (Stage 2)

Tracked against **FitBud UI/UX Implementation Guide v1.2**. The UI uses small adapters in `apps/trainer-web/src/lib/http-api.ts` and `trainee-timezone.ts` where `@fitbud/api-client` is not yet extended.

| Screen | Missing in client/API | Expected contract | UI workaround |
|--------|----------------------|-------------------|---------------|
| TW-09a | `traineeTimezone` sometimes absent on workspace header | Always set from trainee profile | `resolveTraineeTimezone()` falls back to `Asia/Kolkata` for demo |
| TW-23 | `listPlanTemplates` scope/q not on api-client | `GET /templates?scope=&templateType=&q=` | `listPlanTemplatesExtended` in `http-api.ts` |
| TW-25 | Check-in template scope server filter | Same as plan templates | Client-side scope on ownership |
| TW-08 | Reissue/revoke not on api-client | Invitation POST routes | `http-api.ts` |
| TW-30 | Reactivation cancel | `POST …/reactivate/cancel` | `cancelReactivation` in `http-api.ts` |
| Auth OTP | `POST /auth/otp/start` returns bare `{ sent, channels }` (202), not `{ data }` | Envelope parity with other routes | `src/lib/otp-api.ts` (keep until API or api-client handles non-envelope 202) |
