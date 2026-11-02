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
    // No `infoPlist` here on purpose. @bacons/apple-targets 0.2.1 has no such
    // field: it spreads this object with no schema and no warning, so the key
    // was silently dropped and the widget read nil. The widget gets the group
    // as a compiled-in constant instead (GeneratedAppGroup.swift, written by
    // plugins/withLiveActivity.js). Do not add it back: a later version that
    // honoured it would give the group two sources of truth, and the constant
    // would have to go in the same change.
    entitlements: {
      "com.apple.security.application-groups": [appGroup],
    },
  };
};
