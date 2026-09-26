import { useEffect, useRef } from "react";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { RealtimeEvent } from "@fitbud/contracts";

function toIdList(
  relationshipIds: string | readonly string[] | null | undefined,
): string[] {
  if (!relationshipIds) return [];
  if (typeof relationshipIds === "string") return [relationshipIds];
  return [...relationshipIds].filter((id) => id.length > 0);
}

/**
 * Thin realtime listener for one or more coaching relationships.
 * On each event, invoke onHint so the caller can refetch/sync.
 * Correctness must not depend on this hook — REST/sync remain authoritative.
 */
export function useRealtimeHints(
  api: FitBudApiClient,
  relationshipIds: string | readonly string[] | null | undefined,
  onHint: (event: RealtimeEvent) => void,
): void {
  const onHintRef = useRef(onHint);
  onHintRef.current = onHint;

  const ids = toIdList(relationshipIds);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) return;

    const subscriptions = ids.map((relationshipId) =>
      api.subscribeRealtime(relationshipId, {
        onEvent: (event) => {
          onHintRef.current(event);
        },
        onError: () => {
          // Socket failures are non-fatal; REST/sync remain the source of truth.
        },
      }),
    );

    return () => {
      for (const subscription of subscriptions) {
        subscription.close();
      }
    };
  }, [api, ids, idsKey]);
}
