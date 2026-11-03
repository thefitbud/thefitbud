const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");
const fs = require("fs");
const http = require("http");
const path = require("path");

const API_PROXY_TARGET = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:8787"
).replace(/\/$/, "");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

/**
 * Shared packages (D-W3-12). `dist` is gitignored build output that `git pull`
 * and `expo start -c` never rebuild: a stale `packages/contracts/dist` once
 * made a correct sign-in code show "That code didn't work". So the Metro dev
 * server bundles package SOURCE for the packages in SOURCE_IN_DEV; release
 * bundles (EAS sets NODE_ENV=production) keep resolving the built `dist`.
 * tokens and ui-mobile stay on `dist` (build-time generated output), guarded
 * by the stale-dist warning below and the `predev`/`prestart` builds in
 * package.json.
 */
const isDevServer = process.env.NODE_ENV !== "production";

const packageDir = (name) => path.resolve(monorepoRoot, "packages", name);
const distEntry = (name, file = "index.js") =>
  path.join(packageDir(name), "dist", file);
const srcEntry = (name) => path.join(packageDir(name), "src", "index.ts");

const SOURCE_IN_DEV = ["contracts", "api-client", "core"];

const workspacePackages = {
  "@fitbud/tokens": distEntry("tokens", "tokens.js"),
  "@fitbud/ui-mobile": distEntry("ui-mobile"),
  "@fitbud/core": distEntry("core"),
  "@fitbud/contracts": distEntry("contracts"),
  "@fitbud/api-client": distEntry("api-client"),
};
if (isDevServer) {
  for (const name of SOURCE_IN_DEV) {
    workspacePackages[`@fitbud/${name}`] = srcEntry(name);
  }
}

function newestSourceMtimeMs(dir) {
  let newest = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtimeMs(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

/** One line in the Metro terminal per bundled `dist` that is missing or out of date. */
function warnOnStaleDist() {
  for (const [name, file] of Object.entries(workspacePackages)) {
    if (!file.includes(`${path.sep}dist${path.sep}`)) continue;
    const pkg = name.replace("@fitbud/", "");
    let distTime = 0;
    try {
      distTime = fs.statSync(file).mtimeMs;
    } catch {
      // A missing dist is reported below.
    }
    if (
      distTime === 0 ||
      newestSourceMtimeMs(path.join(packageDir(pkg), "src")) > distTime
    ) {
      console.warn(
        `[fitbud] packages/${pkg}/dist is missing or older than its src. ` +
          "Run `pnpm -w run build:packages`, or start with `pnpm dev`.",
      );
    }
  }
}
if (isDevServer) warnOnStaleDist();

/** Package source imports siblings as "./x.js" (NodeNext); Metro needs "./x". */
const isPackageSource = (originModulePath) =>
  /[\\/]packages[\\/](contracts|api-client|core)[\\/]src[\\/]/.test(
    originModulePath ?? "",
  );

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (workspacePackages[moduleName]) {
    return { type: "sourceFile", filePath: workspacePackages[moduleName] };
  }
  if (
    isDevServer &&
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    isPackageSource(context.originModulePath)
  ) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      const url = req.url ?? "";
      if (!url.startsWith("/__fitbud_api")) {
        return middleware(req, res, next);
      }

      const upstreamPath = url.replace(/^\/__fitbud_api/, "") || "/";
      const target = new URL(API_PROXY_TARGET);
      const proxyReq = http.request(
        {
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: upstreamPath,
          method: req.method,
          headers: {
            ...req.headers,
            host: target.host,
            origin: API_PROXY_TARGET,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (error) => {
        res.statusCode = 502;
        res.end(`FitBud API proxy error: ${error.message}`);
      });
      req.pipe(proxyReq);
    };
  },
};

module.exports = config;
