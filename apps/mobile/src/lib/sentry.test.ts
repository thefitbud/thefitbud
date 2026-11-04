import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import appJson from "../../app.json";

const require = createRequire(import.meta.url);
const appConfig = require("../../app.config.js") as {
  (context: { config: typeof appJson }): {
    extra?: { appVariant?: string };
    plugins: unknown[];
    mods?: {
      android?: { appBuildGradle?: (props: ModProps) => Promise<ModProps> };
      ios?: { xcodeproj?: (props: ModProps) => Promise<ModProps> };
    };
  };
  disableSentryGradleUpload: (contents: string) => string;
  disableSentryXcodeShellScript: (shellScript: string) => string;
};

type ModProps = {
  modRequest?: { nextMod?: (props: ModProps) => ModProps };
  modResults: unknown;
};

const runtime = vi.hoisted(() => ({
  os: "ios",
  nativeAppVersion: "1.2.3" as string | null,
  nativeBuildVersion: "45" as string | null,
  version: "1.2.3",
  iosBundle: "com.thefitbud.mobile" as string | undefined,
  androidPackage: "com.thefitbud.mobile.staging" as string | undefined,
  appVariant: "production" as string | undefined,
}));

const sentrySdk = vi.hoisted(() => ({
  init: vi.fn(),
  wrap: vi.fn((component: unknown) => component),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return runtime.os;
    },
  },
}));

vi.mock("expo-constants", () => ({
  default: {
    get nativeAppVersion() {
      return runtime.nativeAppVersion;
    },
    get nativeBuildVersion() {
      return runtime.nativeBuildVersion;
    },
    get expoConfig() {
      return {
        version: runtime.version,
        ios: { bundleIdentifier: runtime.iosBundle },
        android: { package: runtime.androidPackage },
        extra: { appVariant: runtime.appVariant },
      };
    },
  },
}));

vi.mock("@sentry/react-native", () => ({
  init: sentrySdk.init,
  wrap: sentrySdk.wrap,
}));

import {
  initSentry,
  isSentryEnabled,
  readAppVariant,
  readSentryDsn,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryRelease,
  wrapWithSentry,
} from "./sentry";

const DSN = "https://public@o0.ingest.sentry.io/0";

const GRADLE_WITH_SENTRY = [
  'apply plugin: "com.android.application"',
  "",
  'apply from: new File(["node", "--print", "require(\'path\').dirname(require.resolve(\'@sentry/react-native/package.json\'))"].execute().text.trim(), "sentry.gradle")',
  "",
  "android {",
  "}",
  "",
].join("\n");

function pluginNames(plugins: unknown[]): unknown[] {
  return plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
}

function configFor(variant: string | undefined) {
  if (variant === undefined) vi.stubEnv("APP_VARIANT", "");
  else vi.stubEnv("APP_VARIANT", variant);
  return appConfig({ config: structuredClone(appJson) });
}

afterEach(() => {
  vi.unstubAllEnvs();
  sentrySdk.init.mockClear();
  sentrySdk.wrap.mockClear();
  runtime.os = "ios";
  runtime.nativeAppVersion = "1.2.3";
  runtime.nativeBuildVersion = "45";
  runtime.version = "1.2.3";
  runtime.iosBundle = "com.thefitbud.mobile";
  runtime.androidPackage = "com.thefitbud.mobile.staging";
  runtime.appVariant = "production";
});

describe("isSentryEnabled", () => {
  it("starts only for staging and production when a DSN is set and the platform is native", () => {
    expect(isSentryEnabled({ variant: "staging", platform: "ios", dsn: DSN })).toBe(true);
    expect(isSentryEnabled({ variant: "production", platform: "android", dsn: DSN })).toBe(true);
    expect(isSentryEnabled({ variant: "development", platform: "ios", dsn: DSN })).toBe(false);
    expect(isSentryEnabled({ variant: "staging", platform: "web", dsn: DSN })).toBe(false);
    expect(isSentryEnabled({ variant: "staging", platform: "ios", dsn: undefined })).toBe(false);
    expect(isSentryEnabled({ variant: "staging", platform: "ios", dsn: "  " })).toBe(false);
    expect(isSentryEnabled({ variant: "qa", platform: "ios", dsn: DSN })).toBe(false);
  });
});

describe("initSentry", () => {
  it("does not call Sentry in development", () => {
    runtime.appVariant = "development";
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", DSN);
    expect(initSentry()).toBe(false);
    expect(sentrySdk.init).not.toHaveBeenCalled();
  });

  it("does not call Sentry on web", () => {
    runtime.os = "web";
    runtime.appVariant = "staging";
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", DSN);
    expect(initSentry()).toBe(false);
    expect(sentrySdk.init).not.toHaveBeenCalled();
  });

  it("does not call Sentry when the DSN is missing or blank", () => {
    runtime.appVariant = "production";
    expect(initSentry()).toBe(false);
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", "   ");
    expect(readSentryDsn()).toBeUndefined();
    expect(initSentry()).toBe(false);
    expect(sentrySdk.init).not.toHaveBeenCalled();
  });

  it("inits staging and production with release, dist, no PII and no tracing", () => {
    runtime.appVariant = "staging";
    runtime.os = "android";
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", `  ${DSN}  `);
    expect(initSentry()).toBe(true);
    expect(sentrySdk.init).toHaveBeenCalledTimes(1);
    const options = sentrySdk.init.mock.calls[0]?.[0] as {
      dsn: string;
      environment: string;
      release: string;
      dist: string;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      beforeSend: (event: unknown) => unknown;
      beforeBreadcrumb: (breadcrumb: unknown) => unknown;
    };
    expect(options.dsn).toBe(DSN);
    expect(options.environment).toBe("staging");
    expect(options.release).toBe("com.thefitbud.mobile.staging@1.2.3+45");
    expect(options.dist).toBe("45");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
  });
});

describe("sentryRelease", () => {
  it("uses the iOS bundle id, app version and build number", () => {
    expect(sentryRelease("ios")).toEqual({
      release: "com.thefitbud.mobile@1.2.3+45",
      dist: "45",
    });
  });

  it("uses the Android package on Android", () => {
    expect(sentryRelease("android")).toEqual({
      release: "com.thefitbud.mobile.staging@1.2.3+45",
      dist: "45",
    });
  });

  it("falls back to the config version and dist 0 when the binary has not stamped them", () => {
    runtime.nativeAppVersion = null;
    runtime.nativeBuildVersion = "  ";
    runtime.version = "0.0.0";
    runtime.iosBundle = undefined;
    expect(sentryRelease("ios")).toEqual({ release: "0.0.0+0", dist: "0" });
  });
});

describe("readAppVariant", () => {
  it("reads extra.appVariant and treats a missing value as development", () => {
    runtime.appVariant = "staging";
    expect(readAppVariant()).toBe("staging");
    runtime.appVariant = undefined;
    expect(readAppVariant()).toBe("development");
    runtime.appVariant = "";
    expect(readAppVariant()).toBe("development");
  });
});

describe("scrubSentryEvent", () => {
  const event = {
    message: "failed for ada@example.com Bearer short-token",
    user: {
      id: "user-1",
      email: "ada@example.com",
      username: "Ada",
      name: "Ada Lovelace",
      ip_address: "203.0.113.4",
    },
    request: {
      url: "https://api.thefitbud.com/me",
      data: { note: "private note", weight: 70 },
      cookies: "session=secret",
      query_string: "email=ada@example.com",
      headers: {
        Authorization: "Bearer header-token",
        "Content-Type": "application/json",
        Cookie: "session=secret",
      },
    },
    extra: {
      screen: "today",
      note: "coach note",
      notes: "another note",
      fullName: "Ada Lovelace",
      weight: 70,
      steps: 4000,
      body_fat: 18,
    },
    contexts: {
      health: { heartRate: 60, sleep: 7, measurements: { waist: 80 } },
      device: { name: "Ada's phone", model: "Pixel" },
    },
  };

  it("drops bodies, credentials, names, notes and health fields and keeps the rest", () => {
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.message).toBe("failed for [email] Bearer [redacted]");
    expect(scrubbed.user).toEqual({ id: "user-1" });
    expect(scrubbed.request).toEqual({
      url: "https://api.thefitbud.com/me",
      headers: { "Content-Type": "application/json" },
    });
    expect(scrubbed.extra).toEqual({ screen: "today" });
    expect(scrubbed.contexts).toEqual({
      health: {},
      device: { model: "Pixel" },
    });
    expect(JSON.stringify(scrubbed)).not.toContain("ada@example.com");
    expect(JSON.stringify(scrubbed)).not.toContain("header-token");
    expect(JSON.stringify(scrubbed)).not.toContain("short-token");
    expect(JSON.stringify(scrubbed)).not.toContain("private note");
    expect(JSON.stringify(scrubbed)).not.toContain("Ada");
  });

  it("drops header tuples that carry credentials", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        headers: [
          ["Authorization", "Bearer tuple-token"],
          ["Accept", "application/json"],
        ],
      },
    });
    expect(scrubbed.request?.headers).toEqual([["Accept", "application/json"]]);
  });

  it("does not mutate the event it was given", () => {
    const snapshot = structuredClone(event);
    scrubSentryEvent(event);
    expect(event).toEqual(snapshot);
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("drops http bodies and authorization and keeps the request line", () => {
    const scrubbed = scrubSentryBreadcrumb({
      category: "http",
      data: {
        url: "https://api.thefitbud.com/logs",
        method: "POST",
        status_code: 500,
        request_body: { note: "secret note", email: "ada@example.com" },
        Authorization: "Bearer crumb-token",
      },
    });
    expect(scrubbed).toEqual({
      category: "http",
      data: {
        url: "https://api.thefitbud.com/logs",
        method: "POST",
        status_code: 500,
      },
    });
  });
});

describe("wrapWithSentry", () => {
  it("passes the root component to Sentry.wrap", () => {
    const component = () => null;
    expect(wrapWithSentry(component)).toBe(component);
    expect(sentrySdk.wrap).toHaveBeenCalledWith(component);
  });
});

describe("app.config.js Sentry plugin", () => {
  it("appends the Expo plugin after the existing plugins, with org and project and no token", () => {
    for (const variant of ["production", "staging", "development", undefined] as const) {
      const config = configFor(variant);
      const names = pluginNames(config.plugins);
      expect(names.at(-1)).toBe("@sentry/react-native/expo");
      expect(names.indexOf("@bacons/apple-targets")).toBe(names.length - 2);
      const entry = config.plugins.at(-1);
      expect(entry).toEqual([
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          organization: "fitbud-zi",
          project: "fitbud-mobile",
        },
      ]);
      expect(JSON.stringify(entry)).not.toContain("authToken");
      expect(JSON.stringify(entry)).not.toContain("SENTRY_AUTH_TOKEN");
    }
  });

  it("copies APP_VARIANT into extra.appVariant, defaulting to development", () => {
    expect(configFor("production").extra?.appVariant).toBe("production");
    expect(configFor("staging").extra?.appVariant).toBe("staging");
    expect(configFor(undefined).extra?.appVariant).toBe("development");
  });

  it("bakes the source-map upload off except on production", async () => {
    const production = configFor("production");
    expect(production.mods?.android?.appBuildGradle).toBeUndefined();

    const staging = configFor("staging");
    const gradleMod = staging.mods?.android?.appBuildGradle;
    expect(typeof gradleMod).toBe("function");
    const gradle = await gradleMod?.({
      modRequest: {},
      modResults: { language: "groovy", contents: GRADLE_WITH_SENTRY },
    });
    const contents = (gradle?.modResults as { contents: string }).contents;
    expect(contents).toContain("project.ext.shouldSentryAutoUploadGeneral = { -> false }");
    expect(contents.indexOf("sentry.gradle")).toBeLessThan(
      contents.indexOf("shouldSentryAutoUploadGeneral"),
    );

    const xcodeMod = staging.mods?.ios?.xcodeproj;
    expect(typeof xcodeMod).toBe("function");
    const uploadPhase = JSON.stringify('/bin/sh "$NODE" sentry-xcode.sh');
    const plainPhase = JSON.stringify("echo untouched");
    const xcode = await xcodeMod?.({
      modRequest: {},
      modResults: {
        hash: {
          project: {
            objects: {
              PBXShellScriptBuildPhase: {
                UPLOAD: { isa: "PBXShellScriptBuildPhase", shellScript: uploadPhase },
                PLAIN: { isa: "PBXShellScriptBuildPhase", shellScript: plainPhase },
                UPLOAD_comment: "Upload Debug Symbols to Sentry",
              },
            },
          },
        },
      },
    });
    const phases = (
      xcode?.modResults as {
        hash: {
          project: {
            objects: {
              PBXShellScriptBuildPhase: Record<string, { shellScript?: string } | string>;
            };
          };
        };
      }
    ).hash.project.objects.PBXShellScriptBuildPhase;
    const upload = phases.UPLOAD;
    const plain = phases.PLAIN;
    if (!upload || typeof upload === "string" || !upload.shellScript) {
      throw new Error("Sentry Xcode phase was not rewritten");
    }
    if (!plain || typeof plain === "string") {
      throw new Error("unrelated Xcode phase was dropped");
    }
    expect(JSON.parse(upload.shellScript)).toContain("export SENTRY_DISABLE_AUTO_UPLOAD=true\n");
    expect(plain.shellScript).toBe(plainPhase);
  });

  it("leaves Gradle and Xcode scripts alone when they are not Sentry's", () => {
    expect(appConfig.disableSentryGradleUpload("android {\n}\n")).toBe("android {\n}\n");
    const plain = JSON.stringify("echo hi");
    expect(appConfig.disableSentryXcodeShellScript(plain)).toBe(plain);
    const once = appConfig.disableSentryGradleUpload(GRADLE_WITH_SENTRY);
    expect(appConfig.disableSentryGradleUpload(once)).toBe(once);
    const disabled = appConfig.disableSentryXcodeShellScript(
      JSON.stringify("/bin/sh sentry-xcode-debug-files.sh"),
    );
    expect(appConfig.disableSentryXcodeShellScript(disabled)).toBe(disabled);
  });
});
