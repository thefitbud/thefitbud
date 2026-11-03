/**
 * Error-reporting seam (D-W3-12), sanitising at the reporter boundary (CU5).
 *
 * `reportError` never hands a raw error to anything that could leave the
 * device. It first reduces the thrown value to a `SanitisedError`: an
 * allow-list of fields (name, message, code, status, requestId, `details` key
 * names, zod issue summaries, stack, cause chain), every string of which has
 * been through `scrub`. In a dev build it logs a subset of that same object;
 * in a release build it passes the whole object to the installed reporter.
 *
 * Never logs or reports a token, refresh token, OTP code, password, email
 * address, request body, `details` value or a zod `received` value
 * (AGENTS.md: no sensitive data in errors, logs, notifications or analytics).
 *
 * ## Reporter contract (for BT2b, W4)
 *
 * The signature is unchanged — `ErrorReporter = (where: string, err: unknown)
 * => void` — so a Sentry adapter installs with `setErrorReporter` exactly as
 * before. What changed is the *value* of the second argument: it is now
 * always a plain, JSON-serialisable `SanitisedError`, never the caught error.
 * An adapter should narrow with `isSanitisedError(err)` and map the fields it
 * wants onto its own payload rather than expecting an `Error` instance.
 * `SanitisedError.stack` is a scrubbed, line-capped stack string suitable for
 * grouping; `cause` is the sanitised cause chain.
 *
 * Why the boundary builds a new object instead of scrubbing an `Error` in
 * place:
 * - The input is never stringified, and `toString`/`toJSON` on it are never
 *   called, so an override on the thrown value cannot smuggle text past the
 *   scrubber or throw mid-report.
 * - Every property read goes through a guard, so a throwing getter cannot
 *   break reporting; and only allow-listed names are read at all, so an extra
 *   own property (`err.token = …`) is never forwarded, enumerable or not.
 * - The cause chain is depth-limited and cycle-aware.
 */

/**
 * The reporter is given a `SanitisedError`, not the caught error. The type
 * stays `(where, err: unknown)` so BT2b's adapter plugs in unchanged.
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

/** Everything a reporter is ever given. Every string here is scrubbed. */
export type SanitisedError = {
  /** Always present, so a reporter can group on it. */
  name: string;
  /** Scrubbed message. Empty for a non-`Error` input. */
  message: string;
  /** `typeof` the input when it was not an `Error` (e.g. "object", "string"). */
  kind?: string;
  /** `ApiClientError.code`. */
  code?: string;
  /** `ApiClientError.status`. */
  status?: number;
  /** `ApiClientError.requestId`. */
  requestId?: string;
  /** Key *names* from `ApiClientError.details`. Values are never forwarded. */
  detailKeys?: string[];
  /** Path, code and message per zod issue. The `received` value is dropped. */
  zodIssues?: ZodIssueSummary[];
  /** Scrubbed, line-capped stack, for grouping. */
  stack?: string;
  /** Sanitised `cause` chain, depth-limited. */
  cause?: SanitisedError;
};

type ZodLike = {
  name: string;
  issues: ReadonlyArray<{
    path?: ReadonlyArray<string | number>;
    code?: string;
    message?: string;
  }>;
};

/** Total: a throwing `name` or `issues` getter answers `false`, not a crash. */
export function isZodError(err: unknown): err is ZodLike {
  try {
    return (
      err instanceof Error &&
      err.name === "ZodError" &&
      Array.isArray((err as unknown as ZodLike).issues)
    );
  } catch {
    return false;
  }
}

/** True for a value produced by `sanitiseError`. For BT2b's adapter. */
export function isSanitisedError(value: unknown): value is SanitisedError {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Error) &&
    typeof (value as SanitisedError).name === "string" &&
    typeof (value as SanitisedError).message === "string"
  );
}

/**
 * A named secret and its value inside free text: `token: "…"`,
 * `"refresh_token":'…'`, `password=hunter2`. A zod message is a JSON dump of
 * its issues and an API message can quote a field, so this is the main
 * surface — and it is the only rule that catches a short, innocuous-looking
 * secret such as a one-word password.
 */
const SECRET_PAIR =
  /(["']?\b(?:access[-_]?token|api[-_]?key|authorization|code|cookie|current[-_]?password|id[-_]?token|new[-_]?password|otp(?:[-_]?code)?|pass[-_]?code|password|pin|proof|refresh[-_]?token|reset[-_]?proof|secret|session(?:[-_]?token)?|set[-_]?cookie|token[-_]?kind|token|verification[-_]?code)\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}\])&]+)/gi;

/** `Bearer <anything>`, quoted or bare. */
const BEARER = /\bbearer\s+("[^"]*"|'[^']*'|[^\s,;}\])&]+)/gi;

/** Three base64url segments: a JWT, with or without the `Bearer ` prefix. */
const JWT = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const EMAIL = /[^\s@"'<>,;]+@[^\s@"'<>,;]+\.[^\s@"'<>,;]+/g;

/** Any long opaque run: tokens, hashes, UUIDs, signed-URL fragments. */
const LONG_OPAQUE = /[A-Za-z0-9_\-.+/=]{24,}/g;

/**
 * Six or more consecutive digits: an OTP code, including one sitting next to
 * other digits, which a `\b\d{6}\b` rule would miss.
 */
const DIGIT_RUN = /\d{6,}/g;

/**
 * Removes anything address-, token-, secret- or code-shaped from free text.
 * Order matters: named secrets first, because their values can be short and
 * otherwise unremarkable, then shapes, then long runs and digit runs.
 */
export function scrub(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(SECRET_PAIR, "$1[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[redacted]")
    .replace(LONG_OPAQUE, "[redacted]")
    .replace(DIGIT_RUN, "[code]");
}

/**
 * Text from an untrusted value without ever invoking its `toString`. An
 * object — which could override `toString` or `toJSON` — becomes its type
 * only.
 */
function asText(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "undefined":
      return "";
    default:
      return `[${typeof value}]`;
  }
}

/** A property read that survives a throwing getter or a hostile proxy. */
function read(source: object, key: string): unknown {
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Scrubbed text for a property, or `undefined` when there is nothing to say. */
function readScrubbed(source: object, key: string): string | undefined {
  const text = asText(read(source, key));
  return text === "" ? undefined : scrub(text);
}

const MAX_CAUSE_DEPTH = 4;
const MAX_STACK_LINES = 20;
const MAX_DETAIL_KEYS = 20;
const MAX_ZOD_ISSUES = 50;
const MAX_PATH_SEGMENTS = 20;

/** Path, code and message only. The zod `received` value is dropped. */
export function summarizeZodIssues(err: ZodLike): ZodIssueSummary[] {
  const issues = read(err, "issues");
  if (!Array.isArray(issues)) return [];
  return issues.slice(0, MAX_ZOD_ISSUES).map((issue) => {
    const raw: object = typeof issue === "object" && issue !== null ? issue : {};
    const path = read(raw, "path");
    const segments = Array.isArray(path) ? path.slice(0, MAX_PATH_SEGMENTS).map(asText) : [];
    return {
      path: scrub(segments.join(".")),
      code: scrub(asText(read(raw, "code")) || "unknown"),
      message: scrub(asText(read(raw, "message")).replace(/,?\s*received\b.*$/i, "")),
    };
  });
}

/**
 * Key names only. A `details` value may be a token, a password or an intake
 * answer, so nothing from it is ever forwarded.
 */
function detailKeysOf(err: object): string[] | undefined {
  const details = read(err, "details");
  if (typeof details !== "object" || details === null) return undefined;
  let keys: string[];
  try {
    keys = Object.keys(details as Record<string, unknown>);
  } catch {
    return undefined;
  }
  if (keys.length === 0) return undefined;
  return keys.slice(0, MAX_DETAIL_KEYS).map((key) => scrub(key));
}

/**
 * Frames only, under a sanitised header. A stack begins with
 * `Name: message`, and for a ZodError that header is the JSON dump of the
 * issues (`received` values and all), so the raw header is removed outright
 * rather than trusted to the scrubber; whatever is left is scrubbed anyway.
 *
 * Reading `.stack` can run V8's lazy stack formatting, which stringifies the
 * message — so an attacker-controlled `toString` may run here. It cannot
 * throw out (`read` guards it) and cannot smuggle text out (the result is
 * scrubbed), but nothing above this line ever calls it.
 */
function scrubStack(err: object, name: string, message: string): string | undefined {
  const stack = read(err, "stack");
  if (typeof stack !== "string" || stack === "") return undefined;
  const rawHeaders = [
    `${asText(read(err, "name"))}: ${asText(read(err, "message"))}`,
    asText(read(err, "message")),
  ];
  let tail = stack;
  for (const header of rawHeaders) {
    if (header !== "" && header !== ": " && tail.startsWith(header)) {
      tail = tail.slice(header.length);
      break;
    }
  }
  const frames = scrub(tail)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(0, MAX_STACK_LINES);
  return [`${name}: ${message}`, ...frames].join("\n");
}

/**
 * Reduces any thrown value to the allow-listed, fully scrubbed shape that the
 * reporter and the dev log both read. It never throws, and it never returns
 * anything derived from a property it did not explicitly read.
 */
export function sanitiseError(
  err: unknown,
  depth = 0,
  seen: Set<unknown> = new Set(),
): SanitisedError {
  if (!(err instanceof Error)) {
    // `typeof null` is "object", as the dev log has always reported it.
    return { name: "NonError", message: "", kind: typeof err };
  }
  if (seen.has(err)) return { name: "Cycle", message: "" };
  seen.add(err);

  const zod = isZodError(err);
  const out: SanitisedError = {
    name: scrub(asText(read(err, "name")) || "Error"),
    // A ZodError's message is a JSON dump of its issues, including `received`
    // values; the summaries carry the useful part, so the dump is dropped
    // rather than scrubbed.
    message: zod ? "response did not match schema" : scrub(asText(read(err, "message"))),
  };

  const code = readScrubbed(err, "code");
  if (code !== undefined) out.code = code;
  const status = read(err, "status");
  if (typeof status === "number" && Number.isFinite(status)) out.status = status;
  const requestId = readScrubbed(err, "requestId");
  if (requestId !== undefined) out.requestId = requestId;
  const detailKeys = detailKeysOf(err);
  if (detailKeys !== undefined) out.detailKeys = detailKeys;
  if (zod) out.zodIssues = summarizeZodIssues(err);
  const stack = scrubStack(err, out.name, out.message);
  if (stack !== undefined) out.stack = stack;

  const cause = read(err, "cause");
  if (cause !== undefined && cause !== null && depth < MAX_CAUSE_DEPTH) {
    out.cause = sanitiseError(cause, depth + 1, seen);
  }

  return out;
}

function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function reportError(where: string, err: unknown): void {
  let safe: SanitisedError;
  try {
    safe = sanitiseError(err);
  } catch {
    // Unreachable by construction: `sanitiseError` guards every read. Kept so
    // that a reporter can never see a raw error, whatever the input does.
    safe = { name: "Unsanitisable", message: "" };
  }

  if (isDev()) {
    if (safe.zodIssues !== undefined) {
      console.warn("[auth]", where, safe.name, "response did not match schema", {
        zodIssues: safe.zodIssues,
      });
    } else if (err instanceof Error) {
      console.warn("[auth]", where, safe.name, safe.message);
    } else {
      console.warn("[auth]", where, safe.kind ?? typeof err);
    }
    return;
  }
  try {
    reporter?.(where, safe);
  } catch {
    // Reporting must never break the screen that called it.
  }
}
