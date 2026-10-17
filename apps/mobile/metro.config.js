const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

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
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
