import {
  bulkResolveExceptionsRequestSchema,
  bulkResolveExceptionsResponseSchema,
  bulkUndoRequestSchema,
  bulkUndoResponseSchema,
  type BulkResolveExceptionsRequest,
  type BulkResolveExceptionsResponse,
  type BulkUndoResponse,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

// W6 Z6-10: bulk Resolve for one client's compatible exceptions, with undo.
declare module "./index.js" {
  interface FitBudApiClient {
    /** POST /exceptions/bulk/resolve. One result per requested id. */
    bulkResolveExceptions(
      body: BulkResolveExceptionsRequest,
      idempotencyKey: string,
    ): Promise<BulkResolveExceptionsResponse>;
    /** POST /exceptions/bulk/undo. Only within 5 s of the bulk resolve. */
    undoBulkResolveExceptions(
      bulkId: string,
      idempotencyKey: string,
    ): Promise<BulkUndoResponse>;
  }
}

export function installExceptionBulkClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;

  proto.bulkResolveExceptions = async function bulkResolveExceptions(
    this: FitBudApiClient,
    body: BulkResolveExceptionsRequest,
    idempotencyKey: string,
  ) {
    const parsed = bulkResolveExceptionsRequestSchema.parse(body);
    return this.request(
      "POST",
      "/exceptions/bulk/resolve",
      bulkResolveExceptionsResponseSchema,
      { auth: true, body: parsed, idempotencyKey },
    );
  };

  proto.undoBulkResolveExceptions = async function undoBulkResolveExceptions(
    this: FitBudApiClient,
    bulkId: string,
    idempotencyKey: string,
  ) {
    const parsed = bulkUndoRequestSchema.parse({ bulkId });
    return this.request("POST", "/exceptions/bulk/undo", bulkUndoResponseSchema, {
      auth: true,
      body: parsed,
      idempotencyKey,
    });
  };
}
