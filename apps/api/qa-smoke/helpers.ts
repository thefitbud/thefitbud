/** Small shared helpers for the smoke files (QT6). */
import { meResponseSchema, type MeResponse } from "@fitbud/contracts";
import type { z } from "zod";
import { ACCOUNT_KEYS, loadRun, loadStable, localDateIn, type AccountKey } from "./expectations.js";
import { dataOf, errorOf, newIdempotencyKey, type RawResponse, type SmokeHttp } from "./http.js";
import type { LiveSession } from "./run-context.js";

export const stable = loadStable();
export const run = loadRun();

export { ACCOUNT_KEYS, dataOf, errorOf, newIdempotencyKey };

export function auth(session: LiveSession): { token: string; role: "trainer" | "trainee" } {
  return { token: session.token, role: session.role };
}

export function send(
  http: SmokeHttp,
  session: LiveSession,
  method: string,
  path: string,
  extra: { body?: unknown; idempotencyKey?: string } = {},
): Promise<RawResponse> {
  return http.request(method, path, { ...auth(session), ...extra });
}

/** GET a path as `session` and parse the `{ data }` envelope with a contract schema. */
export async function getData<S extends z.ZodTypeAny>(
  http: SmokeHttp,
  session: LiveSession,
  path: string,
  schema: S,
): Promise<z.infer<S>> {
  return dataOf(await send(http, session, "GET", path), schema);
}

export function getMe(http: SmokeHttp, session: LiveSession): Promise<MeResponse> {
  return getData(http, session, "/me", meResponseSchema);
}

/** Today's calendar date in the account's own time zone, from the server's `/me`. */
export async function localToday(http: SmokeHttp, session: LiveSession): Promise<string> {
  return localDateIn((await getMe(http, session)).timezone);
}

export function relationshipIdOf(key: AccountKey): string {
  const id = stable.accounts[key].relationshipId;
  if (!id) throw new Error(`The QA expectations have no relationshipId for "${key}".`);
  return id;
}
