import { useEffect, type ComponentType, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./src/auth/AuthProvider";
import { CaptureBridgeActivator } from "./src/dev/CaptureBridgeActivator";
import { initSentry, wrapWithSentry } from "./src/lib/sentry";
import { AppRouter } from "./src/navigation/AppRouter";
import { ConfigProvider } from "./src/providers/ConfigProvider";
import { FontsProvider } from "./src/providers/FontsProvider";
import { SystemBars } from "./src/providers/SystemBars";
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { SyncProvider } from "./src/sync/SyncProvider";
import { ensureAndroidNotificationChannels } from "./src/notifications/androidChannels";
import { ensureMealNotificationActions } from "./src/notifications/nativeActions";
import { NotificationOpenListener } from "./src/notifications/openListener";

initSentry();

/**
 * Device check for Z12-36: a dev build started with
 * EXPO_PUBLIC_PRIMITIVE_GALLERY=1 opens on the primitive gallery (opted in to
 * the system theme) instead of the app, so the harness can screenshot every
 * primitive in light and dark. The require sits behind `__DEV__` and the
 * inlined env flag, so Metro's constant folding drops it (and the gallery
 * module) from release bundles.
 */
let PrimitiveGallery: ComponentType | null = null;
if (__DEV__ && process.env.EXPO_PUBLIC_PRIMITIVE_GALLERY === "1") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only lazy load, kept out of release bundles
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

  return (
    // Tracks the system scheme live; no in-app switch (D-W12-12). Screens opt in to dark with <Screen v3>.
    <ThemeProvider>
      <ThemedRoot>
        <SystemBars />
        <FontsProvider>
          {PrimitiveGallery ? (
            <PrimitiveGallery />
          ) : (
            <ConfigProvider>
              <AuthProvider>
                <CaptureBridgeActivator />
                <NotificationOpenListener />
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
