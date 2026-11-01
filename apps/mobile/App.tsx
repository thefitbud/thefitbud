import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./src/auth/AuthProvider";
import { CaptureBridgeActivator } from "./src/dev/CaptureBridgeActivator";
import { AppRouter } from "./src/navigation/AppRouter";
import { ConfigProvider } from "./src/providers/ConfigProvider";
import { FontsProvider } from "./src/providers/FontsProvider";
import { SyncProvider } from "./src/sync/SyncProvider";
import { ensureAndroidNotificationChannels } from "./src/notifications/androidChannels";
import { ensureMealNotificationActions } from "./src/notifications/nativeActions";
import { NotificationOpenListener } from "./src/notifications/openListener";

export default function App() {
  useEffect(() => {
    void ensureAndroidNotificationChannels();
    void ensureMealNotificationActions();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FontsProvider>
        <ConfigProvider>
          <AuthProvider>
            <CaptureBridgeActivator />
            <NotificationOpenListener />
            <SyncProvider>
              <AppRouter />
              <StatusBar style="dark" />
            </SyncProvider>
          </AuthProvider>
        </ConfigProvider>
      </FontsProvider>
    </GestureHandlerRootView>
  );
}
