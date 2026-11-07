import {
  putStepsDayResponseSchema,
  putStepsTargetResponseSchema,
  stepsRangeResponseSchema,
  stepsTodayResponseSchema,
  type PutStepsDayRequest,
  type PutStepsDayResponse,
  type PutStepsTargetResponse,
  type StepsRange,
  type StepsRangeResponse,
  type StepsTodayResponse,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

declare module "./index.js" {
  interface FitBudApiClient {
    putStepsDay(
      localDate: string,
      body: PutStepsDayRequest,
    ): Promise<PutStepsDayResponse>;
    getStepsToday(): Promise<StepsTodayResponse>;
    getClientSteps(
      relationshipId: string,
      range?: StepsRange,
    ): Promise<StepsRangeResponse>;
    putClientStepsTarget(
      relationshipId: string,
      target: number,
    ): Promise<PutStepsTargetResponse>;
  }
}

export function installStepsClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;
  proto.putStepsDay = async function putStepsDay(localDate, body) {
    return this.request(
      "PUT",
      `/me/steps/days/${encodeURIComponent(localDate)}`,
      putStepsDayResponseSchema,
      { auth: true, body },
    );
  };
  proto.getStepsToday = async function getStepsToday() {
    return this.request("GET", "/me/steps/today", stepsTodayResponseSchema, {
      auth: true,
    });
  };
  proto.getClientSteps = async function getClientSteps(relationshipId, range) {
    const suffix = range ? `?range=${encodeURIComponent(range)}` : "";
    return this.request(
      "GET",
      `/steps/relationships/${encodeURIComponent(relationshipId)}${suffix}`,
      stepsRangeResponseSchema,
      { auth: true },
    );
  };
  proto.putClientStepsTarget = async function putClientStepsTarget(
    relationshipId,
    target,
  ) {
    return this.request(
      "PUT",
      `/steps/relationships/${encodeURIComponent(relationshipId)}/target`,
      putStepsTargetResponseSchema,
      { auth: true, body: { target } },
    );
  };
}
