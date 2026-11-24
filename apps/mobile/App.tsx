import { useEffect, type ComponentType, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./src/auth/AuthProvider";
import { CaptureBridgeActivator } from "./src/dev/CaptureBridgeActivator";
import { initSentry, wrapWithSentry } from "./src/lib/sentry";
import { AppRouter } from "./src/navigation/AppRouter";
import { ConfigProvider } from "./src/providers/ConfigProvider";
import { FontsProvider } from "./src/providers/FontsProvider";
import { useQaGalleryLink } from "./src/providers/qaGallery";
import { SystemBars } from "./src/providers/SystemBars";
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { SyncProvider } from "./src/sync/SyncProvider";
import { ensureAndroidNotificationChannels } from "./src/notifications/androidChannels";
import { ensureMealNotificationActions } from "./src/notifications/nativeActions";
import { NotificationOpenListener } from "./src/notifications/openListener";
import { installForegroundNotificationHandler } from "./src/notifications/foregroundHandler";
import { PushPermissionRegistrar } from "./src/notifications/usePushPermission";

initSentry();
installForegroundNotificationHandler();

/**
 * Primitive gallery for the Z12-36 device check (src/providers/qaGallery.ts).
 * Loaded only in a dev build started with EXPO_PUBLIC_PRIMITIVE_GALLERY=1 (it
 * then opens on the gallery) or in a device-gate build, which is made against
 * the runner's local API (`fitbud://qa/primitives` opens it). Both tests are
 * on values inlined at bundle time and are written as literal comparisons, so
 * Metro's constant folding removes the require, and the gallery module, from
 * every store and EAS build (they point at https://api…thefitbud.com).
 */
let PrimitiveGallery: ComponentType | null = null;
let galleryAtStart = false;
if (__DEV__ && process.env.EXPO_PUBLIC_PRIMITIVE_GALLERY === "1") {
  galleryAtStart = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- QA-only lazy load, kept out of store bundles
  PrimitiveGallery = require("./src/components/PrimitiveGallery").PrimitiveGallery;
} else if (
  process.env.EXPO_PUBLIC_API_BASE_URL === "http://127.0.0.1:8787" ||
  process.env.EXPO_PUBLIC_API_BASE_URL === "http://10.0.2.2:8787"
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- QA-only lazy load, kept out of store bundles
  PrimitiveGallery = require("./src/components/PrimitiveGallery").PrimitiveGallery;
}

/** Root view on the effective (root: light) background; opted-in screens paint their own. */
function ThemedRoot({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {children}
    </GestureHandlerRootView>
  );
}

function App() {
  useEffect(() => {
    void ensureAndroidNotificationChannels();
    void ensureMealNotificationActions();
  }, []);
  const showGallery = useQaGalleryLink(PrimitiveGallery !== null, galleryAtStart);

  return (
    // Tracks the system scheme live; no in-app switch (D-W12-12). Screens opt in to dark with <Screen v3>.
    <ThemeProvider>
      <ThemedRoot>
        <SystemBars />
        <FontsProvider>
          {showGallery && PrimitiveGallery ? (
            <PrimitiveGallery />
          ) : (
            <ConfigProvider>
              <AuthProvider>
                <CaptureBridgeActivator />
                <NotificationOpenListener />
                <PushPermissionRegistrar />
                <SyncProvider>
                  <AppRouter />
                </SyncProvider>
              </AuthProvider>
            </ConfigProvider>
          )}
        </FontsProvider>
      </ThemedRoot>
    </ThemeProvider>
  );
}

export default wrapWithSentry(App);
