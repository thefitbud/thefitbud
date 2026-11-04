import type { ComponentType } from "react";
import type { Breadcrumb } from "@sentry/react-native";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Mobile crash reporting (BT2b, D-W4-6, D-W4-7).
 *
 * Staging and production builds report JS and native crashes when
 * `EXPO_PUBLIC_SENTRY_DSN` is set. Development and Expo web do not.
 * Tracing stays off (`tracesSampleRate: 0`). Source maps upload only from
 * production builds; that switch lives in `app.config.js`.
 */

const REPORTING_VARIANTS = new Set(["staging", "production"]);

/**
 * Field names that must not leave the device. Compared after lowercasing and
 * stripping non-alphanumerics, so `Authorization`, `body_fat` and `set-cookie`
 * match. `name` is included: a device name is often a person's name.
 *
 * Measurement types are the contract enum in `packages/contracts/src/progress.ts`
 * (`body_weight_kg`, `waist_cm`, `hip_cm`, `chest_cm`, `other`). Normalized
 * matching also catches camelCase (`bodyWeightKg`).
 *
 * A key that contains `name` is treated as a person's name (`clientName`,
 * `traineeName`, `displayName`). Technical keys stay: `filename`, `errorName`,
 * `routeName`, `screenName`, plus `name` on an exception and on a breadcrumb
 * (its category label).
 *
 * Free-text names cannot be detected reliably. Callers must not put a person's
 * name in an error message or exception value. Emails, Bearer tokens and URL
 * queries inside those strings are still removed.
 */
const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "cookies",
  "setcookie",
  "body",
  "requestbody",
  "responsebody",
  "querystring",
  "email",
  "emails",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "displayname",
  "username",
  "note",
  "notes",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "password",
  "otp",
  "secret",
  "ipaddress",
  "weight",
  "bodyfat",
  "bodyweight",
  "bmi",
  "steps",
  "heartrate",
  "sleep",
  "calories",
  "measurement",
  "measurements",
  "height",
  "waist",
  "chest",
  "hips",
  "bloodpressure",
  "bodyweightkg",
  "waistcm",
  "hipcm",
  "chestcm",
  "other",
]);

/** Keys that contain "name" but are not a person's name. */
const TECHNICAL_NAME_KEYS = new Set(["filename", "errorname", "routename", "screenname"]);

/** Request and breadcrumb fields whose value is a URL, absolute or relative. */
const URL_FIELDS = new Set(["url", "to", "from"]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /Bearer\s+\S+/gi;
const HTTP_URL = /https?:\/\/[^\s]+/gi;

type ScrubContext = {
  /** Key of this value on its parent, when it has one. */
  key?: string;
  /** `request` or `headers` when this value sits under that field. */
  parentKey?: string;
  /** Inside `exception` / `exceptions`, so an error's own `name` is kept. */
  inException: boolean;
  /** The breadcrumb object itself, so its category `name` is kept. */
  atBreadcrumbRoot: boolean;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string, context: ScrubContext): boolean {
  const normalized = normalizeKey(key);
  if (TECHNICAL_NAME_KEYS.has(normalized)) return false;
  if (normalized === "name" && (context.inException || context.atBreadcrumbRoot)) return false;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return normalized.includes("name");
}

/** Drop `?query` and `#fragment`, including when the fragment comes first. */
function stripQueryAndFragment(value: string): string {
  const query = value.indexOf("?");
  const hash = value.indexOf("#");
  let end = value.length;
  if (query !== -1) end = Math.min(end, query);
  if (hash !== -1) end = Math.min(end, hash);
  return value.slice(0, end);
}

function scrubString(value: string, key: string | undefined): string {
  const withoutSecrets = value.replace(EMAIL, "[email]").replace(BEARER, "Bearer [redacted]");
  if (key && URL_FIELDS.has(key.toLowerCase())) return stripQueryAndFragment(withoutSecrets);
  return withoutSecrets.replace(HTTP_URL, (match) => stripQueryAndFragment(match));
}

function scrubValue(value: unknown, context: ScrubContext, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value, context.key);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const entries =
      context.parentKey === "headers"
        ? value.filter(
            (entry) =>
              !(
                Array.isArray(entry) &&
                typeof entry[0] === "string" &&
                isSensitiveKey(entry[0], context)
              ),
          )
        : value;
    return entries.map((entry) =>
      scrubValue(entry, { ...context, key: undefined, atBreadcrumbRoot: false }, seen),
    );
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key, context)) continue;
    if (
      context.parentKey === "request" &&
      (key === "data" || key === "cookies" || key === "query_string")
    ) {
      continue;
    }
    const normalized = normalizeKey(key);
    const nextParent =
      normalized === "request" || normalized === "headers" ? normalized : undefined;
    out[key] = scrubValue(
      child,
      {
        key,
        parentKey: nextParent,
        inException: context.inException || normalized === "exception" || normalized === "exceptions",
        atBreadcrumbRoot: false,
      },
      seen,
    );
  }
  return out;
}

/** `beforeSend`: drop bodies, credentials, names, notes and health fields. */
export function scrubSentryEvent<T>(event: T): T {
  return scrubValue(event, { inException: false, atBreadcrumbRoot: false }, new WeakSet()) as T;
}

/** `beforeBreadcrumb`: the same rules, one breadcrumb at a time. */
export function scrubSentryBreadcrumb<T>(breadcrumb: T): T {
  return scrubValue(breadcrumb, { inException: false, atBreadcrumbRoot: true }, new WeakSet()) as T;
}

/**
 * Keep the literal `process.env.EXPO_PUBLIC_SENTRY_DSN` member expression.
 * Expo's Babel transform only inlines that exact form. The DSN is public by
 * design; an empty value means reporting stays off (local runs and tests).
 */
export function readSentryDsn(): string | undefined {
  const value = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** `app.config.js` copies `APP_VARIANT` into `extra.appVariant`. Unset means development. */
export function readAppVariant(): string {
  const extra = Constants.expoConfig?.extra as { appVariant?: unknown } | undefined;
  const variant = extra?.appVariant;
  if (typeof variant === "string" && variant.length > 0) return variant;
  return "development";
}

export function isSentryEnabled(input?: {
  variant?: string;
  platform?: string;
  dsn?: string | undefined;
}): boolean {
  const variant = input?.variant ?? readAppVariant();
  const platform = input?.platform ?? Platform.OS;
  const dsn = input && "dsn" in input ? input.dsn : readSentryDsn();
  if (platform === "web") return false;
  if (!REPORTING_VARIANTS.has(variant)) return false;
  return typeof dsn === "string" && dsn.trim().length > 0;
}

/**
 * Same shape the native upload uses (`applicationId@version+build`, dist = build).
 * Version and build come from the binary Expo embedded; the config version is
 * the fallback when a binary has not stamped them yet.
 */
export function sentryRelease(platform: string = Platform.OS): { release: string; dist: string } {
  const nativeVersion = Constants.nativeAppVersion;
  const version =
    (typeof nativeVersion === "string" && nativeVersion.trim()) ||
    Constants.expoConfig?.version ||
    "0.0.0";
  const nativeBuild = Constants.nativeBuildVersion;
  const dist = (typeof nativeBuild === "string" && nativeBuild.trim()) || "0";
  const applicationId =
    platform === "android"
      ? Constants.expoConfig?.android?.package
      : Constants.expoConfig?.ios?.bundleIdentifier;
  const release =
    typeof applicationId === "string" && applicationId.length > 0
      ? `${applicationId}@${version}+${dist}`
      : `${version}+${dist}`;
  return { release, dist };
}

/** Starts the SDK when this build should report. Returns whether it started. */
export function initSentry(): boolean {
  if (!isSentryEnabled()) return false;
  const dsn = readSentryDsn();
  if (!dsn) return false;
  const { release, dist } = sentryRelease();
  Sentry.init({
    dsn,
    environment: readAppVariant(),
    release,
    dist,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    beforeBreadcrumb(breadcrumb: Breadcrumb) {
      return scrubSentryBreadcrumb(breadcrumb);
    },
  });
  return true;
}

/** `Sentry.wrap` around the root component so render errors are reported. */
export function wrapWithSentry<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  return Sentry.wrap(component);
}
