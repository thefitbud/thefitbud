const { execFileSync } = require("node:child_process");
const { withAppBuildGradle, withXcodeProject } = require("expo/config-plugins");
const withLiveActivity = require("./plugins/withLiveActivity");
const withMailtoQueries = require("./plugins/withMailtoQueries");

/**
 * Sentry org and project Firoz created (manual-steps step 15, 1 Nov 2026).
 * The auth token is the EAS secret SENTRY_AUTH_TOKEN. It is never written here.
 */
const SENTRY_ORG = "fitbud-zi";
const SENTRY_PROJECT = "fitbud-mobile";

/** Baked into non-production Gradle so sentry.gradle skips the upload. */
const SENTRY_GRADLE_UPLOAD_OFF =
  "project.ext.shouldSentryAutoUploadGeneral = { -> false }";

/**
 * @sentry/react-native 6.10 has no plugin flag for this. The Gradle script
 * uploads unless `shouldSentryAutoUploadGeneral` returns false, and it defines
 * that closure itself, so the override has to follow the `apply from` line.
 * @param {string} contents
 */
function disableSentryGradleUpload(contents) {
  if (contents.includes(SENTRY_GRADLE_UPLOAD_OFF)) return contents;
  const pattern = /apply from: new File\([\s\S]*?sentry\.gradle"\)\r?\n/;
  if (!pattern.test(contents)) return contents;
  return contents.replace(pattern, (match) => `${match}\n${SENTRY_GRADLE_UPLOAD_OFF}\n`);
}

/**
 * The Xcode phases store `shellScript` as a JSON string (the Sentry plugin
 * reads it with JSON.parse). Prepend the disable export so `sentry-xcode.sh`
 * skips the upload. Scripts that do not call Sentry are left alone.
 * @param {string} shellScript
 */
function disableSentryXcodeShellScript(shellScript) {
  if (typeof shellScript !== "string" || !shellScript.includes("sentry-xcode")) {
    return shellScript;
  }
  let source;
  try {
    const parsed = JSON.parse(shellScript);
    if (typeof parsed !== "string") return shellScript;
    source = parsed;
  } catch {
    return shellScript;
  }
  if (source.includes("SENTRY_DISABLE_AUTO_UPLOAD")) return shellScript;
  return JSON.stringify(`export SENTRY_DISABLE_AUTO_UPLOAD=true\n${source}`);
}

/**
 * D-W4-7: upload source maps on production builds only. Non-production
 * prebuilds bake the disable into the native projects, because the upload
 * scripts read the environment at Xcode/Gradle time and an `app.config.js`
 * `process.env` write does not reach those processes. The Sentry plugin is
 * registered after this one: Expo runs the later plugin's file mod first, so
 * this mod sees the `sentry.gradle` line and the Sentry Xcode phases.
 * @param {import('@expo/config').ExpoConfig} config
 */
function withSentryUploadDisabled(config) {
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy" && typeof cfg.modResults.contents === "string") {
      cfg.modResults.contents = disableSentryGradleUpload(cfg.modResults.contents);
    }
    return cfg;
  });
  config = withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults?.hash?.project?.objects?.PBXShellScriptBuildPhase;
    if (!phases) return cfg;
    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase !== "object" || typeof phase.shellScript !== "string") continue;
      phase.shellScript = disableSentryXcodeShellScript(phase.shellScript);
    }
    return cfg;
  });
  return config;
}

/**
 * Steps (Z9-9, D-W9-6). Runtime is read-only (requestAuthorization with an
 * empty write list). Apple still requires both Info.plist keys whenever the
 * HealthKit entitlement / APIs are linked (ITMS-90683); omitting the update
 * key with `false` fails upload. Share/update copy is honest about reading
 * steps only — we do not save workouts or samples to Apple Health.
 */
const HEALTH_SHARE =
  "FitBud reads your daily step count so your coach can see it next to your plan.";
const HEALTH_UPDATE =
  "FitBud only reads step counts from Apple Health for coaching. It does not add or change Health samples.";
const HEALTHKIT_PLUGIN = [
  "@kingstinct/react-native-healthkit",
  {
    NSHealthShareUsageDescription: HEALTH_SHARE,
    NSHealthUpdateUsageDescription: HEALTH_UPDATE,
    background: false,
  },
];

/**
 * Health Connect needs Android API 26; SDK 52 defaults to minSdk 24.
 * Play requires target/compile ≥ 36 (Z12-62e); keep minSdk 26 for Health Connect.
 */
const BUILD_PROPERTIES_PLUGIN = [
  "expo-build-properties",
  {
    android: {
      minSdkVersion: 26,
      compileSdkVersion: 36,
      targetSdkVersion: 36,
      buildToolsVersion: "36.0.0",
    },
  },
];

/**
 * Meal photos (Z14-5, D-W14-11): Camera and Gallery open expo-image-picker.
 * The words are the ones the spec fixes; iOS shows them in the permission
 * prompt. No microphone: FitBud never records video or sound, so
 * RECORD_AUDIO is blocked on Android and NSMicrophoneUsageDescription is left
 * out on iOS. Android keeps only what the picker's own manifest declares
 * (CAMERA, and storage for the camera on Android 9 and older); the gallery uses
 * the system photo picker, which needs no permission.
 */
const CAMERA_USAGE =
  "FitBud uses the camera so you can add a photo of your meal for your coach.";
const PHOTOS_USAGE =
  "FitBud opens your photos so you can add a picture of your meal for your coach.";
const IMAGE_PICKER_PLUGIN = [
  "expo-image-picker",
  {
    cameraPermission: CAMERA_USAGE,
    photosPermission: PHOTOS_USAGE,
    microphonePermission: false,
  },
];

/**
 * The device store (Z14-5, D-W14-7): src/sync/storage.ts keeps the outbox and
 * the trainee snapshots in SQLite. Default build flags (no FTS, no SQLCipher).
 * The date of birth picker (@react-native-community/datetimepicker, D-W14-17)
 * and the photo resize (expo-image-manipulator, D-W14-11) need no config
 * plugin: autolinking adds them.
 */
const SQLITE_PLUGIN = "expo-sqlite";

const READ_STEPS_PERMISSION = "android.permission.health.READ_STEPS";
/** Needed by expo-haptics and the Vibration fallback (Z12-45 / Z12-57). */
const VIBRATE_PERMISSION = "android.permission.VIBRATE";

function sentryPluginEntry() {
  return [
    "@sentry/react-native/expo",
    {
      url: "https://sentry.io/",
      organization: SENTRY_ORG,
      project: SENTRY_PROJECT,
    },
  ];
}

/**
 * App variants (D-B12). `APP_VARIANT` comes from the EAS build profile
 * (eas.json); a local `expo start` without it is a development build.
 * Development shares the staging identity, so it uses the staging
 * Firebase Android app and App Group.
 */
const VARIANTS = {
  production: {
    name: "FitBud",
    bundleIdentifier: "com.thefitbud.mobile",
    appGroup: "group.com.thefitbud.mobile",
    // Store builds use the production APNs environment.
    apsEnvironment: "production",
  },
  staging: {
    name: "FitBud Staging",
    bundleIdentifier: "com.thefitbud.mobile.staging",
    appGroup: "group.com.thefitbud.mobile.staging",
    // EAS internal / ad hoc builds use the development APNs environment.
    apsEnvironment: "development",
  },
  development: {
    name: "FitBud Staging",
    bundleIdentifier: "com.thefitbud.mobile.staging",
    appGroup: "group.com.thefitbud.mobile.staging",
    // EAS internal / ad hoc builds use the development APNs environment.
    apsEnvironment: "development",
  },
};

function resolveVariant(value) {
  const key = value || "development";
  const variant = VARIANTS[key];
  if (!variant) {
    throw new Error(
      `Unknown APP_VARIANT "${key}". Use one of: ${Object.keys(VARIANTS).join(", ")}.`,
    );
  }
  return variant;
}

/**
 * Short commit the JS bundle was built from, shown by the dev-only
 * BundleCommitBadge. Never fails the build: "unknown" without git.
 */
function resolveBundleCommit() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      })
        .toString()
        .trim() || "unknown"
    );
  } catch {
    return "unknown";
  }
}

/** @param {{ config: import('@expo/config').ExpoConfig }} context */
function createExpoConfig({ config }) {
  const variantKey = process.env.APP_VARIANT || "development";
  const variant = resolveVariant(variantKey);
  // EAS file environment variable; the file itself is never committed.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  // APP_VARIANT is not EXPO_PUBLIC_, so Metro will not inline it. The JS
  // bundle reads this extra to decide whether crash reporting is on.
  let next = withLiveActivity(
    {
      ...config,
      name: variant.name,
      extra: {
        ...config.extra,
        bundleCommit: resolveBundleCommit(),
        appVariant: variantKey,
      },
      ios: {
        ...config.ios,
        bundleIdentifier: variant.bundleIdentifier,
        // Lets Linking.canOpenURL("mailto:") answer truthfully on iOS (Z10-26).
        infoPlist: {
          ...config.ios?.infoPlist,
          LSApplicationQueriesSchemes: [
            ...new Set([...(config.ios?.infoPlist?.LSApplicationQueriesSchemes ?? []), "mailto"]),
          ],
        },
        // One value feeds both this entitlement and the expo-notifications
        // `mode` below, so they cannot disagree. The plugin only writes
        // aps-environment when it is not already set.
        entitlements: {
          ...config.ios?.entitlements,
          "aps-environment": variant.apsEnvironment,
        },
      },
      android: {
        ...config.android,
        package: variant.bundleIdentifier,
        permissions: [
          ...(config.android?.permissions ?? []),
          READ_STEPS_PERMISSION,
          VIBRATE_PERMISSION,
        ],
        ...(googleServicesFile ? { googleServicesFile } : {}),
      },
      // No icon, color or sounds: Android notifications stay exactly as they were.
      // After ./plugins/withLiveActivity (applied around this config):
      // @bacons/apple-targets adds targets/FitBudLiveActivity to the iOS build (LA1).
      plugins: [
        ...(config.plugins ?? []),
        ["expo-notifications", { mode: variant.apsEnvironment }],
        // Z14-5: the SQLite device store and the meal photo picker.
        SQLITE_PLUGIN,
        IMAGE_PICKER_PLUGIN,
        // Steps (Z9-9): HealthKit (iOS), Health Connect with its permissions-
        // rationale activity (Android), and minSdkVersion 26 for Health Connect.
        // Placed before the existing tail so @bacons/apple-targets and Sentry
        // stay last, in their order.
        HEALTHKIT_PLUGIN,
        "expo-health-connect",
        BUILD_PROPERTIES_PLUGIN,
        "@bacons/apple-targets",
        sentryPluginEntry(),
      ],
    },
    { appGroup: variant.appGroup },
  );
  // Android mailto package-visibility query (Z10-26); iOS uses LSApplicationQueriesSchemes above.
  next = withMailtoQueries(next);
  // Production keeps the Sentry upload. Every other variant bakes it off.
  if (variantKey !== "production") next = withSentryUploadDisabled(next);
  return next;
}

module.exports = createExpoConfig;
module.exports.disableSentryGradleUpload = disableSentryGradleUpload;
module.exports.disableSentryXcodeShellScript = disableSentryXcodeShellScript;
module.exports.VIBRATE_PERMISSION = VIBRATE_PERMISSION;
module.exports.CAMERA_USAGE = CAMERA_USAGE;
module.exports.PHOTOS_USAGE = PHOTOS_USAGE;
