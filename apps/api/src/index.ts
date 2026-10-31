import { Scalar } from "@scalar/hono-api-reference";
import { Hono, type Context } from "hono";
import { matchedRoutes } from "hono/route";
import { openAPIRouteHandler } from "hono-openapi";
import { z } from "zod";
import { healthResponseSchema } from "@fitbud/contracts";
import {
  handleReminderQueueBatch,
  handleScheduledReminders,
} from "./jobs/reminders";
import { handleScheduledPushReceipts } from "./jobs/push-receipts";
import { handleScheduledReplenishment } from "./jobs/replenishment";
import { runCoachAskMaintenance } from "./domain/coach-asks";
import { createDb } from "./db/client";
import { ok } from "./lib/envelope";
import { writeStructuredLog, type SafeLogFields } from "./lib/log";
import { errorLogFields } from "./domain/reminders";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLogMiddleware } from "./middleware/request-log";
import { authRoutes, meRoutes } from "./routes/auth";
import { checkinFormTemplateRoutes } from "./routes/checkin-forms";
import { checkinRoutes } from "./routes/checkins";
import { configurationRoutes } from "./routes/configurations";
import { exceptionRoutes } from "./routes/exceptions";
import { fileRoutes } from "./routes/files";
import { invitationRoutes } from "./routes/invitations";
import { inviteLandingRoutes } from "./routes/invite-landing";
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
import { workspaceRoutes } from "./routes/workspaces";
import { relationshipRoutes } from "./routes/relationships";
import { syncRoutes, bindSyncApp } from "./routes/sync";
import { workoutRoutes } from "./routes/workouts";
import { realtimeRoutes } from "./routes/realtime";
import { templateRoutes } from "./routes/templates";
import { libraryRoutes } from "./routes/libraries";
import { clientRoutes } from "./routes/clients";
import { configRoutes } from "./routes/config";
import { devRoutes } from "./routes/dev";
import { coachAskRoutes } from "./routes/coach-asks";
import { activityFeedRoutes } from "./routes/activity-feed";
import { linkRoutes } from "./routes/links";
import { whatsappWebhookRoutes } from "./routes/webhooks-whatsapp";
import { openApiRouteOptions, operation } from "./openapi/document";
import { runtimeGuardMiddleware } from "./middleware/runtime-guard";
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const pinned = c.env.NOW?.trim();
  if (pinned && !Number.isNaN(Date.parse(pinned))) {
    (globalThis as { FITBUD_NOW?: string }).FITBUD_NOW = pinned;
  }
  await next();
});
app.use("*", requestIdMiddleware);
app.use("*", requestLogMiddleware);
// Before any route: a staging/production Worker running a local test double refuses to serve.
app.use("*", runtimeGuardMiddleware);

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

app.route("/config", configRoutes);
app.route("/dev", devRoutes);
app.route("/auth", authRoutes);
app.route("/me", meRoutes);
app.route("/invitations", invitationRoutes);
app.route("/i", inviteLandingRoutes);
app.route("/relationships", subscriptionRoutes);
app.route("/relationships", relationshipRoutes);
app.route("/subscriptions", subscriptionAttentionRoutes);
app.route("/onboarding", onboardingRoutes);
app.route("/configurations", configurationRoutes);
app.route("/plans", planRoutes);
app.route("/templates", templateRoutes);
app.route("/libraries", libraryRoutes);
app.route("/clients", clientRoutes);
app.route("/workouts", workoutRoutes);
app.route("/meals", mealRoutes);
app.route("/checkins/form-templates", checkinFormTemplateRoutes);
app.route("/checkins", checkinRoutes);
app.route("/exceptions", exceptionRoutes);
app.route("/progress", progressRoutes);
app.route("/history", historyRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/files", fileRoutes);
app.route("/sync", syncRoutes);
app.route("/notifications", notificationRoutes);
app.route("/realtime", realtimeRoutes);
app.route("/coach-asks", coachAskRoutes);
app.route("/activity", activityFeedRoutes);
app.route("/links", linkRoutes);
app.route("/webhooks/whatsapp", whatsappWebhookRoutes);
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

/**
 * The matched route pattern (e.g. `/clients/:clientId`), never the raw URL,
 * which can hold ids or tokens. Middleware registered on `*` is skipped.
 */
function routePattern(c: Context): string {
  const routes = matchedRoutes(c);
  for (let i = routes.length - 1; i >= 0; i -= 1) {
    const route = routes[i]!;
    if (route.method !== "ALL" && !route.path.endsWith("*")) return route.path;
  }
  return "unmatched";
}

app.onError((err, c) => {
  // Safe fields only: never err.message, stacks, bodies or the raw URL.
  const actor = c.get("actor");
  writeStructuredLog({
    level: "error",
    message: "Unhandled API error",
    requestId: c.get("requestId"),
    method: c.req.method,
    path: routePattern(c),
    status: 500,
    ...(actor?.userId ? { actorUserId: actor.userId } : {}),
    ...errorLogFields(err),
  });
  const requestId = c.get("requestId") ?? "unknown";
  if (c.env.ENVIRONMENT === "local") {
    return c.json(
      {
        error: {
          code: "LOCAL_DEV_ERROR",
          message: err.message,
          requestId,
        },
      },
      500,
    );
  }
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred.",
        requestId,
      },
    },
    500,
  );
});

/**
 * Runs every cron job even when an earlier one throws, logging one line per job
 * (operation, latencyMs, errorName on failure). Rethrows the first failure at the
 * end so the platform still records the run as failed.
 */
async function runScheduledJobs(jobs: Array<[operation: string, run: () => Promise<unknown>]>): Promise<void> {
  let firstFailure: unknown;
  let failed = false;
  for (const [operation, run] of jobs) {
    const started = Date.now();
    try {
      await run();
      writeStructuredLog({ level: "info", message: "cron.completed", operation, latencyMs: Date.now() - started });
    } catch (error) {
      writeStructuredLog({
        level: "error",
        message: "cron.failed",
        operation,
        latencyMs: Date.now() - started,
        ...errorLogFields(error),
      });
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }
  if (failed) throw firstFailure;
}

const worker = {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Env,
  ): Promise<void> {
    const at = new Date(controller.scheduledTime);
    await runScheduledJobs([
      ["cron.reminders", () => handleScheduledReminders(env, at)],
      ["cron.replenishment", () => handleScheduledReplenishment(env, at)],
      ["cron.coach_ask", () => runCoachAskMaintenance(createDb(env.DB))],
      // Last, so a slow receipts call never delays the jobs above.
      ["cron.push_receipts", () => handleScheduledPushReceipts(env, at)],
    ]);
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const started = Date.now();
    const operation = "queue.reminders";
    try {
      const { retried } = await handleReminderQueueBatch(batch, env);
      const fields: SafeLogFields & { batchSize: number; retried: number } = {
        level: retried > 0 ? "warn" : "info",
        message: "queue.batch_completed",
        operation,
        latencyMs: Date.now() - started,
        batchSize: batch.messages.length,
        retried,
      };
      writeStructuredLog(fields);
    } catch (error) {
      const fields: SafeLogFields & { batchSize: number } = {
        level: "error",
        message: "queue.batch_failed",
        operation,
        latencyMs: Date.now() - started,
        batchSize: batch.messages.length,
        ...errorLogFields(error),
      };
      writeStructuredLog(fields);
      throw error;
    }
  },
};

export default worker;
export { app };
/** Wrangler Durable Object binding export — relationship-scoped WS fan-out. */
export { RelationshipRealtimeRoom } from "./realtime/relationship-room";
