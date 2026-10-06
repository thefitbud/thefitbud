import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { z } from "zod";
import { healthResponseSchema } from "@fitbud/contracts";
import {
  handleReminderQueueBatch,
  handleScheduledReminders,
} from "./jobs/reminders";
import { ok } from "./lib/envelope";
import { writeStructuredLog } from "./lib/log";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLogMiddleware } from "./middleware/request-log";
import { authRoutes, meRoutes } from "./routes/auth";
import { checkinRoutes } from "./routes/checkins";
import { configurationRoutes } from "./routes/configurations";
import { exceptionRoutes } from "./routes/exceptions";
import { fileRoutes } from "./routes/files";
import { invitationRoutes } from "./routes/invitations";
import { onboardingRoutes } from "./routes/onboarding";
import {
  subscriptionAttentionRoutes,
  subscriptionRoutes,
} from "./routes/subscriptions";
import { mealRoutes } from "./routes/meals";
import { notificationRoutes } from "./routes/notifications";
import { planRoutes } from "./routes/plans";
import { progressRoutes } from "./routes/progress";
import { historyRoutes } from "./routes/history";
import { relationshipRoutes } from "./routes/relationships";
import { syncRoutes, bindSyncApp } from "./routes/sync";
import { workoutRoutes } from "./routes/workouts";
import { realtimeRoutes } from "./routes/realtime";
import { templateRoutes } from "./routes/templates";
import { libraryRoutes } from "./routes/libraries";
import { openApiRouteOptions, operation } from "./openapi/document";
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestIdMiddleware);
app.use("*", requestLogMiddleware);

app.get(
  "/health",
  operation({
    tag: "Health",
    summary: "Service health",
    description: "Reports that the API process is serving requests.",
    security: "public",
    defaultErrors: false,
    response: healthResponseSchema,
    successDescription: "The service is up.",
  }),
  (c) =>
    ok(
      c,
      healthResponseSchema.parse({
        status: "ok",
        service: "fitbud-api",
      }),
    ),
);

app.route("/auth", authRoutes);
app.route("/me", meRoutes);
app.route("/invitations", invitationRoutes);
app.route("/relationships", subscriptionRoutes);
app.route("/relationships", relationshipRoutes);
app.route("/subscriptions", subscriptionAttentionRoutes);
app.route("/onboarding", onboardingRoutes);
app.route("/configurations", configurationRoutes);
app.route("/plans", planRoutes);
app.route("/templates", templateRoutes);
app.route("/libraries", libraryRoutes);
app.route("/workouts", workoutRoutes);
app.route("/meals", mealRoutes);
app.route("/checkins", checkinRoutes);
app.route("/exceptions", exceptionRoutes);
app.route("/progress", progressRoutes);
app.route("/history", historyRoutes);
app.route("/files", fileRoutes);
app.route("/sync", syncRoutes);
app.route("/notifications", notificationRoutes);
app.route("/realtime", realtimeRoutes);
bindSyncApp(app);

const openApiDocumentSchema = z
  .object({
    openapi: z.string(),
    info: z.object({ title: z.string(), version: z.string() }),
    paths: z.record(z.unknown()),
  })
  .passthrough();

app.get(
  "/openapi.json",
  operation({
    tag: "Documentation",
    summary: "OpenAPI document",
    description: "Generated OpenAPI document for every mounted HTTP operation. Try-it-out calls this API directly and does not add credentials.",
    security: "public",
    defaultErrors: false,
    response: openApiDocumentSchema,
    envelope: false,
    successDescription: "OpenAPI 3 document.",
  }),
  openAPIRouteHandler(app, openApiRouteOptions),
);

app.get(
  "/docs",
  operation({
    tag: "Documentation",
    summary: "Interactive API reference",
    description: "Scalar reference served by this API. The page loads GET /openapi.json on the same origin. Try-it-out uses the caller's own credentials and does not bypass authentication.",
    security: "public",
    defaultErrors: false,
    html: true,
    successDescription: "HTML API reference.",
  }),
  Scalar({ url: "/openapi.json", pageTitle: "FitBud API" }),
);

app.notFound((c) =>
  c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
        requestId: c.get("requestId"),
      },
    },
    404,
  ),
);

app.onError((err, c) => {
  // Log name/correlation only — never err.message or stacks (may contain payloads).
  writeStructuredLog({
    level: "error",
    message: "Unhandled API error",
    requestId: c.get("requestId"),
    errorName: err.name,
  });
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred.",
        requestId: c.get("requestId") ?? "unknown",
      },
    },
    500,
  );
});

const worker = {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Env,
  ): Promise<void> {
    await handleScheduledReminders(env, new Date(controller.scheduledTime));
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await handleReminderQueueBatch(batch, env);
  },
};

export default worker;
export { app };
/** Wrangler Durable Object binding export — relationship-scoped WS fan-out. */
export { RelationshipRealtimeRoom } from "./realtime/relationship-room";
