/**
 * Host guard for the staging suite (QT5).
 *
 * The suite signs in as a QA trainer and WRITES (resolves an exception, reviews a
 * check-in, adds a note: D-QA1-7), so it must never be pointed at anything but
 * staging, whatever an environment variable says. `resolveStagingBaseUrl` is called
 * when the Playwright config loads, so a wrong `STAGING_WEB_URL` stops the run before
 * a browser opens. `assertAllowedNavigation` is the runtime half: a staging page
 * that redirects elsewhere fails the test.
 *
 * Only exact matches pass. Look-alike hosts (`app-staging.thefitbud.com.evil.test`),
 * `user@host` URLs, other ports and plain http are all refused.
 */

export const STAGING_WEB_HOST = "app-staging.thefitbud.com";
export const STAGING_WEB_ORIGIN = `https://${STAGING_WEB_HOST}`;

/**
 * Local rehearsal escape hatch, for running these specs against a LOCAL API and seed
 * to check the selectors. It admits loopback hosts only (never a real domain), and
 * only when this exact variable is "1". A rehearsal is not a staging run and must be
 * labelled as such wherever its result is quoted.
 */
export const LOCAL_REHEARSAL_FLAG = "QA_STAGING_LOCAL_REHEARSAL";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export class HostGuardError extends Error {
  constructor(message: string) {
    super(`staging host guard: ${message}`);
    this.name = "HostGuardError";
  }
}

type Env = Record<string, string | undefined>;

/** True when the local-rehearsal flag is set to exactly "1". */
export function isLocalRehearsal(env: Env): boolean {
  return env[LOCAL_REHEARSAL_FLAG] === "1";
}

/**
 * The origin the suite may use. Unset `STAGING_WEB_URL` means the staging host.
 * Anything else throws. Error text names the host only, never the full URL, which
 * could carry credentials.
 */
export function resolveStagingBaseUrl(env: Env): string {
  const raw = env.STAGING_WEB_URL?.trim();
  if (!raw) return STAGING_WEB_ORIGIN;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HostGuardError("STAGING_WEB_URL is not a valid URL.");
  }

  if (url.username || url.password) {
    throw new HostGuardError("STAGING_WEB_URL must not carry credentials.");
  }
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new HostGuardError(
      "STAGING_WEB_URL must be a bare origin, with no path, query or fragment.",
    );
  }

  if (url.protocol === "https:" && url.hostname === STAGING_WEB_HOST && url.port === "") {
    return url.origin;
  }

  if (
    isLocalRehearsal(env) &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    (url.protocol === "http:" || url.protocol === "https:")
  ) {
    return url.origin;
  }

  throw new HostGuardError(
    `refusing to run against host "${url.hostname}". This suite only runs against ${STAGING_WEB_HOST}.`,
  );
}

/** Whether a URL the page navigated to stays on the allowed origin. */
export function isAllowedNavigation(url: string, baseOrigin: string): boolean {
  if (url === "about:blank") return true;
  try {
    return new URL(url).origin === new URL(baseOrigin).origin;
  } catch {
    return false;
  }
}

export function assertAllowedNavigation(url: string, baseOrigin: string): void {
  if (!isAllowedNavigation(url, baseOrigin)) {
    let host = "an unparseable URL";
    try {
      host = `"${new URL(url).hostname}"`;
    } catch {
      /* keep the generic text */
    }
    throw new HostGuardError(`the page navigated to ${host}, outside the allowed origin.`);
  }
}
