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
    // @bacons/apple-targets 0.2.1 never writes a target's infoPlist into the
    // widget bundle (it only seeds targets/FitBudLiveActivity/Info.plist when
    // that file is absent). Kept so a later version can honour it; the widget
    // does not depend on it, it reads the generated Swift constant instead
    // (GeneratedAppGroup.swift, plugins/withLiveActivity.js).
    infoPlist: {
      FitBudAppGroup: appGroup,
    },
    entitlements: {
      "com.apple.security.application-groups": [appGroup],
    },
  };
};
