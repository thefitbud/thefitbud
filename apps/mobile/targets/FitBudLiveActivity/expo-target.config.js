/**
 * Target config for @bacons/apple-targets.
 * Not loaded until that package is added to app.json plugins in a dev build.
 *
 * @param {import('@expo/config-plugins').ExpoConfig} _config
 */
module.exports = (_config) => ({
  type: "widget",
  name: "FitBudLiveActivity",
  displayName: "FitBud",
  deploymentTarget: "17.0",
  frameworks: ["ActivityKit", "AppIntents", "SwiftUI", "WidgetKit"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.thefitbud.mobile"],
  },
});
