import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import appJson from "./app.json";
import appConfig from "./app.config.js";
import mobilePackage from "./package.json";
import liveActivityPlugin from "./plugins/withLiveActivity.js";
import liveActivityTarget from "./targets/FitBudLiveActivity/expo-target.config.js";

const requireFromHere = createRequire(import.meta.url);
const MOBILE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const read = (path: string) => readFileSync(join(MOBILE_ROOT, path), "utf8");

const VIBRATE_PERMISSION = "android.permission.VIBRATE";

const APP_GROUPS = "com.apple.security.application-groups";

function configFor(variant: string | undefined) {
  vi.stubEnv("APP_VARIANT", variant);
  return appConfig({ config: structuredClone(appJson) });
}

/**
 * Runs the plugin's iOS prebuild mod into a throwaway project root and returns
 * the Swift the widget compiles. `expo config` never runs mods, and nothing
 * else can catch a regression here: eslint does not look at `plugins/`, tsc
 * does not typecheck it, and the Swift is only compiled by a device build.
 */
async function generatedAppGroupSwift(
  config: ReturnType<typeof configFor>,
): Promise<string> {
  const mod = config.mods?.ios?.dangerous;
  expect(typeof mod).toBe("function");
  const projectRoot = mkdtempSync(join(tmpdir(), "fitbud-app-group-"));
  try {
    await mod({
      ...config,
      modRequest: { platform: "ios", projectRoot, nextMod: (c: unknown) => c },
      modResults: {},
    });
    return readFileSync(
      join(projectRoot, liveActivityPlugin.APP_GROUP_SWIFT_PATH),
      "utf8",
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

/** The one line the widget's `LiveActivityOutbox.suite` resolves to. */
function appGroupInGeneratedSwift(source: string): string | undefined {
  return /static let identifier = "([^"]*)"/.exec(source)?.[1];
}

describe("app.config.js variants", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["production", "FitBud", "com.thefitbud.mobile", "group.com.thefitbud.mobile"],
    [
      "staging",
      "FitBud Staging",
      "com.thefitbud.mobile.staging",
      "group.com.thefitbud.mobile.staging",
    ],
    [
      "development",
      "FitBud Staging",
      "com.thefitbud.mobile.staging",
      "group.com.thefitbud.mobile.staging",
    ],
  ])("%s: name, bundle id, package and App Group", (variant, name, id, appGroup) => {
    const config = configFor(variant);
    expect(config.name).toBe(name);
    expect(config.ios.bundleIdentifier).toBe(id);
    expect(config.android.package).toBe(id);
    expect(config.ios.entitlements[APP_GROUPS]).toEqual([appGroup]);
    expect(config.ios.infoPlist.FitBudAppGroup).toBe(appGroup);
    expect(liveActivityTarget(config).entitlements[APP_GROUPS]).toEqual([appGroup]);
  });

  it.each([
    ["production", "group.com.thefitbud.mobile"],
    ["staging", "group.com.thefitbud.mobile.staging"],
    ["development", "group.com.thefitbud.mobile.staging"],
  ])("%s: the widget compiles in the same App Group as the app", async (variant, appGroup) => {
    const config = configFor(variant);
    const source = await generatedAppGroupSwift(config);
    expect(source).toContain(`static let identifier = "${appGroup}"`);
    // The invariant the app side depends on: it reads FitBudAppGroup from the
    // host app's Info.plist (modules/live-activity/ios/LiveActivityModule.swift),
    // the widget reads this constant. If the two ever differ, lock-screen sets
    // are written where the app cannot see them and silently vanish.
    expect(appGroupInGeneratedSwift(source)).toBe(
      config.ios.infoPlist.FitBudAppGroup,
    );
  });

  it("rejects an App Group name that is not a plain group identifier", () => {
    const { appGroupSwiftSource } = liveActivityPlugin;
    expect(() => appGroupSwiftSource("com.thefitbud.mobile")).toThrow(
      /not a usable App Group name/,
    );
    expect(() => appGroupSwiftSource('group.a" + evil + "')).toThrow(
      /not a usable App Group name/,
    );
    expect(appGroupSwiftSource("group.com.thefitbud.mobile")).toContain(
      'static let identifier = "group.com.thefitbud.mobile"',
    );
  });

  it.each([
    ["production", "production", "com.thefitbud.mobile"],
    ["staging", "development", "com.thefitbud.mobile.staging"],
    ["development", "development", "com.thefitbud.mobile.staging"],
    [undefined, "development", "com.thefitbud.mobile.staging"],
  ])(
    "%s: iOS signing, push and widget id (APNs %s)",
    (variant, aps, hostId) => {
      const config = configFor(variant);
      expect(config.ios.appleTeamId).toBe("26257QDTHP");
      expect(config.ios.supportsTablet).toBe(true);
      expect(config.ios.config.usesNonExemptEncryption).toBe(false);
      expect(config.ios.entitlements["aps-environment"]).toBe(aps);
      expect(config.ios.entitlements[APP_GROUPS]).toHaveLength(1);
      expect(config.ios.infoPlist.LSApplicationQueriesSchemes).toContain("mailto");
      // The App Group key set by withLiveActivity survives the merge.
      expect(config.ios.infoPlist.FitBudAppGroup).toBeTruthy();

      const entry = config.plugins.find(
        (p: unknown) => Array.isArray(p) && p[0] === "expo-notifications",
      );
      expect(entry).toBeDefined();
      // Same value as the entitlement, and nothing that changes Android.
      expect(entry).toEqual(["expo-notifications", { mode: aps }]);

      const names = config.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
      expect(names.slice(0, 2)).toEqual(["expo-dev-client", "expo-secure-store"]);
      expect(names.indexOf("expo-notifications")).toBeLessThan(
        names.indexOf("@bacons/apple-targets"),
      );
      expect(names[names.length - 1]).toBe("@sentry/react-native/expo");
      expect(names[names.length - 2]).toBe("@bacons/apple-targets");

      // A leading "." is appended to the host app's id by @bacons/apple-targets.
      const target = liveActivityTarget(config);
      expect(target.bundleIdentifier.startsWith(".")).toBe(true);
      expect(`${config.ios.bundleIdentifier}${target.bundleIdentifier}`).toBe(
        `${hostId}.widget`,
      );
    },
  );

  it("treats an unset APP_VARIANT as development", () => {
    expect(configFor(undefined).ios.bundleIdentifier).toBe("com.thefitbud.mobile.staging");
  });

  it("throws for an unknown variant", () => {
    expect(() => configFor("qa")).toThrow(/Unknown APP_VARIANT "qa"/);
  });

  it("sets googleServicesFile only from the EAS file variable", () => {
    expect(configFor("staging").android.googleServicesFile).toBeUndefined();
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/tmp/eas/google-services.json");
    expect(configFor("staging").android.googleServicesFile).toBe(
      "/tmp/eas/google-services.json",
    );
  });

  it("declares Android VIBRATE for haptics (Z12-57)", () => {
    const config = configFor("development");
    expect(config.android.permissions).toContain(VIBRATE_PERMISSION);
  });

  it("registers the Android mailto package-visibility query (Z10-26 / Z12-57)", async () => {
    const config = configFor("development");
    const mod = config.mods?.android?.manifest;
    expect(typeof mod).toBe("function");
    const result = await mod({
      ...config,
      modRequest: {
        platform: "android",
        projectRoot: "/tmp",
        nextMod: (c: unknown) => c,
      },
      modResults: {
        manifest: {
          $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
          application: [{ $: { "android:name": ".MainApplication" } }],
        },
      },
    });
    const queries = result.modResults.manifest.queries ?? [];
    const mailto = queries.some((block: { intent?: unknown[] }) =>
      (block.intent ?? []).some((intent: {
        action?: { $?: { "android:name"?: string } }[];
        data?: { $?: { "android:scheme"?: string } }[];
      }) => {
        const isView = (intent.action ?? []).some(
          (action) => action.$?.["android:name"] === "android.intent.action.VIEW",
        );
        const isMailto = (intent.data ?? []).some(
          (entry) => entry.$?.["android:scheme"] === "mailto",
        );
        return isView && isMailto;
      }),
    );
    expect(mailto).toBe(true);
  });
});

/** Runs one plugin's mod the way prebuild would, on a minimal starting value. */
async function runMod(
  config: { mods?: Record<string, Record<string, unknown>> },
  platform: "ios" | "android",
  name: string,
  modResults: unknown,
) {
  const mod = config.mods?.[platform]?.[name];
  expect(typeof mod).toBe("function");
  return (mod as (input: unknown) => Promise<{ modResults: unknown }>)({
    ...config,
    modResults,
    modRequest: { platform, projectRoot: "/tmp", nextMod: (c: unknown) => c },
  });
}

function pluginEntry(config: ReturnType<typeof configFor>, name: string) {
  return config.plugins.find(
    (p: unknown) => p === name || (Array.isArray(p) && p[0] === name),
  );
}

describe("Z14-5 native bundle", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pins the SDK 52 versions of every new native module", () => {
    const expoDir = dirname(requireFromHere.resolve("expo/package.json"));
    const bundled = JSON.parse(
      readFileSync(join(expoDir, "bundledNativeModules.json"), "utf8"),
    ) as Record<string, string>;
    const deps = mobilePackage.dependencies as Record<string, string>;
    for (const name of [
      "expo-sqlite",
      "expo-image-picker",
      "expo-image-manipulator",
      "@react-native-community/datetimepicker",
    ]) {
      expect(deps[name], name).toBe(bundled[name]);
    }
    // No SDK upgrade rides along.
    expect(deps.expo).toBe("~52.0.46");
  });

  it("registers the sqlite plugin and the image picker with the spec's words, no microphone", () => {
    const config = configFor("staging");
    expect(pluginEntry(config, "expo-sqlite")).toBe("expo-sqlite");
    expect(pluginEntry(config, "expo-image-picker")).toEqual([
      "expo-image-picker",
      {
        cameraPermission:
          "FitBud uses the camera so you can add a photo of your meal for your coach.",
        photosPermission:
          "FitBud opens your photos so you can add a picture of your meal for your coach.",
        microphonePermission: false,
      },
    ]);
    // The date picker and the image resize need no plugin: autolinking only.
    expect(pluginEntry(config, "@react-native-community/datetimepicker")).toBeUndefined();
    expect(pluginEntry(config, "expo-image-manipulator")).toBeUndefined();
    const names = config.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
    expect(names.slice(-2)).toEqual(["@bacons/apple-targets", "@sentry/react-native/expo"]);
  });

  it("the image picker plugin writes the camera and photos strings and blocks the microphone", async () => {
    const config = configFor("production");
    const [name, props] = pluginEntry(config, "expo-image-picker");
    const imported = requireFromHere(`${name}/app.plugin.js`);
    const plugin = (imported.default ?? imported) as (
      c: unknown,
      p: unknown,
    ) => { mods?: Record<string, Record<string, unknown>> };
    const applied = plugin({ ...config, mods: undefined }, props);

    const plist = (await runMod(applied, "ios", "infoPlist", {})).modResults as Record<
      string,
      string
    >;
    expect(plist.NSCameraUsageDescription).toBe(appConfig.CAMERA_USAGE);
    expect(plist.NSPhotoLibraryUsageDescription).toBe(appConfig.PHOTOS_USAGE);
    expect(plist.NSMicrophoneUsageDescription).toBeUndefined();

    const result = await runMod(applied, "android", "manifest", {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        application: [{ $: {} }],
      },
    });
    const manifest = (
      result.modResults as { manifest: { "uses-permission"?: { $: Record<string, string> }[] } }
    ).manifest;
    const permissions = manifest["uses-permission"] ?? [];
    expect(permissions).toContainEqual({
      $: { "android:name": "android.permission.RECORD_AUDIO", "tools:node": "remove" },
    });
    // Camera stays as the picker declares it; nothing blocks it.
    expect(
      permissions.some((p) => p.$["android:name"] === "android.permission.CAMERA"),
    ).toBe(false);
  });
});

describe("Z14-5 Live Activity intents in the app target", () => {
  const shared = () => read(liveActivityPlugin.SHARED_INTENTS_SWIFT_PATH);
  const widget = () => read("targets/FitBudLiveActivity/FitBudLiveActivity.swift");
  const moduleSwift = () => read("modules/live-activity/ios/LiveActivityModule.swift");

  const INTENTS = ["LogSetIntent", "AdjustWeightIntent", "AdjustRepsIntent", "SkipRestIntent"];

  it("declares every intent once, in _shared, which apple-targets links to the app and the widget", () => {
    expect(liveActivityPlugin.SHARED_INTENTS_SWIFT_PATH).toBe(
      join("targets", "FitBudLiveActivity", "_shared", "LiveActivityIntents.swift"),
    );
    for (const intent of INTENTS) {
      expect(shared()).toMatch(new RegExp(`struct ${intent}: LiveActivityIntent`));
      // One source: the widget file uses the intents but no longer declares them.
      expect(widget()).not.toMatch(new RegExp(`struct ${intent}\\b`));
      // The app target still supports iOS 15.1: every intent is gated.
      expect(shared()).toContain(`@available(iOS 17.0, *)\nstruct ${intent}`);
    }
    expect(widget()).toContain("Button(intent: LogSetIntent(");
    expect(shared()).toContain("@available(iOS 16.1, *)\nstruct FitBudWorkoutAttributes");
    expect(widget()).not.toMatch(/struct FitBudWorkoutAttributes/);
    expect(shared()).toMatch(/enum LiveActivityOutbox/);
    expect(widget()).not.toMatch(/enum LiveActivityOutbox/);
    // The membership mechanism this relies on: @bacons/apple-targets adds each
    // file of a target's `_shared` folder to the main app target. A version
    // that drops it would leave the intents widget-only again.
    const appleTargets = dirname(requireFromHere.resolve("@bacons/apple-targets/package.json"));
    const xcodeChanges = readFileSync(join(appleTargets, "build", "withXcodeChanges.js"), "utf8");
    expect(xcodeChanges).toContain('globSync)("_shared/*"');
    expect(xcodeChanges).toMatch(/target: mainAppTarget/);
  });

  it("keeps the module's copy of the activity attributes identical to the shared one", () => {
    const fields = (source: string) => {
      const start = source.indexOf("struct FitBudWorkoutAttributes: ActivityAttributes");
      const end = source.indexOf("\n}\n", start);
      return [...source.slice(start, end).matchAll(/^\s*var (\w+): ([^\s=]+)/gm)].map(
        (match) => `${match[1]}: ${match[2]}`,
      );
    };
    expect(fields(shared()).length).toBeGreaterThan(10);
    expect(fields(moduleSwift())).toEqual(fields(shared()));
  });

  it("the intent's outbox notification and the module's observer use the same name", () => {
    expect(shared()).toContain('"\\(suite).liveActivityOutbox.appended"');
    expect(moduleSwift()).toContain('"\\(suite).liveActivityOutbox.appended"');
    expect(shared()).toContain("CFNotificationCenterPostNotification(");
    expect(moduleSwift()).toContain("CFNotificationCenterAddObserver(");
    expect(moduleSwift()).toContain('Events("onOutboxRow")');
  });

  it("writes the App Group constant into _shared and removes the copy older prebuilds left", async () => {
    const config = configFor("staging");
    const mod = config.mods?.ios?.dangerous;
    const projectRoot = mkdtempSync(join(tmpdir(), "fitbud-shared-"));
    try {
      const legacy = join(projectRoot, liveActivityPlugin.LEGACY_APP_GROUP_SWIFT_PATH);
      mkdirSync(dirname(legacy), { recursive: true });
      writeFileSync(legacy, "enum FitBudAppGroup {}\n");
      await mod({
        ...config,
        modRequest: { platform: "ios", projectRoot, nextMod: (c: unknown) => c },
        modResults: {},
      });
      expect(existsSync(legacy)).toBe(false);
      const generated = join(projectRoot, liveActivityPlugin.APP_GROUP_SWIFT_PATH);
      expect(generated).toContain(join("FitBudLiveActivity", "_shared", "GeneratedAppGroup.swift"));
      expect(readFileSync(generated, "utf8")).toContain(
        'static let identifier = "group.com.thefitbud.mobile.staging"',
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
    // Generated per variant, never committed.
    expect(read("targets/FitBudLiveActivity/_shared/.gitignore")).toMatch(
      /^GeneratedAppGroup\.swift$/m,
    );
  });
});

describe("Z14-5 Android live workout notification (TR-15d)", () => {
  const kotlin = () => read("targets/android/WorkoutSetNotification.kt");
  const layout = () =>
    read("modules/live-activity/android/src/main/res/layout/fitbud_workout_set.xml");
  const receiver = () =>
    read(
      "modules/live-activity/android/src/main/java/com/thefitbud/liveactivity/WorkoutSetActionReceiver.kt",
    );

  it("posts on its own silent, public 'Live workout' channel, created natively", () => {
    const source = kotlin();
    expect(source).toContain('const val CHANNEL_ID = "workout_live"');
    expect(source).toContain('const val CHANNEL_NAME = "Live workout"');
    expect(source).toContain("NotificationManager.IMPORTANCE_DEFAULT");
    expect(source).toContain("setSound(null, null)");
    expect(source).toContain("enableVibration(false)");
    expect(source).toContain("lockscreenVisibility = Notification.VISIBILITY_PUBLIC");
    expect(source).toContain("manager.createNotificationChannel(channel())");
    for (const call of [
      ".setOngoing(true)",
      ".setOnlyAlertOnce(true)",
      ".setSilent(true)",
      ".setCategory(NotificationCompat.CATEGORY_WORKOUT)",
      ".setVisibility(NotificationCompat.VISIBILITY_PUBLIC)",
    ]) {
      expect(source).toContain(call);
    }
    // The reminders channel is no longer used for the live workout.
    expect(source).not.toContain('"Workout reminders"');
    expect(source).not.toMatch(/CHANNEL_ID = "workout"/);
  });

  it("draws TR-15d: exercise · set, Last and Target, Log {target} and Open, no ± steppers", () => {
    const xml = layout();
    for (const id of [
      "fitbud_workout_exercise",
      "fitbud_workout_set",
      "fitbud_workout_last",
      "fitbud_workout_target",
      "fitbud_workout_log",
      "fitbud_workout_open",
      "fitbud_workout_progress",
    ]) {
      expect(xml).toContain(`@+id/${id}"`);
    }
    expect(xml).not.toMatch(/weight_down|weight_up|reps_down|reps_up/);
    const source = kotlin();
    expect(source).toContain('"Log ${valuesLine(state)}"');
    expect(source).toContain('"Target ${formatLoad(state.planKilograms, reps)}"');
    expect(source).toContain('"Last ${formatLoad(kilograms, reps)}"');
    // Title row: workout name and the elapsed timer from the workout's start.
    expect(source).toContain(".setSubText(state.workoutName.ifBlank { SUB_TEXT })");
    expect(source).toContain(".setWhen(startedAt).setUsesChronometer(true)");
    // Only Log and Skip rest remain as actions.
    expect([...source.matchAll(/const val (ACTION_\w+)/g)].map((m) => m[1])).toEqual([
      "ACTION_LOG_SET",
      "ACTION_SKIP_REST",
    ]);
    expect(receiver()).not.toMatch(/ACTION_(LESS|MORE|FEWER)_/);
    expect(receiver()).toContain("LiveActivityModule.notifyOutboxRow(");
  });
});
