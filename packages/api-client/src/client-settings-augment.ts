import {
  clientSettingsResponseSchema,
  clientSettingsSubscriptionSchema,
  createPaymentRecordRequestSchema,
  paymentRecordSchema,
  putClientSubscriptionRequestSchema,
  updatePaymentRecordRequestSchema,
  type ClientSettingsResponse,
  type ClientSettingsSubscription,
  type CreatePaymentRecordRequest,
  type PaymentRecord,
  type PutClientSubscriptionRequest,
  type UpdatePaymentRecordRequest,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

// W6 Z6-8: client settings (subscription edit and payment records, tracking only).
declare module "./index.js" {
  interface FitBudApiClient {
    /** GET /client-settings/relationships/:id. */
    getClientSettings(relationshipId: string): Promise<ClientSettingsResponse>;
    /** PUT /client-settings/relationships/:id/subscription. Creates version N+1. */
    saveClientSubscription(
      relationshipId: string,
      body: PutClientSubscriptionRequest,
      idempotencyKey: string,
    ): Promise<ClientSettingsSubscription>;
    /** POST /client-settings/relationships/:id/payments. */
    createPaymentRecord(
      relationshipId: string,
      body: CreatePaymentRecordRequest,
      idempotencyKey: string,
    ): Promise<PaymentRecord>;
    /** PATCH /client-settings/relationships/:id/payments/:paymentId. */
    updatePaymentRecord(
      relationshipId: string,
      paymentId: string,
      body: UpdatePaymentRecordRequest,
      idempotencyKey: string,
    ): Promise<PaymentRecord>;
  }
}

function base(relationshipId: string): string {
  return `/client-settings/relationships/${encodeURIComponent(relationshipId)}`;
}

export function installClientSettingsClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;

  proto.getClientSettings = async function getClientSettings(
    this: FitBudApiClient,
    relationshipId: string,
  ) {
    return this.request("GET", base(relationshipId), clientSettingsResponseSchema, {
      auth: true,
    });
  };

  proto.saveClientSubscription = async function saveClientSubscription(
    this: FitBudApiClient,
    relationshipId: string,
    body: PutClientSubscriptionRequest,
    idempotencyKey: string,
  ) {
    const parsed = putClientSubscriptionRequestSchema.parse(body);
    return this.request(
      "PUT",
      `${base(relationshipId)}/subscription`,
      clientSettingsSubscriptionSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  };

  proto.createPaymentRecord = async function createPaymentRecord(
    this: FitBudApiClient,
    relationshipId: string,
    body: CreatePaymentRecordRequest,
    idempotencyKey: string,
  ) {
    const parsed = createPaymentRecordRequestSchema.parse(body);
    return this.request("POST", `${base(relationshipId)}/payments`, paymentRecordSchema, {
      auth: true,
      body: parsed,
      idempotencyKey,
    });
  };

  proto.updatePaymentRecord = async function updatePaymentRecord(
    this: FitBudApiClient,
    relationshipId: string,
    paymentId: string,
    body: UpdatePaymentRecordRequest,
    idempotencyKey: string,
  ) {
    const parsed = updatePaymentRecordRequestSchema.parse(body);
    return this.request(
      "PATCH",
      `${base(relationshipId)}/payments/${encodeURIComponent(paymentId)}`,
      paymentRecordSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  };
}
