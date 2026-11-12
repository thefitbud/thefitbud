import {
  strengthReadModelSchema,
  type StrengthQuery,
  type StrengthReadModel,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";
import { queryString } from "./query-string.js";

declare module "./index.js" {
  interface FitBudApiClient {
    getStrength(
      relationshipId: string,
      query?: Partial<StrengthQuery>,
    ): Promise<StrengthReadModel>;
  }
}

export function installStrengthClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;
  proto.getStrength = async function getStrength(relationshipId, query) {
    const params = new URLSearchParams();
    if (query?.range) params.set("range", query.range);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    const suffix = queryString(params);
    return this.request(
      "GET",
      `/strength/relationships/${encodeURIComponent(relationshipId)}${suffix}`,
      strengthReadModelSchema,
      { auth: true },
    );
  };
}
