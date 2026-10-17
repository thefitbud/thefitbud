import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { stage1Api } from "../lib/stage1Api";
import { createTestIdToken } from "../lib/testToken";
import {
  installCaptureGlobals,
  isCaptureModeEnabled,
  registerAuthCaptureNav,
} from "./captureBridge";

const DEMO_PASSWORD = "FitBud-demo-2026";

export function CaptureBridgeActivator() {
  const { api, signInWithToken, signOut, selectRole } = useAuth();
  const s1 = stage1Api(api);

  useEffect(() => {
    if (!isCaptureModeEnabled()) return;
    installCaptureGlobals();

    registerAuthCaptureNav({
      signOut,
      async signInWithPassword(email, password) {
        signOut();
        await new Promise((r) => setTimeout(r, 300));
        const result = await s1.login({ identifier: email, password });
        await signInWithToken(result.token);
      },
      async signInWithTestInvite() {
        signOut();
        await new Promise((r) => setTimeout(r, 300));
        const token = createTestIdToken(
          "demo-anita-invite",
          "anita.invite@demo.fitbud.test",
        );
        await signInWithToken(token);
      },
      async selectTrainerRole() {
        await selectRole("trainer");
      },
      async selectTraineeRole() {
        await selectRole("trainee");
      },
    });

    return () => registerAuthCaptureNav(null);
  }, [api, signInWithToken, signOut, selectRole, s1]);

  return null;
}
