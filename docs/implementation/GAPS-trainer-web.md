# Trainer web — API / contract gaps (Stage 2)

Tracked against **FitBud UI/UX Implementation Guide v1.2**. Prefer `@fitbud/api-client` and `@fitbud/contracts`; small adapters remain only where noted.

| Screen | Missing in client/API | Expected contract | UI workaround |
|--------|----------------------|-------------------|---------------|
| TW-09a | `traineeTimezone` sometimes absent on workspace header | Always set from trainee profile | `resolveTraineeTimezone()` falls back to `Asia/Kolkata` for demo |
| TW-23 | `listPlanTemplates` extended query not used everywhere | `GET /templates?scope=&templateType=&q=` | `listPlanTemplatesExtended` in `http-api.ts` where needed |
