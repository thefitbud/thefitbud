/**
 * Error-reporting seam (D-W3-12). In a dev build it logs what a developer
 * needs to match a short error code to a cause: error name, a scrubbed
 * message and, for a ZodError, the issue paths. In a release build it
 * forwards to an installed reporter, or does nothing (mobile has no Sentry
 * yet; when added it is errors-only and plugs in through `setErrorReporter`).
 *
 * Never logs a token, refresh token, OTP code, password, email address,
 * request body or a zod `received` value (AGENTS.md: no sensitive data in
 * logs).
 */

export type ErrorReporter = (where: string, err: unknown) => void;

let reporter: ErrorReporter | null = null;

export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

export type ZodIssueSummary = {
  path: string;
  code: string;
  message: string;
};

type ZodLike = {
  name: string;
  issues: ReadonlyArray<{
    path?: ReadonlyArray<string | number>;
    code?: string;
    message?: string;
  }>;
};

export function isZodError(err: unknown): err is ZodLike {
  return (
    err instanceof Error &&
    err.name === "ZodError" &&
    Array.isArray((err as unknown as ZodLike).issues)
  );
}

/** Removes anything token-, code- or address-shaped from free text. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/[A-Za-z0-9_\-.+/=]{24,}/g, "[redacted]")
    .replace(/\b\d{6}\b/g, "[code]");
}

/** Path, code and message only. The zod `received` value is dropped. */
export function summarizeZodIssues(err: ZodLike): ZodIssueSummary[] {
  return err.issues.map((issue) => ({
    path: (issue.path ?? []).join("."),
    code: String(issue.code ?? "unknown"),
    message: scrub(String(issue.message ?? "").replace(/,?\s*received\b.*$/i, "")),
  }));
}

function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function reportError(where: string, err: unknown): void {
  if (isDev()) {
    if (isZodError(err)) {
      // ZodError.message is a JSON dump of the issues, so it is not logged.
      console.warn("[auth]", where, err.name, "response did not match schema", {
        zodIssues: summarizeZodIssues(err),
      });
    } else if (err instanceof Error) {
      console.warn("[auth]", where, err.name, scrub(err.message));
    } else {
      console.warn("[auth]", where, typeof err);
    }
    return;
  }
  try {
    reporter?.(where, err);
  } catch {
    // Reporting must never break the screen that called it.
  }
}
