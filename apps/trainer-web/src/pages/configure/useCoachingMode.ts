import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ClientSettingsSubscription,
  CoachingMode,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotency";

/** Frame IP-07 order. */
export const COACHING_MODES: CoachingMode[] = ["online", "hybrid", "in_person"];

export type CoachingModeState = {
  /** The newest subscription version, or null before one exists. */
  subscription: ClientSettingsSubscription | null;
  loading: boolean;
  loadFailed: boolean;
  /** The option picked on screen (the stored mode until the trainer changes it). */
  draft: CoachingMode | null;
  setDraft: (mode: CoachingMode) => void;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  save: () => Promise<boolean>;
  discard: () => void;
};

/**
 * Coaching mode is a tracking field of the subscription version (Z6-3/Z6-8),
 * the same field Client settings edits (Z8-3). Saving it writes a new
 * subscription version through the client-settings API; plan name, dates,
 * amount and type are sent back exactly as stored. It is not part of the
 * coaching configuration version, so it saves on its own.
 */
export function useCoachingMode(
  relationshipId: string,
  options: {
    onSaved: (mode: CoachingMode) => void;
    /** Returns true when it handled the error (coaching ended elsewhere). */
    onEndedElsewhere: (err: unknown) => boolean;
  },
): CoachingModeState {
  const { onSaved, onEndedElsewhere } = options;
  const [subscription, setSubscription] =
    useState<ClientSettingsSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<CoachingMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ body: string; key: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    const mine = ++seq.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await apiClient.getClientSettings(relationshipId);
      if (mine !== seq.current) return;
      setSubscription(result.subscription);
      setDraft(result.subscription?.coachingMode ?? null);
    } catch {
      // The section shows its own "could not load" line; nothing else on the
      // page depends on this read.
      if (mine !== seq.current) return;
      setSubscription(null);
      setDraft(null);
      setLoadFailed(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    subscription !== null && draft !== (subscription.coachingMode ?? null);

  const save = useCallback(async () => {
    if (!subscription || !dirty || saving) return false;
    setSaving(true);
    setError(null);
    const body = {
      expectedVersion: subscription.versionNumber,
      planName: subscription.planName,
      paymentFrequency: subscription.paymentFrequency,
      startsOn: subscription.startsOn,
      renewsOn: subscription.renewsOn,
      // Not edited here: sent as stored so nothing changes silently (D-W8-5).
      amountPaise: subscription.amountPaise,
      subscriptionType: subscription.subscriptionType,
      coachingMode: draft,
    };
    const bodyKey = JSON.stringify(body);
    if (keyRef.current?.body !== bodyKey) {
      keyRef.current = { body: bodyKey, key: createIdempotencyKey() };
    }
    try {
      const next = await apiClient.saveClientSubscription(
        relationshipId,
        body,
        keyRef.current.key,
      );
      keyRef.current = null;
      setSubscription(next);
      setDraft(next.coachingMode ?? null);
      if (next.coachingMode) onSaved(next.coachingMode);
      return true;
    } catch (err) {
      if (onEndedElsewhere(err)) return false;
      if (
        err instanceof ApiClientError &&
        err.code === "SUBSCRIPTION_VERSION_CONFLICT"
      ) {
        // Client settings or another tab saved a newer version first.
        keyRef.current = null;
        await load();
        setError(
          "The subscription changed while you were editing. Showing the latest. Pick the mode again.",
        );
        return false;
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save the coaching mode.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    dirty,
    draft,
    load,
    onEndedElsewhere,
    onSaved,
    relationshipId,
    saving,
    subscription,
  ]);

  const discard = useCallback(() => {
    setDraft(subscription?.coachingMode ?? null);
    setError(null);
  }, [subscription]);

  return {
    subscription,
    loading,
    loadFailed,
    draft,
    setDraft,
    dirty,
    saving,
    error,
    save,
    discard,
  };
}
