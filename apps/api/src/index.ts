import { Hono } from "hono";
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
import { intakeRoutes } from "./routes/intake";
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
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestIdMiddleware);
app.use("*", requestLogMiddleware);

app.get("/health", (c) =>
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
app.route("/relationships", relationshipRoutes);
app.route("/intake", intakeRoutes);
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
