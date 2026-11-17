import { Linking } from "react-native";
import { Mail, ShieldAlert } from "lucide-react-native";
import { useAuth } from "../auth/AuthProvider";
import { DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import { reportError } from "../lib/reportError";
import { useConfig } from "../providers/ConfigProvider";
import { CenteredState } from "./auth/authParts";

/** TM-08b: an account with no mobile role. Email support and Sign out only. */
export function UnsupportedRoleScreen() {
  const { signOut } = useAuth();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;

  return (
    <CenteredState
      testID="unsupported-role"
      icon={(color) => <ShieldAlert color={color} size={30} strokeWidth={1.9} />}
      title="This account can't use the app yet"
      body="Your account doesn't have a coach or client role. Contact support and we'll sort it out."
      actionTint
      action={{
        label: "Email support",
        icon: (color) => <Mail color={color} size={20} strokeWidth={2} />,
        onPress: () => {
          void Linking.openURL(
            `mailto:${supportEmail}?subject=${encodeURIComponent("FitBud support · Account can't use the app")}`,
          ).catch((error: unknown) => {
            reportError("UnsupportedRoleScreen.emailSupport", error);
          });
        },
      }}
      link={{ label: "Sign out", onPress: signOut }}
    />
  );
}
