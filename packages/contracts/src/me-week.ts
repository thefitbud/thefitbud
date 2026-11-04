import { z } from "zod";
import { localDateSchema } from "./workout.js";

/**
 * `GET /me/week` (trainee week summary).
 *
 * This is the shape `apps/api/src/routes/me-day.ts` returns today, moved here so the
 * route and the staging smoke (`apps/api/qa-smoke/trainee-day.smoke.test.ts`) cannot
 * drift (CU13). It is deliberately narrower than `weekReadModelSchema` in
 * `read-models.ts`, which describes a richer week read model the route does not serve;
 * which of the two shapes `/me/week` should serve is an open API decision, not this
 * schema's job.
 *
 * `state` stays a plain string, as the route's inline schema had it: narrowing it to
 * `weekDayStateSchema` would be a contract change, not a move.
 */
export const meWeekDaySchema = z.object({
  date: localDateSchema,
  state: z.string(),
});
export type MeWeekDay = z.infer<typeof meWeekDaySchema>;

export const meWeekResponseSchema = z.object({
  start: localDateSchema,
  days: z.array(meWeekDaySchema),
});
export type MeWeekResponse = z.infer<typeof meWeekResponseSchema>;
