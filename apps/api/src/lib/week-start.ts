import { localDateSchema } from "@fitbud/contracts";
import { addDaysToLocalDate } from "@fitbud/core";

/**
 * Malformed `?start=` on a week read model (CU23, BT14, D-W4-19).
 * Static text only: nothing from the request is included (D-W3-12, D-W3b-7).
 */
export const INVALID_WEEK_START = {
  status: 400 as const,
  code: "INVALID_REQUEST" as const,
  message: "Invalid start date.",
};

export type WeekStartQuery =
  | { ok: true; start: string | undefined }
  | {
      ok: false;
      status: typeof INVALID_WEEK_START.status;
      code: typeof INVALID_WEEK_START.code;
      message: typeof INVALID_WEEK_START.message;
    };

/**
 * Optional civil `?start=` shared by `GET /me/week` and the trainer week route.
 * Blank or absent is valid and means the caller picks the default week.
 * A present value must be a real calendar day: `localDateSchema` accepts
 * `2026-02-30`, and the round trip through `addDaysToLocalDate` rejects it.
 */
export function parseWeekStartQuery(raw: string | undefined): WeekStartQuery {
  const start = raw?.trim();
  if (!start) return { ok: true, start: undefined };
  const parsed = localDateSchema.safeParse(start);
  if (!parsed.success || addDaysToLocalDate(parsed.data, 0) !== parsed.data) {
    return { ok: false, ...INVALID_WEEK_START };
  }
  return { ok: true, start: parsed.data };
}
