import { z } from "zod";

/**
 * `GET /me/week` (trainee week summary).
 *
 * This is the shape `apps/api/src/routes/me-day.ts` returns today, moved here so the
 * route and the staging smoke (`apps/api/qa-smoke/trainee-day.smoke.test.ts`) state it
 * once instead of twice (CU13). It is a move, not a change: both fields stay
 * `z.string()`, as the route's inline schema had them.
 *
 * Deliberately *not* tightened, because the route does not validate what it returns:
 * `start` is the raw `?start=` query echoed back, so `?start=2026-11` and
 * `?start=2026-02-30` both answer 200 with that text in `start`, and
 * `?start=-002026-11-02` puts extended-year values in `days[].date`. `localDateSchema`
 * here would advertise a pattern the route violates. Narrowing `state` to
 * `weekDayStateSchema` would be the same kind of change.
 *
 * It is narrower than `weekReadModelSchema` in `read-models.ts`, which describes a
 * richer week read model that this route has never served; which of the two shapes
 * `/me/week` should serve is an open API decision, not this schema's job.
 */
export const meWeekDaySchema = z.object({
  date: z.string(),
  state: z.string(),
});
export type MeWeekDay = z.infer<typeof meWeekDaySchema>;

export const meWeekResponseSchema = z.object({
  start: z.string(),
  days: z.array(meWeekDaySchema),
});
export type MeWeekResponse = z.infer<typeof meWeekResponseSchema>;
