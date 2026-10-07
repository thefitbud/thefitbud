import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { AcceptInviteScreen } from "../screens/AcceptInviteScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { IntakeScreen } from "../screens/IntakeScreen";
import { RoleSelectScreen } from "../screens/RoleSelectScreen";
import { UnsupportedRoleScreen } from "../screens/UnsupportedRoleScreen";
import { WaitingReviewScreen } from "../screens/WaitingReviewScreen";
import { TrainerShell } from "../trainer/TrainerShell";
import { TraineeShell } from "../trainee/TraineeShell";

export function AppRouter() {
  const { route, errorMessage, refreshSession, signOut, clearError } = useAuth();

  if (route.name === "loading") {
    return (
      <View style={styles.loading} accessibilityLabel="Loading">
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  if (errorMessage && route.name !== "auth") {
    return (
      <Screen
        title="Something went wrong"
        subtitle="We could not load your coaching account."
      >
        <ErrorBanner message={errorMessage} />
        <PrimaryButton
          label="Retry"
          onPress={() => {
            clearError();
            void refreshSession();
          }}
        />
        <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  switch (route.name) {
    case "auth":
      return <AuthScreen />;
    case "unsupported_role":
      return <UnsupportedRoleScreen />;
    case "role_select":
      return <RoleSelectScreen />;
    case "accept_invite":
      return <AcceptInviteScreen />;
    case "intake":
      return <IntakeScreen relationshipId={route.relationshipId} />;
    case "waiting_review":
      return <WaitingReviewScreen relationship={route.relationship} />;
    case "trainee_shell":
      return <TraineeShell relationship={route.relationship} />;
    case "trainer_shell":
      return <TrainerShell />;
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
