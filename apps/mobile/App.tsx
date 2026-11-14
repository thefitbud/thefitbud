import { useEffect, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./src/auth/AuthProvider";
import { PrimitiveGallery } from "./src/components/PrimitiveGallery";
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
 * EXPO_PUBLIC_PRIMITIVE_GALLERY=1 opens on the primitive gallery (following
 * the system theme) instead of the app, so the harness can screenshot every
 * primitive in light and dark. Never in a release build.
 */
const SHOW_PRIMITIVE_GALLERY =
  typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_PRIMITIVE_GALLERY === "1";

/** Root view on the theme background, so no white flashes behind screens in dark. */
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
    // The theme follows the system setting live; there is no in-app switch (D-W12-12).
    <ThemeProvider>
      <ThemedRoot>
        <SystemBars />
        <FontsProvider>
          {SHOW_PRIMITIVE_GALLERY ? (
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
