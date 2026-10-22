import { z } from "zod";

/** Compact trainer triage state. This is not a numeric score. */
export const adherenceStateSchema = z.enum([
  "on_track",
  "needs_attention",
  "no_recent_data",
  "not_available",
]);
export type AdherenceState = z.infer<typeof adherenceStateSchema>;
