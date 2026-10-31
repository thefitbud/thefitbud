/** Info.plist key the Live Activity Swift code reads its App Group from. */
const APP_GROUP_INFO_PLIST_KEY = "FitBudAppGroup";

/**
 * Marks the iOS app as Live Activity capable and shares an App Group
 * with targets/FitBudLiveActivity. The group differs per app variant
 * (app.config.js) and is written to Info.plist as FitBudAppGroup.
 *
 * The widget target and LiveActivityIntent buttons are not compiled by
 * Expo web or Expo Go. They need a dev build on a Mac:
 * add @bacons/apple-targets and point it at targets/FitBudLiveActivity.
 * Log set advances to the next set. There is no rest timer.
 * The Android custom notification lives in targets/android and also
 * needs that dev build. It is not part of the Expo web bundle.
 *
 * @param {import('@expo/config').ExpoConfig} config
 * @param {{ appGroup: string }} options
 */
function withLiveActivity(config, options) {
  const appGroup = options?.appGroup;
  if (!appGroup) {
    throw new Error("withLiveActivity needs an appGroup option.");
  }
  const ios = config.ios ?? {};
  const groups = new Set(
    ios.entitlements?.["com.apple.security.application-groups"] ?? [],
  );
  groups.add(appGroup);
  return {
    ...config,
    ios: {
      ...ios,
      infoPlist: {
        ...(ios.infoPlist ?? {}),
        NSSupportsLiveActivities: true,
        [APP_GROUP_INFO_PLIST_KEY]: appGroup,
      },
      entitlements: {
        ...(ios.entitlements ?? {}),
        "com.apple.security.application-groups": [...groups],
      },
    },
  };
}

module.exports = withLiveActivity;
module.exports.APP_GROUP_INFO_PLIST_KEY = APP_GROUP_INFO_PLIST_KEY;
