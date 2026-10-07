import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { mobilePermittedRoles } from "../navigation/resolveRoute";

export function RoleSelectScreen() {
  const { me, selectRole, signOut } = useAuth();
  const roles = me ? mobilePermittedRoles(me.permittedRoles) : [];

  return (
    <Screen
      title="Choose mode"
      subtitle="This account has more than one FitBud role. Pick how you want to work on mobile."
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Roles on this account</Text>
        <Text style={styles.bannerBody}>{roles.join(" · ")}</Text>
      </View>

      {roles.includes("trainer") ? (
        <PrimaryButton
          label="Trainer quick-use"
          onPress={() => {
            void selectRole("trainer");
          }}
        />
      ) : null}

      {roles.includes("trainee") ? (
        <PrimaryButton
          label="Trainee daily execution"
          variant="secondary"
          onPress={() => {
            void selectRole("trainee");
          }}
        />
      ) : null}

      <PrimaryButton label="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.paleLavender,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    textTransform: "capitalize",
  },
});
