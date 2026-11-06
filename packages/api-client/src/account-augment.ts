import {
  accountDeletionResponseSchema,
  accountReactivationResponseSchema,
  accountStatusResponseSchema,
  type AccountDeletionResponse,
  type AccountReactivationResponse,
  type AccountStatusResponse,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

// W6 Z6-14: account deletion (archive for 6 months), status and reactivation.
declare module "./index.js" {
  interface FitBudApiClient {
    /**
     * POST /account/deletion. Needs a sign-in within the last 5 minutes
     * (403 RECENT_SIGN_IN_REQUIRED otherwise); a trainer with active clients
     * gets 409 ACTIVE_CLIENTS.
     */
    deleteAccount(): Promise<AccountDeletionResponse>;
    /** GET /account/status. Answers while the account is archived. */
    getAccountStatus(): Promise<AccountStatusResponse>;
    /** POST /account/reactivation. Needs a sign-in after the deletion; relationships stay ended. */
    reactivateAccount(): Promise<AccountReactivationResponse>;
  }
}

export function installAccountClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;

  proto.deleteAccount = async function deleteAccount(this: FitBudApiClient) {
    return this.request("POST", "/account/deletion", accountDeletionResponseSchema, {
      auth: true,
    });
  };

  proto.getAccountStatus = async function getAccountStatus(this: FitBudApiClient) {
    return this.request("GET", "/account/status", accountStatusResponseSchema, {
      auth: true,
    });
  };

  proto.reactivateAccount = async function reactivateAccount(this: FitBudApiClient) {
    return this.request(
      "POST",
      "/account/reactivation",
      accountReactivationResponseSchema,
      { auth: true },
    );
  };
}
