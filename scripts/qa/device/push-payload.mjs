#!/usr/bin/env node
// Builds a push in the exact shape the app receives in production, for the device gate
// (Z12-35, prompt §2 Z12-35 step 4).
//
//   node scripts/qa/device/push-payload.mjs --platform ios     --type <notificationType> [--entity-type <t>] [--entity-id <uuid>]
//   node scripts/qa/device/push-payload.mjs --platform android --type <notificationType> [...]
//
// Where the shape comes from:
//   * the routing payload is `pushPayloadSchema` (packages/contracts/src/notification.ts):
//     notificationId, notificationType, domainEntityType, domainEntityId, createdAt —
//     ids only, no coaching detail. It is validated with the real schema when the
//     workspace packages are built (they are on the runner), so a contract change
//     breaks this script, not a device run.
//   * the visible text is what apps/api/src/lib/expo-push.ts sends: title "FitBud",
//     body = the notification type's label (labelFor("notification_type", type)).
//   * the envelope is Expo's, because the API sends through the Expo Push Service and
//     expo-notifications reads it back: on iOS the data travels as the APNs `body` key
//     next to `aps`; on Android as an FCM data message whose `body` is that JSON as a
//     string, with `title` and `message` beside it.
//
// iOS output is a file for `xcrun simctl push` (it carries "Simulator Target Bundle").
// Android output is the flat FCM data map; push.sh turns it into broadcast extras.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../..");

export const APP_ID = "com.thefitbud.mobile.staging";
/** `owner/slug` from apps/mobile/app.json; Expo's push envelope names the project with it. */
export const EXPO_EXPERIENCE = "@tech-fitbuds-team/thefitbud";

/** Default entity per type, matching what the API attaches (see routing.ts). */
const DEFAULT_ENTITY = {
  workout_reminder: "workout_assignment",
  meal_reminder: "meal_assignment",
  checkin_reminder: "checkin",
  checkin_reviewed: "checkin",
  trainer_checkin_submitted: "checkin",
};

async function loadPackages() {
  try {
    const contracts = await import(pathToFileURL(path.join(REPO, "packages/contracts/dist/index.js")).href);
    const core = await import(pathToFileURL(path.join(REPO, "packages/core/dist/index.js")).href);
    return { contracts, core };
  } catch {
    return null;
  }
}

/** The routing payload (`pushPayloadSchema`) plus the visible text. */
export async function buildRouting({ type, entityType, entityId, now = new Date() }) {
  if (!type) throw new Error("--type is required (a notificationType, e.g. daily_summary)");
  const routing = {
    notificationId: crypto.randomUUID(),
    notificationType: type,
    domainEntityType: entityType ?? DEFAULT_ENTITY[type] ?? "coaching_relationship",
    domainEntityId: entityId ?? crypto.randomUUID(),
    createdAt: now.toISOString(),
  };
  const pkgs = await loadPackages();
  let body = type.replace(/_/g, " ");
  let contract = "unchecked (workspace packages not built)";
  if (pkgs) {
    const parsed = pkgs.contracts.pushPayloadSchema.safeParse(routing);
    if (!parsed.success) {
      throw new Error(`not a valid push payload: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    body = pkgs.core.labelFor("notification_type", type);
    contract = "pushPayloadSchema";
  }
  return { routing, title: "FitBud", body, contract };
}

/** The APNs payload `xcrun simctl push` delivers, in Expo's envelope. */
export function iosPayload({ routing, title, body }) {
  return {
    "Simulator Target Bundle": APP_ID,
    aps: { alert: { title, body }, sound: "default" },
    body: routing,
    experienceId: EXPO_EXPERIENCE,
    scopeKey: EXPO_EXPERIENCE,
  };
}

/** The FCM data map Expo sends to Android (all values are strings). */
export function androidData({ routing, title, body }) {
  return {
    title,
    message: body,
    body: JSON.stringify(routing),
    experienceId: EXPO_EXPERIENCE,
    scopeKey: EXPO_EXPERIENCE,
    sound: "default",
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--platform", "--type", "--entity-type", "--entity-id"].includes(a)) args[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!["ios", "android"].includes(args.platform)) throw new Error("--platform must be ios or android");
  return args;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const built = await buildRouting({ type: args.type, entityType: args["entity-type"], entityId: args["entity-id"] });
  const out = args.platform === "ios" ? iosPayload(built) : androidData(built);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  console.error(`push-payload: ${args.platform} ${args.type} (${built.contract})`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(`push-payload: ${err.message}`);
      process.exitCode = 2;
    },
  );
}
