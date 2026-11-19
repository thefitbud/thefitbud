import { ApiClientError } from "@fitbud/api-client";
import { accountArchivedErrorDetailsSchema } from "@fitbud/contracts";

/** 403 ACCOUNT_ARCHIVED with a parseable purge date (Z6-14 / Z12-30). */
export function archivedPurgeAfter(error: unknown): string | null {
  if (
    !(error instanceof ApiClientError) ||
    error.status !== 403 ||
    error.code !== "ACCOUNT_ARCHIVED"
  ) {
    return null;
  }
  const details = accountArchivedErrorDetailsSchema.safeParse(error.details);
  return details.success ? details.data.purgeAfter : null;
}
