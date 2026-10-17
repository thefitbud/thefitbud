import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/auth/AuthProvider";
import { CaptureBridgeActivator } from "./src/dev/CaptureBridgeActivator";
import { AppRouter } from "./src/navigation/AppRouter";
import { ConfigProvider } from "./src/providers/ConfigProvider";
import { FontsProvider } from "./src/providers/FontsProvider";
import { SyncProvider } from "./src/sync/SyncProvider";

export default function App() {
  return (
    <FontsProvider>
      <ConfigProvider>
        <AuthProvider>
          <CaptureBridgeActivator />
          <SyncProvider>
            <AppRouter />
            <StatusBar style="dark" />
          </SyncProvider>
        </AuthProvider>
      </ConfigProvider>
    </FontsProvider>
  );
}
