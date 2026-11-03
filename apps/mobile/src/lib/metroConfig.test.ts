import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Pins which file each shared package resolves to. A release (EAS) bundle must
// read the built `dist`; only the dev server may read `src` (D-W3-12). Expo and
// metro-resolver are stubbed because only this file's own logic is under test.
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, "../..");
const repoRoot = resolve(mobileRoot, "../..");
const configPath = join(mobileRoot, "metro.config.js");

type Resolved = { type: string; filePath: string };

function loadResolver(nodeEnv: string | undefined) {
  const Module = require("node:module") as {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const original = Module._load;
  const previousEnv = process.env.NODE_ENV;
  if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else process.env.NODE_ENV = nodeEnv;
  const delegated: string[] = [];
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "expo/metro-config") {
      return { getDefaultConfig: () => ({ resolver: {}, server: {} }) };
    }
    if (request === "metro-resolver") {
      return {
        resolve: (_ctx: unknown, name: string) => {
          delegated.push(name);
          return { type: "empty" };
        },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    Reflect.deleteProperty(require.cache, configPath);
    const config = require(configPath) as {
      resolver: {
        resolveRequest: (
          ctx: { originModulePath?: string },
          name: string,
          platform: string,
        ) => Resolved;
      };
    };
    return { resolveRequest: config.resolver.resolveRequest, delegated };
  } finally {
    Module._load = original;
    if (previousEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else process.env.NODE_ENV = previousEnv;
    Reflect.deleteProperty(require.cache, configPath);
  }
}

const rel = (p: string) => p.replace(repoRoot + sep, "").split(sep).join("/");
const ALL = ["tokens", "ui-mobile", "core", "contracts", "api-client"];

afterEach(() => {
  Reflect.deleteProperty(require.cache, configPath);
});

describe("metro.config.js package resolution", () => {
  it("a release bundle (NODE_ENV=production) resolves all five packages to dist", () => {
    const { resolveRequest } = loadResolver("production");
    for (const name of ALL) {
      const out = resolveRequest({}, `@fitbud/${name}`, "android");
      expect(rel(out.filePath)).toMatch(new RegExp(`^packages/${name}/dist/`));
    }
  });

  it("the dev server resolves contracts, api-client and core to src, the rest to dist", () => {
    const { resolveRequest } = loadResolver("development");
    for (const name of ["contracts", "api-client", "core"]) {
      expect(rel(resolveRequest({}, `@fitbud/${name}`, "android").filePath)).toBe(
        `packages/${name}/src/index.ts`,
      );
    }
    for (const name of ["tokens", "ui-mobile"]) {
      expect(rel(resolveRequest({}, `@fitbud/${name}`, "android").filePath)).toMatch(
        new RegExp(`^packages/${name}/dist/`),
      );
    }
  });

  it("only the dev server rewrites './x.js' inside package source", () => {
    const origin = join(repoRoot, "packages/contracts/src/index.ts");
    const dev = loadResolver("development");
    dev.resolveRequest({ originModulePath: origin }, "./auth.js", "android");
    expect(dev.delegated).toEqual(["./auth"]);

    const prod = loadResolver("production");
    prod.resolveRequest({ originModulePath: origin }, "./auth.js", "android");
    expect(prod.delegated).toEqual(["./auth.js"]);
  });
});
