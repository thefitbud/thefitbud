/**
 * Host guard for the staging API smoke suite (QT6).
 *
 * The suite signs in as the QA accounts and writes to them, so it must be impossible
 * to aim it at production by a stray `STAGING_API_URL`. The rule is an allowlist, not
 * a production denylist: a new host name is refused until someone adds it here.
 *
 *   - `https://api-staging.thefitbud.com` (no port, no credentials, no path), or
 *   - `http(s)://127.0.0.1[:port]` / `http(s)://localhost[:port]` for a local API.
 *
 * `guardBaseUrl` checks the configured base URL once. `guardRequestUrl` checks every
 * request again at the point of sending (see `http.ts`), so a bad path or an
 * absolute URL handed to a helper cannot leave the allowed origin either.
 *
 * Error messages name the offending host only. They never echo the full URL, which
 * could carry credentials, and this suite's output is published.
 */

export const STAGING_API_HOST = "api-staging.thefitbud.com";
export const DEFAULT_STAGING_API_URL = `https://${STAGING_API_HOST}`;
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

export class HostGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostGuardError";
  }
}

export type GuardedTarget = {
  /** Origin only, no trailing slash. */
  baseUrl: string;
  kind: "staging" | "local";
};

function parse(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new HostGuardError("The API URL is not a valid absolute URL.");
  }
}

function classify(url: URL): GuardedTarget["kind"] {
  if (url.username !== "" || url.password !== "") {
    throw new HostGuardError("The API URL must not contain credentials.");
  }
  if (url.hostname === STAGING_API_HOST) {
    if (url.protocol !== "https:") {
      throw new HostGuardError(`${STAGING_API_HOST} must be called over https.`);
    }
    if (url.port !== "") {
      throw new HostGuardError(`${STAGING_API_HOST} must be called on the default port.`);
    }
    return "staging";
  }
  if (LOCAL_HOSTS.has(url.hostname)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new HostGuardError("A local API URL must use http or https.");
    }
    return "local";
  }
  throw new HostGuardError(
    `Refusing to run the QA smoke suite against host "${url.hostname}". ` +
      `Allowed: ${STAGING_API_HOST}, 127.0.0.1, localhost.`,
  );
}

/** Validates the configured base URL and returns its normalised origin. */
export function guardBaseUrl(raw: string): GuardedTarget {
  const url = parse(raw.trim());
  const kind = classify(url);
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new HostGuardError("The API URL must be an origin only (no path, query or fragment).");
  }
  return { baseUrl: url.origin, kind };
}

/** Validates one outgoing request URL against the same rules and the target origin. */
export function guardRequestUrl(raw: string | URL, target: GuardedTarget): URL {
  const url = typeof raw === "string" ? parse(raw) : new URL(raw.href);
  classify(url);
  if (url.origin !== target.baseUrl) {
    throw new HostGuardError(`Request origin "${url.host}" is not the configured API origin.`);
  }
  return url;
}
