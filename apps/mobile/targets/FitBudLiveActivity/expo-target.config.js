/**
 * Target config for @bacons/apple-targets.
 * Not loaded until that package is added to app.json plugins in a dev build.
 * The App Group comes from the app config (plugins/withLiveActivity.js).
 *
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = (config) => {
  const appGroup = config.ios?.infoPlist?.FitBudAppGroup;
  if (!appGroup) {
    throw new Error("FitBudAppGroup is missing from the app config.");
  }
  return {
    type: "widget",
    name: "FitBudLiveActivity",
    displayName: "FitBud",
    deploymentTarget: "17.0",
    frameworks: ["ActivityKit", "AppIntents", "SwiftUI", "WidgetKit"],
    infoPlist: {
      FitBudAppGroup: appGroup,
    },
    entitlements: {
      "com.apple.security.application-groups": [appGroup],
    },
  };
};
