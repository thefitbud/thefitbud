const { withAndroidManifest } = require("expo/config-plugins");

/** Info.plist key the Live Activity Swift code reads its App Group from. */
const APP_GROUP_INFO_PLIST_KEY = "FitBudAppGroup";

/**
 * The receiver behind the Android workout notification's buttons (LA3).
 * Fully qualified and fixed: the app's package changes per variant
 * (app.config.js), the local Expo module's does not.
 */
const WORKOUT_RECEIVER = "com.thefitbud.liveactivity.WorkoutSetActionReceiver";

/**
 * Registers that receiver in the app's manifest. Not exported and with no
 * intent filter: only FitBud's own explicit PendingIntents reach it, so no
 * other app can press −, + or Log set. `directBootAware` is left off; the
 * notification is posted after the user has unlocked at least once.
 *
 * @param {import('@expo/config').ExpoConfig} config
 */
function withWorkoutSetReceiver(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error(
        "withLiveActivity: the Android manifest has no <application> element.",
      );
    }
    const receivers = application.receiver ?? [];
    const existing = receivers.find(
      (receiver) => receiver.$?.["android:name"] === WORKOUT_RECEIVER,
    );
    const attributes = {
      "android:name": WORKOUT_RECEIVER,
      "android:exported": "false",
      "android:enabled": "true",
    };
    if (existing) {
      existing.$ = { ...existing.$, ...attributes };
    } else {
      receivers.push({ $: attributes });
    }
    application.receiver = receivers;
    return mod;
  });
}

/**
 * Marks the iOS app as Live Activity capable and shares an App Group
 * with targets/FitBudLiveActivity. The group differs per app variant
 * (app.config.js) and is written to Info.plist as FitBudAppGroup.
 *
 * The widget target and LiveActivityIntent buttons are not compiled by
 * Expo web or Expo Go. They need a dev build: @bacons/apple-targets (in the
 * plugins list, LA1) adds targets/FitBudLiveActivity to the iOS build.
 * Log set advances to the next set. After a set logged in the app, the
 * activity shows the rest countdown (frame 27c, LA1c) until it runs out or
 * Skip is tapped.
 * The Android custom notification lives in targets/android, compiled by the
 * local Expo module in modules/live-activity/android (LA3), and also needs
 * that dev build. It is not part of the Expo web bundle. This plugin
 * registers its button receiver in the Android manifest.
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
  const withIos = {
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
  return withWorkoutSetReceiver(withIos);
}

module.exports = withLiveActivity;
module.exports.APP_GROUP_INFO_PLIST_KEY = APP_GROUP_INFO_PLIST_KEY;
module.exports.WORKOUT_RECEIVER = WORKOUT_RECEIVER;
