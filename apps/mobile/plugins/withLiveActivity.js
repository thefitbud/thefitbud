const APP_GROUP = "group.com.thefitbud.mobile";

/**
 * Marks the iOS app as Live Activity capable and shares an App Group
 * with targets/FitBudLiveActivity.
 *
 * The widget target and LiveActivityIntent buttons are not compiled by
 * Expo web or Expo Go. They need a dev build on a Mac:
 * add @bacons/apple-targets and point it at targets/FitBudLiveActivity.
 *
 * @param {import('@expo/config').ExpoConfig} config
 */
function withLiveActivity(config) {
  const ios = config.ios ?? {};
  const groups = new Set(
    ios.entitlements?.["com.apple.security.application-groups"] ?? [],
  );
  groups.add(APP_GROUP);
  return {
    ...config,
    ios: {
      ...ios,
      infoPlist: {
        ...(ios.infoPlist ?? {}),
        NSSupportsLiveActivities: true,
      },
      entitlements: {
        ...(ios.entitlements ?? {}),
        "com.apple.security.application-groups": [...groups],
      },
    },
  };
}

module.exports = withLiveActivity;
