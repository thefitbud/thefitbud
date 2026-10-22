const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");
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

const workspacePackages = {
  "@fitbud/tokens": path.resolve(monorepoRoot, "packages/tokens/dist/tokens.js"),
  "@fitbud/ui-mobile": path.resolve(monorepoRoot, "packages/ui-mobile/dist/index.js"),
  "@fitbud/core": path.resolve(monorepoRoot, "packages/core/dist/index.js"),
  "@fitbud/contracts": path.resolve(monorepoRoot, "packages/contracts/dist/index.js"),
  "@fitbud/api-client": path.resolve(monorepoRoot, "packages/api-client/dist/index.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (workspacePackages[moduleName]) {
    return { type: "sourceFile", filePath: workspacePackages[moduleName] };
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
