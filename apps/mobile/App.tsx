import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/auth/AuthProvider";
import { AppRouter } from "./src/navigation/AppRouter";
import { SyncProvider } from "./src/sync/SyncProvider";

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <AppRouter />
        <StatusBar style="dark" />
      </SyncProvider>
    </AuthProvider>
  );
}
