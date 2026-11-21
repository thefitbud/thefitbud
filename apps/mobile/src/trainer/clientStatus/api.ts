import type { FitBudApiClient } from "@fitbud/api-client";
import type { ResponsivenessResponse, WeekReadModel } from "@fitbud/contracts";

/**
 * Stage 1 methods this screen uses. They are installed on the client by
 * stage1-augment but are not on its public type; `lib/stage1Api.ts` is not
 * owned by this task, so the narrow type lives here.
 */
export type ClientStatusApi = FitBudApiClient & {
  getWorkspaceWeek(relationshipId: string, start?: string): Promise<WeekReadModel>;
  getResponsiveness(relationshipId: string, days?: number): Promise<ResponsivenessResponse>;
  requestReactivation(
    relationshipId: string,
    body: { intakeUpdateRequested?: boolean },
    idempotencyKey: string,
  ): Promise<{ requestId: string; status: "pending" }>;
};

export function clientStatusApi(client: FitBudApiClient): ClientStatusApi {
  return client as ClientStatusApi;
}
