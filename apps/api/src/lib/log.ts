/**
 * Structured API logging without sensitive payloads.
 *
 * Prohibited (Technical Architecture §14): identity tokens, session cookies,
 * passwords/secrets, full intake answers, trainer note content, signed file
 * URLs, photo contents, and unnecessary health/coaching details.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type SafeLogFields = {
  level: LogLevel;
  message: string;
  requestId?: string;
  operation?: string;
  method?: string;
  path?: string;
  status?: number;
  latencyMs?: number;
  actorType?: "trainer" | "trainee" | "anonymous" | "unknown";
  actorUserId?: string;
  surface?: string;
  authMethod?: string;
  relationshipId?: string;
  entityType?: string;
  entityId?: string;
  errorCode?: string;
  errorName?: string;
};

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "idtoken",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
  "token",
  "session",
  "answers",
  "notes",
  "note",
  "body",
  "uploadurl",
  "downloadurl",
  "signedurl",
  "objectkey",
  "photo",
  "content",
  "image",
]);

const SENSITIVE_SUBSTRING =
  /(authorization|bearer\s|cookie=|idtoken|password|secret|sig=|exp=|uploadurl|downloadurl|answers|notes)/i;

/** True when a field name must never appear in logs. */
export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.replace(/[_-]/g, "").toLowerCase());
}

/**
 * Recursively drop prohibited keys and scrub string values that look like
 * tokens or signed URLs. Safe identifiers (UUIDs, roles, codes) are kept.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (SENSITIVE_SUBSTRING.test(value)) return "[redacted]";
    if (value.length > 500) return `${value.slice(0, 64)}…[truncated]`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveLogKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactForLog(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function serializeSafeLog(fields: SafeLogFields): string {
  const payload = redactForLog({
    ...fields,
    ts: new Date().toISOString(),
  });
  return JSON.stringify(payload);
}

type ConsoleWriter = Pick<Console, "debug" | "info" | "warn" | "error">;

export function writeStructuredLog(
  fields: SafeLogFields,
  writer: ConsoleWriter = console,
): void {
  const line = serializeSafeLog(fields);
  switch (fields.level) {
    case "debug":
      writer.debug(line);
      break;
    case "warn":
      writer.warn(line);
      break;
    case "error":
      writer.error(line);
      break;
    default:
      writer.info(line);
  }
}

/** Strip query string values that may contain signed URL material. */
export function safeRequestPath(url: string): string {
  try {
    const parsed = new URL(url, "https://fitbud.local");
    const path = parsed.pathname;
    // Drop query entirely — signed media URLs put sig/exp in the query.
    return path;
  } catch {
    return "/";
  }
}
