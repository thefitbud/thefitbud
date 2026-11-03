const { execFileSync } = require("node:child_process");
const withLiveActivity = require("./plugins/withLiveActivity");

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
  },
  staging: {
    name: "FitBud Staging",
    bundleIdentifier: "com.thefitbud.mobile.staging",
    appGroup: "group.com.thefitbud.mobile.staging",
  },
  development: {
    name: "FitBud Staging",
    bundleIdentifier: "com.thefitbud.mobile.staging",
    appGroup: "group.com.thefitbud.mobile.staging",
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
module.exports = ({ config }) => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  // EAS file environment variable; the file itself is never committed.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return withLiveActivity(
    {
      ...config,
      name: variant.name,
      extra: { ...config.extra, bundleCommit: resolveBundleCommit() },
      ios: {
        ...config.ios,
        bundleIdentifier: variant.bundleIdentifier,
      },
      android: {
        ...config.android,
        package: variant.bundleIdentifier,
        ...(googleServicesFile ? { googleServicesFile } : {}),
      },
      // After ./plugins/withLiveActivity (applied around this config):
      // @bacons/apple-targets adds targets/FitBudLiveActivity to the iOS build (LA1).
      plugins: [...(config.plugins ?? []), "@bacons/apple-targets"],
    },
    { appGroup: variant.appGroup },
  );
};
