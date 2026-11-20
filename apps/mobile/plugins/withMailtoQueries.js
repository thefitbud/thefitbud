const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Android 11+ package visibility: Linking.canOpenURL("mailto:…") only answers
 * truthfully when the manifest declares a mailto VIEW query (Z10-26 / Z12-57).
 * iOS already lists mailto in LSApplicationQueriesSchemes (app.config.js).
 *
 * @param {import('@expo/config').ExpoConfig} config
 */
function withMailtoQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!manifest) {
      throw new Error("withMailtoQueries: Android manifest is missing.");
    }
    const queries = manifest.queries ?? [];
    const hasMailto = queries.some((block) =>
      (block.intent ?? []).some((intent) => {
        const actions = intent.action ?? [];
        const data = intent.data ?? [];
        const isView = actions.some(
          (action) => action.$?.["android:name"] === "android.intent.action.VIEW",
        );
        const isMailto = data.some((entry) => entry.$?.["android:scheme"] === "mailto");
        return isView && isMailto;
      }),
    );
    if (!hasMailto) {
      queries.push({
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "mailto" } }],
          },
        ],
      });
    }
    manifest.queries = queries;
    return mod;
  });
}

module.exports = withMailtoQueries;
