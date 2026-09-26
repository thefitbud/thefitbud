import { Text } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";

export function UnsupportedRoleScreen() {
  const { me, signOut } = useAuth();
  const roles = me?.permittedRoles.join(", ") ?? "none";

  return (
    <Screen
      title="No mobile role"
      subtitle="FitBud mobile supports trainer quick-use and trainee daily execution. This account has neither role on mobile."
    >
      <Text>
        Your account roles ({roles}) are not available on the mobile surface.
        Sign out and use a trainer or trainee test identity.
      </Text>
      <PrimaryButton label="Sign out" onPress={signOut} />
    </Screen>
  );
}
