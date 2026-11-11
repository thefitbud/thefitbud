import { useEffect, useState } from "react";
import {
  progressMetricKeySchema,
  type CheckinFormVersion,
  type ProgressMetricKey,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";

export type FormMetrics = {
  /** Chartable standard keys the client's check-in form asks ("picked in form"). */
  keys: ProgressMetricKey[];
  /** The form's template, for "See … check-in form". */
  templateId: string | null;
};

const NONE: FormMetrics = { keys: [], templateId: null };

/** Dev-only diagnostic for a failure the UI deliberately hides. Error name only, never data. */
function reportError(where: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[${where}]`, err instanceof Error ? err.name : typeof err);
  }
}

/** Chartable standard keys in a pinned form, in form order. */
export function formMetricKeys(form: CheckinFormVersion): ProgressMetricKey[] {
  const keys: ProgressMetricKey[] = [];
  for (const field of form.fields) {
    const parsed = progressMetricKeySchema.safeParse(field.key);
    if (parsed.success && !keys.includes(parsed.data)) keys.push(parsed.data);
  }
  return keys;
}

/**
 * The form pinned on the client's next check-in. The rail uses it to list the
 * questions that have no answers yet ("No entries", frames 160g, 161). Without a
 * next check-in (ended, not scheduled) or when the form cannot be read, the rail
 * lists only the metrics that have entries, which is still correct.
 */
export function useFormMetricKeys(
  checkinId: string | null,
  refreshEpoch: number,
): FormMetrics {
  const [state, setState] = useState<FormMetrics>(NONE);
  useEffect(() => {
    if (!checkinId) {
      setState(NONE);
      return;
    }
    let cancelled = false;
    apiClient.getCheckinForm(checkinId).then(
      (form) => {
        if (!cancelled) {
          setState({ keys: formMetricKeys(form), templateId: form.templateId });
        }
      },
      (err: unknown) => {
        // Optional context only (no message is shown): the rail falls back to
        // the metrics that have entries.
        reportError("progress-form-keys", err);
        if (!cancelled) setState(NONE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [checkinId, refreshEpoch]);
  return state;
}
