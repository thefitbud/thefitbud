# Trainer web — API / contract gaps (Stage 2)

Tracked against **FitBud UI/UX Implementation Guide v1.2**. The UI uses small adapters in `apps/trainer-web/src/lib/http-api.ts` where `@fitbud/api-client` is not yet extended.

| Screen | Missing in client/API | Expected contract |
|--------|----------------------|-------------------|
| TW-23 | `listPlanTemplates` has no `scope` / `templateType` / `q` in api-client | `GET /templates?scope=all\|bases\|mine&templateType=&q=` → existing list schema |
| TW-08 | `reissueInvitation` / `revokeInvitation` / `cancelReactivation` not on api-client | `POST /invitations/:id/reissue` → `createInvitationResponseSchema`; `POST …/revoke` → invitation; `POST /relationships/:rid/reactivate/cancel` |
| TW-25 | Dedicated check-in template tab UI | `GET /checkins/form-templates` with scope filters (same as TW-23 pattern) |
| TW-13/14 | Dedicated plan version edit route with 3-pane builder | Full-screen builder route; library FTS fields already on API |
| TW-29 | Rich notification preference editor | `GET/PUT /notifications/preferences` with `trainerCategories` round-trip UI |
| TW-33 | `GET /links/resolve` deep-link handler in router | Resolve + redirect for `/go/*` style links |
