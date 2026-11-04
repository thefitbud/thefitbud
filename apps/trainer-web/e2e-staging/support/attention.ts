import type { Page } from "@playwright/test";
import { apiGet } from "./fixtures.js";

type AttentionGroup = {
  relationshipId: string;
  items: Array<{ id: string; status: string }>;
};

const OPEN_STATUSES = new Set(["active", "detected"]);

/** Ids of the exceptions still open (not yet reviewed or resolved) for one client, from the API. */
export async function openExceptionIds(page: Page, relationshipId: string): Promise<string[]> {
  const { groups } = await apiGet<{ groups: AttentionGroup[] }>(
    page,
    "/exceptions/attention?groupBy=relationship",
  );
  return groups
    .filter((g) => g.relationshipId === relationshipId)
    .flatMap((g) => g.items)
    .filter((i) => OPEN_STATUSES.has(i.status))
    .map((i) => i.id);
}

export async function exceptionStatus(page: Page, exceptionId: string): Promise<string | undefined> {
  return (await apiGet<{ status?: string }>(page, `/exceptions/${exceptionId}`)).status;
}
