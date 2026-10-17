import { tagline } from "@fitbud/tokens";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export { tagline };

export const brandPaths = {
  markSvg: join(root, "logo/mark.svg"),
  markWhiteSvg: join(root, "logo/mark-white.svg"),
  markDarkSvg: join(root, "logo/mark-dark.svg"),
  faviconIco: join(root, "favicon/favicon.ico"),
  favicon16: join(root, "favicon/favicon-16.png"),
  favicon32: join(root, "favicon/favicon-32.png"),
  appleTouchIcon: join(root, "favicon/apple-touch-icon.png"),
  icon192: join(root, "favicon/icon-192.png"),
  icon512: join(root, "favicon/icon-512.png"),
  appIcon: join(root, "app/icon.png"),
  splash: join(root, "app/splash.png"),
  adaptiveForeground: join(root, "app/adaptive-foreground.png"),
} as const;
