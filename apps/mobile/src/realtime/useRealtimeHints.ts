import { useEffect, useRef } from "react";
import type { FitBudApiClient } from "@fitbud/api-client";
import type { RealtimeEvent } from "@fitbud/contracts";

/**
 * One sorted, de-duplicated id per relationship. Sorted so that a caller
 * rebuilding its list in a different order does not look like a different set
 * and churn every socket; de-duplicated so a repeated id opens one socket, not
 * two.
 */
function toIdList(
  relationshipIds: string | readonly string[] | null | undefined,
): string[] {
  if (!relationshipIds) return [];
  const ids =
    typeof relationshipIds === "string" ? [relationshipIds] : [...relationshipIds];
  return [...new Set(ids.filter((id) => id.length > 0))].sort();
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

  // Only the joined key is a dependency: callers pass a fresh array each
  // render, so depending on the array itself tore every socket down and
  // reopened it on each render.
  const idsKey = toIdList(relationshipIds).join(",");

  useEffect(() => {
    const ids = idsKey.length === 0 ? [] : idsKey.split(",");
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
  }, [api, idsKey]);
}
