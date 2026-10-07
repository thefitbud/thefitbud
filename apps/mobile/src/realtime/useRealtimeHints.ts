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
 * Thin realtime listener. Events are refetch/sync hints only.
 * Offline and REST paths remain correct when the socket is unavailable.
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
          // Non-fatal — pull sync / REST continue to work.
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
