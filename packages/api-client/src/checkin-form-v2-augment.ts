import {
  progressMetricsResponseSchema,
  type ProgressMetricsQuery,
  type ProgressMetricsResponse,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

// W6 Z6-7: progress series by check-in question key.
declare module "./index.js" {
  interface FitBudApiClient {
    /**
     * GET /progress/relationships/:id/metrics. One or two keys; `from` and `to`
     * go with range "custom". 422 for an unknown key or a bad range.
     */
    getProgressMetrics(
      relationshipId: string,
      query: ProgressMetricsQuery,
    ): Promise<ProgressMetricsResponse>;
  }
}

export function installCheckinFormV2ClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;
  proto.getProgressMetrics = async function getProgressMetrics(
    this: FitBudApiClient,
    relationshipId,
    query,
  ) {
    const params = new URLSearchParams();
    params.set("keys", query.keys.join(","));
    if (query.range) params.set("range", query.range);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    return this.request(
      "GET",
      `/progress/relationships/${encodeURIComponent(relationshipId)}/metrics?${params.toString()}`,
      progressMetricsResponseSchema,
      { auth: true },
    );
  };
}
